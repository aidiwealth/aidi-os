// Company isolation checks. Run with `npm run test:isolation` (the run scripts do, after the migrations).
//  1. The back-door register: every place the server reads across companies (asPlatform) is listed in
//     tests/isolation/platform-uses.json with how many times it is used. A new use, or more uses in a file, fails until
//     someone has read it and run `npm run test:isolation -- --update`. Fewer uses are fine (the list shrinks itself).
//  2. The database checks in tests/isolation/database.sql, when ADMIN_DATABASE_URL is set: row-level security on every
//     company table, and a leak test as the app's own database role (read-only, rolled back).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const regPath = join(root, 'tests/isolation/platform-uses.json')
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|mjs|js)$/.test(f) ? [p] : [] })
const now = {}
for (const f of walk(join(root, 'server'))) {
  const n = (readFileSync(f, 'utf8').match(/\basPlatform\(/g) ?? []).length
  if (n && !f.endsWith('server/utils/db.ts')) now[relative(root, f)] = n
}
let failed = 0
const update = process.argv.includes('--update')
const reg = (() => { try { return JSON.parse(readFileSync(regPath, 'utf8')) } catch { return {} } })()
if (update) {
  writeFileSync(regPath, JSON.stringify(Object.fromEntries(Object.entries(now).sort()), null, 1) + '\n')
  console.log('ok   back-door register updated: ' + Object.keys(now).length + ' files, ' + Object.values(now).reduce((a, b) => a + b, 0) + ' uses')
} else {
  const grew = Object.entries(now).filter(([f, n]) => n > (reg[f] ?? 0))
  if (grew.length) {
    failed++
    console.log('FAIL back-door register: new reads across companies (asPlatform) that nobody has signed off:')
    for (const [f, n] of grew) console.log('       ' + f + ': ' + (reg[f] ?? 0) + ' → ' + n)
    console.log('     Check each one only reaches what it must (sign-in, public links, the platform console), then run: npm run test:isolation -- --update')
  } else {
    const shrunk = Object.keys(reg).some((f) => (now[f] ?? 0) < reg[f])
    if (shrunk) writeFileSync(regPath, JSON.stringify(Object.fromEntries(Object.entries(now).sort()), null, 1) + '\n')
    console.log('ok   back-door register: ' + Object.values(now).reduce((a, b) => a + b, 0) + ' uses in ' + Object.keys(now).length + ' files, all signed off')
  }
}

const url = process.env.ADMIN_DATABASE_URL
if (!url) console.log('skip database checks: ADMIN_DATABASE_URL is not set')
else {
  const r = spawnSync('psql', [url, '-q', '-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'tests/isolation/database.sql')], { encoding: 'utf8' })
  const out = (r.stdout + r.stderr).split('\n').map((l) => l.replace(/^psql:[^ ]+ (NOTICE|ERROR):\s+/, '')).filter((l) => l.trim() && !/^CONTEXT:/.test(l))
  for (const l of out) console.log(/^(ok|skip)\b/.test(l) ? l : 'FAIL ' + l.replace(/^isolation: /, ''))
  if (r.status !== 0) failed++
}
if (failed) { console.log('\nCompany isolation checks failed.'); process.exit(1) }
