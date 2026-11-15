// Build step: put LibreOffice inside the app (in .libreoffice/) so PowerPoint decks can be turned into PDFs on the
// server. It downloads LibreOffice Impress and every library it needs from Ubuntu 22.04's official archive, checks the
// archive's signature and each file's checksum, and unpacks the packages. Only runs on Linux x64 builds (the server);
// on a Mac it does nothing. If anything goes wrong it warns and the build carries on (PowerPoint upload then asks for
// a PDF instead). Set SKIP_LIBREOFFICE=1 to skip it.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'

const OUT = join(process.cwd(), '.libreoffice')
const MIRROR = 'https://archive.ubuntu.com/ubuntu'
const SUITES = ['jammy-updates', 'jammy-security', 'jammy'] // first one listing a package wins
const ROOTS = ['libreoffice-impress', 'fonts-liberation', 'fonts-dejavu-core', 'fonts-noto-core']
const SKIP = /^(gnupg|gpg|dirmngr|pinentry|libc6$|libc-bin$|libgcc-s1$|libstdc\+\+6$|perl|debconf|dpkg|coreutils|bash|dash|base-files|tar$|sed$|grep$|python3)/
const KEYRING = '/usr/share/keyrings/ubuntu-archive-keyring.gpg'
const log = (...a) => console.log('[libreoffice]', ...a)

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()) }
    catch (e) { if (i >= tries) throw new Error(url + ': ' + e.message); await new Promise((s) => setTimeout(s, 2000 * i)) }
  }
}
const sha = (b) => createHash('sha256').update(b).digest('hex')

async function index(suite) {
  const rel = await get(MIRROR + '/dists/' + suite + '/InRelease')
  if (existsSync(KEYRING)) {
    const f = join(OUT + '.tmp', suite + '.InRelease'); writeFileSync(f, rel)
    execFileSync('gpgv', ['--keyring', KEYRING, f], { stdio: 'ignore' }) // throws on a bad signature
  } else log('warning: no Ubuntu keyring here, checking checksums only')
  const want = rel.toString().match(/^ ([0-9a-f]{64})\s+\d+ main\/binary-amd64\/Packages\.gz$/m)?.[1]
  const gz = await get(MIRROR + '/dists/' + suite + '/main/binary-amd64/Packages.gz')
  if (sha(gz) !== want) throw new Error(suite + ' package list checksum mismatch')
  const pk = new Map()
  for (const blk of gunzipSync(gz).toString().split('\n\n')) {
    const d = {}; let last = ''
    for (const line of blk.split('\n')) { const m = line.match(/^([A-Za-z0-9-]+): ?(.*)$/); if (m) { d[m[1]] = m[2]; last = m[1] } else if (last && line.startsWith(' ')) d[last] += line }
    if (d.Package) pk.set(d.Package, d)
  }
  return pk
}

// Ubuntu's packages expect to live at the top of the disk (/usr, /etc, /var). Point every absolute link back inside
// the unpacked folder, and tell LibreOffice it lives where it is rather than in /usr/lib/libreoffice. Its settings
// files sit in share/.registry (Ubuntu links them into /etc when installing, a step that never runs here).
function relocate(root) {
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n), st = lstatSync(p)
    if (st.isSymbolicLink()) { const t = readlinkSync(p); if (t.startsWith('/')) { unlinkSync(p); symlinkSync(relative(dirname(p), join(root, t)) || '.', p) } }
    else if (st.isDirectory()) walk(p) } }
  walk(root)
  const rc = join(root, 'usr/lib/libreoffice/program/fundamentalrc')
  writeFileSync(rc, readFileSync(rc, 'utf8').replace(/^BRAND_BASE_DIR=.*$/m, 'BRAND_BASE_DIR=${ORIGIN}/..').replaceAll('file:///etc/libreoffice/registry', '${BRAND_BASE_DIR}/share/.registry').replace(' dconf:*', ''))
}

async function main() {
  if (process.env.SKIP_LIBREOFFICE || process.platform !== 'linux' || process.arch !== 'x64') return log('skipped on this machine')
  const stamp = sha(Buffer.from(JSON.stringify([ROOTS, SKIP.source, 5])))
  if (existsSync(join(OUT, '.ready')) && readFileSync(join(OUT, '.ready'), 'utf8') === stamp) return log('already in place')
  const t0 = Date.now()
  rmSync(OUT + '.tmp', { recursive: true, force: true }); mkdirSync(OUT + '.tmp', { recursive: true })
  const lists = await Promise.all(SUITES.map(index))
  const pick = (n) => { for (const l of lists) if (l.has(n)) return l.get(n) }
  const provides = new Map()
  for (const l of [...lists].reverse()) for (const [n, d] of l) for (const p of (d.Provides ?? '').split(',')) { const v = p.trim().split(' ')[0]; if (v) provides.set(v, n) }
  const seen = new Map(), stack = [...ROOTS]
  while (stack.length) {
    const n = stack.pop(); if (seen.has(n)) continue
    const d = pick(n); if (!d) continue
    seen.set(n, d)
    for (const field of ['Pre-Depends', 'Depends']) for (const alt of (d[field] ?? '').split(',')) {
      const opts = alt.split('|').map((x) => x.trim().split(' ')[0].split(':')[0]).filter(Boolean)
      const got = opts.find((o) => pick(o)) ?? opts.map((o) => provides.get(o)).find(Boolean)
      if (got) stack.push(got)
    }
  }
  // Base-system libraries are brought along too (only the C library and compiler runtime are left to the server), so it
  // never depends on what the server image happens to have; base-system programs are left out.
  const take = [...seen.values()].filter((d) => !SKIP.test(d.Package) && (d.Priority !== 'required' || /^(lib|zlib)/.test(d.Package)))
  log('downloading', take.length, 'packages')
  const root = OUT + '.new'; rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true })
  let i = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < take.length) {
      const d = take[i++]
      const deb = await get(MIRROR + '/' + d.Filename)
      if (sha(deb) !== d.SHA256) throw new Error(d.Package + ' checksum mismatch')
      const f = join(OUT + '.tmp', d.Package + '.deb'); writeFileSync(f, deb)
      execFileSync('dpkg-deb', ['-x', f, root]); rmSync(f)
    }
  }))
  if (!existsSync(join(root, 'usr/lib/libreoffice/program/soffice.bin'))) throw new Error('soffice.bin missing after unpacking')
  if (!existsSync(join(root, 'usr/lib/libreoffice/program/libreglo.so'))) throw new Error('libreglo.so missing after unpacking')
  relocate(root)
  writeFileSync(join(root, '.ready'), stamp)
  rmSync(OUT, { recursive: true, force: true }); execFileSync('mv', [root, OUT]); rmSync(OUT + '.tmp', { recursive: true, force: true })
  log('ready in', Math.round((Date.now() - t0) / 1000) + 's,', take.length, 'packages')
}
main().catch((e) => { console.warn('[libreoffice] warning: not installed (' + e.message + '). PowerPoint uploads will ask for a PDF.'); rmSync(OUT + '.tmp', { recursive: true, force: true }); rmSync(OUT + '.new', { recursive: true, force: true }) })
