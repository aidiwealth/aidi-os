// Company details from its website: name, one-line description, logo, social links and (when the site publishes it)
// location and founding year. Given only a name, likely addresses (name.com, .ai, .io, .co) are tried and kept only
// when the page is clearly that company. Public websites only (no private or internal addresses).
import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

export interface CompanyInfo { name: string | null; website: string; domain: string; description: string | null; logo_doc_id: string | null; socials: Record<string, string>; location: string | null; founded: string | null; fetched_at: string }

// Public addresses only. The check runs inside the connection's own DNS lookup, so the address that is checked is the
// address that is connected to (a domain that re-points to an internal address between check and connect gets nowhere).
function v4Private(ip: string): boolean {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return true
  const [a, b] = p as [number, number, number, number]
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19))
}
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip)
  if (isIP(ip) !== 6) return true
  const s = ip.toLowerCase()
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (mapped) return v4Private(mapped[1]!)
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s) || /^64:ff9b:/.test(s)) return true
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^2001:db8/.test(s) || /^100::/.test(s) || /^::/.test(s)
}
function safeLookup(host: string, opts: { all?: boolean }, cb: (err: Error | null, addr?: string | { address: string; family: number }[], family?: number) => void) {
  dnsLookup(host, { all: true }, (err, addrs) => {
    if (err) return cb(err)
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }))
    if (opts.all) cb(null, addrs); else cb(null, addrs[0]!.address, addrs[0]!.family)
  })
}
function checkUrl(u: URL) {
  if (!/^https?:$/.test(u.protocol) || isIP(u.hostname.replace(/^\[|\]$/g, '')) || !u.hostname.includes('.') || /(^|\.)(local|internal|localhost)$/i.test(u.hostname) || (u.port && !['80', '443'].includes(u.port))) throw apiError('invalid', 'Use the company\'s public website address.')
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
function request(u: URL, accept: string, max: number): Promise<{ status: number; location: string | null; type: string; body: Buffer } | null> {
  return new Promise((resolve) => {
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get(u, { headers: { 'user-agent': UA, accept, 'accept-encoding': 'identity' }, lookup: safeLookup as never, timeout: 9000 }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: res.headers.location ?? null, type: '', body: Buffer.alloc(0) }) }
      const chunks: Buffer[] = []; let n = 0
      res.on('data', (c: Buffer) => { chunks.push(c); n += c.length; if (n > max) { res.destroy(); resolve({ status, location: null, type: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks).subarray(0, max) }) } })
      res.on('end', () => resolve({ status, location: null, type: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks).subarray(0, max) }))
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) }); req.on('error', () => resolve(null))
  })
}
// Follows up to 4 redirects, checking each address; stops reading after `max` bytes.
async function getUrl(url: string, max = 1_500_000, accept = 'text/html,*/*'): Promise<{ url: string; type: string; body: Buffer } | null> {
  let u = new URL(url)
  for (let i = 0; i < 5; i++) {
    checkUrl(u)
    const r = await request(u, accept, max)
    if (!r) return null
    if (r.status >= 300 && r.status < 400 && r.location) { u = new URL(r.location, u); continue }
    if (r.status < 200 || r.status >= 300) return null
    return { url: u.toString(), type: r.type, body: r.body }
  }
  return null
}
export function normalizeSite(input: string): string | null {
  let s = input.trim(); if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try { const u = new URL(s); if (!u.hostname.includes('.')) return null; return 'https://' + u.hostname.toLowerCase() } catch { return null }
}
const dec = (s: string | null | undefined) => (s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
export function parseCompanyPage(html: string, base: string) {
  return parse(html, base)
}
function parse(html: string, base: string) {
  const head = html.slice(0, 400_000)
  const meta = (k: string) => dec(head.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + k + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'))?.[1] ?? head.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + k + '["\']', 'i'))?.[1]) || null
  const title = dec(head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]) || null
  const abs = (h: string | undefined | null) => { if (!h) return null; try { return new URL(dec(h), base).toString() } catch { return null } }
  const icons: { href: string; size: number; rel: string }[] = []
  for (const m of head.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0], rel = tag.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? ''
    if (!/icon/.test(rel)) continue
    const href = abs(tag.match(/href=["']([^"']+)["']/i)?.[1]); if (!href) continue
    const size = Number(tag.match(/sizes=["'](\d+)x\d+["']/i)?.[1] ?? (/apple/.test(rel) ? 180 : /\.svg/i.test(href) ? 256 : 32))
    icons.push({ href, size, rel })
  }
  let ld: Record<string, any> | null = null
  for (const m of head.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]!); const arr = Array.isArray(j) ? j : j['@graph'] ?? [j]; const o = arr.find((x: any) => /Organization|Corporation/.test(String(x?.['@type']))); if (o) { ld = o; break } } catch { /* skip */ }
  }
  const socials: Record<string, string> = {}
  for (const [k, re] of [['linkedin', /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]+/i], ['x', /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home)[A-Za-z0-9_]{2,30}/i], ['crunchbase', /https?:\/\/(?:www\.)?crunchbase\.com\/organization\/[a-z0-9-]+/i], ['github', /https?:\/\/(?:www\.)?github\.com\/(?!features|about|login)[A-Za-z0-9-]{2,40}/i]] as const) {
    const m = html.match(re); if (m) socials[k] = m[0]
  }
  const ldLogo = typeof ld?.logo === 'string' ? ld.logo : ld?.logo?.url
  const addr = ld?.address ? [ld.address.addressLocality, ld.address.addressRegion, ld.address.addressCountry?.name ?? ld.address.addressCountry].filter((x: unknown) => typeof x === 'string' && x).join(', ') : ''
  return { title, site: meta('og:site_name') ?? (typeof ld?.name === 'string' ? ld.name : null), description: meta('og:description') ?? meta('description') ?? (typeof ld?.description === 'string' ? dec(ld.description) : null),
    logos: [abs(ldLogo), ...icons.sort((a, b) => b.size - a.size).map((i) => i.href), abs('/favicon.ico')].filter((x): x is string => !!x), socials, location: addr || null, founded: ld?.foundingDate ? String(ld.foundingDate).slice(0, 10) : null }
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
// The company's own name from the page: the site name, else the title before " | ", " - " or ":".
function nameOf(p: ReturnType<typeof parse>): string | null {
  const t = p.site || (p.title ?? '').split(/\s+[|\-–—:·]\s+/)[0] || null
  return t ? t.slice(0, 120) : null
}
async function storeLogo(urls: string[], domain: string): Promise<string | null> {
  for (const u of [...urls.slice(0, 4), 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=128']) {
    const r = await getUrl(u, 600_000, 'image/*').catch(() => null)
    if (!r || r.body.length < 100) continue
    const type = r.type.split(';')[0]!.trim().toLowerCase()
    const mime = /^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type) ? type : /\.svg(\?|$)/i.test(r.url) ? 'image/svg+xml' : /\.png(\?|$)/i.test(r.url) ? 'image/png' : /\.ico(\?|$)/i.test(r.url) ? 'image/x-icon' : ''
    if (!mime) continue
    const id = randomUUID(), ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('icon') ? 'ico' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg', key = 'documents/' + id + '.' + ext
    await putObject({ key, body: new Uint8Array(r.body), contentType: mime })
    await db().query("INSERT INTO core.documents (public_media, id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES (true, $1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Company logo — ' + domain + '.' + ext, key, mime, r.body.length, createHash('sha256').update(r.body).digest('hex')])
    return id
  }
  return null
}
// Look a company up by website, or by name when there is no website.
export async function companyInfo(input: { name?: string | null; website?: string | null }): Promise<CompanyInfo | null> {
  let site = input.website ? normalizeSite(input.website) : null
  let page: { url: string; body: Buffer } | null = null
  if (site) page = await getUrl(site).catch((e) => { if ((e as { statusCode?: number }).statusCode === 400) throw e; return null })
  else if (input.name && input.name.trim().length >= 2) {
    const slug = squash(input.name)
    for (const tld of ['com', 'ai', 'io', 'co', 'xyz', 'app']) {
      const cand = 'https://' + slug + '.' + tld
      const r = await getUrl(cand).catch(() => null)
      if (!r) continue
      const p = parse(r.body.toString('utf8'), r.url)
      const nm = squash(nameOf(p) ?? '') + ' ' + squash(p.title ?? '')
      if (nm.includes(slug)) { site = 'https://' + new URL(r.url).hostname.replace(/^www\./, ''); page = r; break }
    }
  }
  if (!site || !page) return null
  const p = parse(page.body.toString('utf8'), page.url)
  const domain = new URL(page.url).hostname.replace(/^www\./, '')
  return { name: nameOf(p) ?? input.name ?? null, website: 'https://' + domain, domain, description: p.description ? p.description.slice(0, 400) : null, logo_doc_id: await storeLogo(p.logos, domain).catch(() => null),
    socials: p.socials, location: p.location, founded: p.founded, fetched_at: new Date().toISOString() }
}
