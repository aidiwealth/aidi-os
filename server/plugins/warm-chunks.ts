// After a deploy or restart, the first visit to each page used to wait about a second while the server loaded that
// page's code. A few seconds after start-up the server loads all of it in the background instead, one file at a time,
// so first visits are as quick as later ones, and opens a few database connections ahead of the first visitors. It goes
// gently (a pause between files) so a one-CPU server keeps answering while it works. Production only; failures are
// ignored (the page loads it when needed).
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
export default defineNitroPlugin(() => {
  if (import.meta.dev || !process.argv[1]) return
  const root = join(dirname(process.argv[1]), 'chunks')
  setTimeout(() => { warmPool().catch(() => {}) }, 1000)
  setTimeout(async () => {
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p) } }
    try { walk(root) } catch { return }
    const t0 = Date.now(); let n = 0
    for (const f of files) { try { await import(pathToFileURL(f).href); n++ } catch { /* loaded on demand instead */ } await new Promise((r) => setTimeout(r, 5)) }
    console.log('[warm] loaded ' + n + ' of ' + files.length + ' server files in ' + (Date.now() - t0) + 'ms')
  }, 8000)
})
