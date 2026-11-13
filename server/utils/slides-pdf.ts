// PowerPoint (.pptx) decks are turned into PDF on upload, on our own server, with LibreOffice (installed at build
// time from the Aptfile). One conversion runs at a time to keep memory in check; nothing leaves the server.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

export const isPptx = (d: Uint8Array, name: string) => /\.pptx$/i.test(name) && d[0] === 0x50 && d[1] === 0x4b && d[2] === 0x03 && d[3] === 0x04

let found: string | null | undefined
function soffice(): string | null {
  if (found !== undefined) return found
  const c: string[] = []
  if (process.env.SOFFICE_PATH) c.push(process.env.SOFFICE_PATH)
  for (const d of (process.env.PATH ?? '').split(delimiter)) if (d) c.push(join(d, 'soffice'), join(d, 'libreoffice'))
  // Packages from the Aptfile land outside the usual folders, so look where the build puts them.
  const roots = ['/layers', '/workspace/.apt', '/app/.apt', process.cwd() + '/.apt', '/usr', '/opt']
  for (const r of roots) {
    c.push(join(r, 'lib/libreoffice/program/soffice'), join(r, 'usr/lib/libreoffice/program/soffice'))
    if (r === '/layers' && existsSync(r)) for (const a of safeLs(r)) for (const b of safeLs(join(r, a))) c.push(join(r, a, b, 'usr/lib/libreoffice/program/soffice'))
    if (r === '/opt' && existsSync(r)) for (const a of safeLs(r)) if (/^libreoffice/i.test(a)) c.push(join(r, a, 'program/soffice'))
  }
  found = c.find((p) => existsSync(p)) ?? null
  return found
}
function safeLs(d: string) { try { return readdirSync(d) } catch { return [] } }

let queue: Promise<unknown> = Promise.resolve()
export function pptxToPdf(data: Uint8Array): Promise<Uint8Array> {
  const run = queue.then(() => convert(data), () => convert(data))
  queue = run.catch(() => undefined)
  return run
}

async function convert(data: Uint8Array): Promise<Uint8Array> {
  const bin = soffice()
  if (!bin) throw apiError('bad_type', "PowerPoint upload isn't ready yet. Save the deck as a PDF and upload that.")
  const dir = await mkdtemp(join(tmpdir(), 'deck-'))
  try {
    const src = join(dir, 'deck.pptx')
    await writeFile(src, data)
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(bin, ['--headless', '--invisible', '--norestore', '--nolockcheck', '--nodefault', '-env:UserInstallation=file://' + join(dir, 'profile'), '--convert-to', 'pdf:impress_pdf_Export', '--outdir', dir, src], { stdio: 'ignore', env: { ...process.env, HOME: dir, SAL_USE_VCLPLUGIN: 'svp' } })
      const t = setTimeout(() => { p.kill('SIGKILL'); resolve(false) }, 120_000)
      p.on('error', () => { clearTimeout(t); resolve(false) })
      p.on('exit', (code) => { clearTimeout(t); resolve(code === 0) })
    })
    const out = join(dir, 'deck.pdf')
    if (!ok || !existsSync(out)) throw apiError('bad_type', "We couldn't read this PowerPoint. Save it as a PDF and upload that.")
    const pdf = new Uint8Array(await readFile(out))
    if (!(pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46)) throw apiError('bad_type', "We couldn't read this PowerPoint. Save it as a PDF and upload that.")
    return pdf
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined) }
}
