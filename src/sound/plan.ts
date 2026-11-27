// Vilket ljud som hör till det n:te rätta svaret i rad. Ren logik, utan ljudkod.

/** 'ok' = vanligt svar, 'five' = 5, 15, 25 …, 't1'–'t5' = firande för 10, 20, 30, 40 och 50+. */
export type SoundKey = 'ok' | 'five' | 't1' | 't2' | 't3' | 't4' | 't5'

export const SOUND_KEYS: SoundKey[] = ['ok', 'five', 't1', 't2', 't3', 't4', 't5']

/** 10, 20, 30 … är milstolpar. Returnerar nivån (1 för 10, 2 för 20 …), annars 0. */
export const milestoneLevel = (n: number) => (n >= 10 && n % 10 === 0 ? n / 10 : 0)

/** Firandets nivå 1–5. Efter 50 i rad låter alla tiotal som nivå 5. */
export const celebrationTier = (n: number) => Math.min(5, milestoneLevel(n))

export function soundFor(n: number): SoundKey {
  const k = Math.max(1, Math.floor(n))
  const tier = celebrationTier(k)
  if (tier) return `t${tier}` as SoundKey
  return k % 5 === 0 ? 'five' : 'ok'
}
