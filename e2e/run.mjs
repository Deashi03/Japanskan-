// Kör webbläsartesterna: bygger appen och kör alla filer i e2e/. Misslyckas en körning provas hela
// sviten en gång till innan något räknas som fel, så att ett enstaka hack i en testdator inte
// stoppar en publicering. Sätt SKIP_BUILD=1 om appen redan är byggd.
import { spawnSync } from 'node:child_process'

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: false })

if (!process.env.SKIP_BUILD) {
  const build = run('npm', ['run', 'build'])
  if (build.status !== 0) process.exit(build.status ?? 1)
}

for (let attempt = 1; attempt <= 2; attempt++) {
  const result = run('node', ['--test', '--test-concurrency=1', 'e2e/first-session.test.mjs', 'e2e/listening.test.mjs', 'e2e/mistakes.test.mjs', 'e2e/streak.test.mjs', 'e2e/wordlist.test.mjs'])
  if (result.status === 0) process.exit(0)
  if (attempt === 1) console.log('\nTesterna föll – provar en gång till för att utesluta ett tillfälligt fel.\n')
}
process.exit(1)
