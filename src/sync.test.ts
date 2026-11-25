import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './store'
import { byteSize, chunkBySize, syncOnce, type PushRow, type RemoteRow, type RowsApi } from './syncCore'
import type { Row } from './types'

/** En låtsasserver som beter sig som Supabase-tabellen: varje ändring får ett nytt löpnummer
 *  och en äldre skrivning ignoreras (senaste ändringen vinner). */
class FakeServer {
  rows = new Map<string, RemoteRow>()
  seq = 0
  upserts: PushRow[][] = []
  fetches: number[] = []
  failNext = 0
  onUpsert?: () => Promise<void>

  api(): RowsApi {
    return {
      upsert: async (rows) => {
        this.upserts.push(rows)
        if (this.failNext > 0) {
          this.failNext--
          return { error: { message: 'Tillfälligt serverfel' } }
        }
        await this.onUpsert?.()
        for (const r of rows) {
          const old = this.rows.get(r.id)
          if (old && r.updated_at <= Number(old.updated_at)) continue
          this.rows.set(r.id, { id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at, deleted: r.deleted, seq: ++this.seq })
        }
        return { error: null }
      },
      fetchSince: async (cursor, limit) => {
        this.fetches.push(limit)
        const data = [...this.rows.values()].filter((r) => Number(r.seq) > cursor).sort((a, b) => Number(a.seq) - Number(b.seq)).slice(0, limit)
        return { data, error: null }
      },
    }
  }
}

const noSleep = async () => {}
const word = (i: number, size = 2000): Row => ({ id: 'w:' + i, kind: 'word', data: { word: 'w' + i, filler: 'あ'.repeat(size) }, updatedAt: 1000 + i, deleted: false, dirty: 1 })

beforeEach(async () => {
  await db.rows.clear()
  await db.meta.clear()
})

describe('uppdelning i storleksbitar', () => {
  it('ingen omgång överstiger gränsen, och ingen rad försvinner', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ i, size: 10_000 + (i % 7) * 5000 }))
    const chunks = chunkBySize(items, 100_000, 8, (x) => x.size)
    expect(chunks.flat()).toEqual(items)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(8)
      // En omgång får bara överstiga gränsen om den är en enda stor rad.
      if (c.length > 1) expect(c.reduce((a, x) => a + x.size, 0)).toBeLessThanOrEqual(100_000)
    }
  })
  it('en rad som är större än gränsen skickas ensam', () => {
    const chunks = chunkBySize([1, 2, 3], 100, 10, (x) => (x === 2 ? 500 : 10))
    expect(chunks).toEqual([[1], [2], [3]])
  })
  it('tomt in ger tomt ut', () => expect(chunkBySize([], 100, 10)).toEqual([]))
})

describe('synk mot en låtsasserver', () => {
  it('stora mängder skickas i små omgångar och markeras som synkade', async () => {
    // 300 rader à ~6 KB (japanska tecken tar tre byte) – drygt 1,8 MB totalt.
    await db.rows.bulkPut(Array.from({ length: 300 }, (_, i) => word(i)))
    const server = new FakeServer()
    const progress: number[] = []
    const res = await syncOnce(server.api(), 'u1', { sleep: noSleep, onProgress: (d) => progress.push(d) })
    expect(res.pushed).toBe(300)
    expect(server.rows.size).toBe(300)
    expect(server.upserts.length).toBeGreaterThan(4)
    for (const batch of server.upserts) {
      expect(batch.length).toBeLessThanOrEqual(100)
      expect(byteSize(batch)).toBeLessThan(450_000)
    }
    expect(progress.at(-1)).toBe(300)
    expect(await db.rows.where('dirty').equals(1).count()).toBe(0)
    // Nästa runda skickar ingenting.
    const again = await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect(again.pushed).toBe(0)
  })

  it('en ny enhet hämtar allt i små sidor och minns var den var', async () => {
    const server = new FakeServer()
    await db.rows.bulkPut(Array.from({ length: 320 }, (_, i) => word(i)))
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    // Ny enhet: tom databas.
    await db.rows.clear()
    await db.meta.clear()
    server.fetches = []
    const res = await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect(res.pulled).toBe(320)
    expect(await db.rows.count()).toBe(320)
    expect(Math.max(...server.fetches)).toBeLessThanOrEqual(150)
    expect(server.fetches.length).toBeGreaterThanOrEqual(3)
    expect(await db.rows.where('dirty').equals(1).count()).toBe(0)
    // Andra rundan hämtar bara det som är nytt.
    server.fetches = []
    expect((await syncOnce(server.api(), 'u1', { sleep: noSleep })).pulled).toBe(0)
    expect(server.fetches).toHaveLength(1)
  })

  it('tillfälliga serverfel provas om och synken går igenom', async () => {
    await db.rows.bulkPut([word(1), word(2)])
    const server = new FakeServer()
    server.failNext = 2
    const sleeps: number[] = []
    const res = await syncOnce(server.api(), 'u1', { sleep: async (ms) => void sleeps.push(ms) })
    expect(res.pushed).toBe(2)
    expect(server.upserts).toHaveLength(3)
    expect(sleeps).toEqual([800, 2400])
    expect(server.rows.size).toBe(2)
  })

  it('ger upp efter tre försök, och det som redan skickats räknas som klart', async () => {
    // Två omgångar: den första går igenom, den andra misslyckas för gott.
    await db.rows.bulkPut(Array.from({ length: 150 }, (_, i) => word(i)))
    const server = new FakeServer()
    let calls = 0
    const api = server.api()
    const flaky: RowsApi = { ...api, upsert: async (rows) => (++calls >= 2 ? { error: { message: 'Nätverket föll' } } : api.upsert(rows)) }
    await expect(syncOnce(flaky, 'u1', { sleep: noSleep })).rejects.toThrow('Nätverket föll')
    const sent = server.rows.size
    expect(sent).toBeGreaterThan(0)
    expect(sent).toBeLessThan(150)
    expect(await db.rows.where('dirty').equals(1).count()).toBe(150 - sent)
    // Nästa runda skickar bara resten.
    server.upserts = []
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect(server.rows.size).toBe(150)
    expect(server.upserts.flat().length).toBe(150 - sent)
  })

  it('ett anrop som hänger sig avbryts efter tidsgränsen', async () => {
    await db.rows.bulkPut([word(1)])
    let calls = 0
    const hang: RowsApi = {
      upsert: () => (++calls < 3 ? new Promise(() => {}) : Promise.resolve({ error: null })),
      fetchSince: async () => ({ data: [], error: null }),
    }
    const res = await syncOnce(hang, 'u1', { sleep: noSleep, timeoutMs: 20 })
    expect(res.pushed).toBe(1)
    expect(calls).toBe(3)
  })

  it('en rad som ändras under pågående synk förblir osynkad', async () => {
    await db.rows.bulkPut([word(1), word(2)])
    const server = new FakeServer()
    server.onUpsert = async () => {
      await db.rows.update('w:1', { updatedAt: 99999, data: { word: 'ändrad' } })
      server.onUpsert = undefined
    }
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect((await db.rows.get('w:1'))?.dirty).toBe(1)
    expect((await db.rows.get('w:2'))?.dirty).toBe(0)
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect((server.rows.get('w:1')?.data as { word: string }).word).toBe('ändrad')
    expect((await db.rows.get('w:1'))?.dirty).toBe(0)
  })

  it('senaste ändringen vinner: en äldre skrivning ersätter inte en nyare, och nyare hämtas', async () => {
    const server = new FakeServer()
    server.rows.set('w:1', { id: 'w:1', kind: 'word', data: { word: 'server' }, updated_at: 5000, deleted: false, seq: ++server.seq })
    await db.rows.put({ id: 'w:1', kind: 'word', data: { word: 'lokal-gammal' }, updatedAt: 2000, deleted: false, dirty: 1 })
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect((server.rows.get('w:1')?.data as { word: string }).word).toBe('server')
    expect(((await db.rows.get('w:1'))?.data as { word: string }).word).toBe('server')
    expect((await db.rows.get('w:1'))?.dirty).toBe(0)
  })

  it('borttagningar och extrainnehåll synkas som vanliga rader', async () => {
    const server = new FakeServer()
    await db.rows.bulkPut([
      { id: 'x:1', kind: 'extra', data: { examples: [{ ja: 'あ', reading: 'あ', sv: 'a' }], forms: [] }, updatedAt: 10, deleted: false, dirty: 1 },
      { id: 'w:9', kind: 'word', data: null, updatedAt: 11, deleted: true, dirty: 1 },
    ])
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    await db.rows.clear()
    await db.meta.clear()
    await syncOnce(server.api(), 'u1', { sleep: noSleep })
    expect((await db.rows.get('x:1'))?.kind).toBe('extra')
    expect((await db.rows.get('w:9'))?.deleted).toBe(true)
  })
})
