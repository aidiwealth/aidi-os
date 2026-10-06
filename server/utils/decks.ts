// Decks: shareable, versioned PDFs with per-visitor, per-slide analytics.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
export const deckUrl = async (token: string) => ((await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/deck/' + token
export async function storeDeckPdf(data: Uint8Array, filename: string): Promise<string> {
  if (data.length > 50 * 1024 * 1024) throw apiError('too_large', 'Decks can be up to 50 MB.', 413)
  if (!(data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) throw apiError('bad_type', 'Upload the deck as a PDF.')
  const id = randomUUID(), key = 'documents/' + id + '.pdf', name = filename.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'deck.pdf'
  await putObject({ key, body: data, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,'application/pdf',$4,$5)", [id, name, key, data.length, createHash('sha256').update(data).digest('hex')])
  return id
}
export const newDeckToken = () => randomBytes(12).toString('base64url')
export function deckStats(visits: { email: string | null; visitor_key: string | null; seconds: number; downloads: number; slides: Record<string, number>; pages: number | null }[]) {
  const total = visits.length, unique = new Set(visits.map((v) => v.email || v.visitor_key)).size
  const avg = total ? Math.round(visits.reduce((a, v) => a + v.seconds, 0) / total) : 0
  const slideTotals: Record<string, { seconds: number; views: number }> = {}
  for (const v of visits) for (const [k, s] of Object.entries(v.slides ?? {})) { const e = slideTotals[k] ?? { seconds: 0, views: 0 }; e.seconds += s; e.views += 1; slideTotals[k] = e }
  const slideViews = Object.values(slideTotals).reduce((a, x) => a + x.views, 0)
  return { total, unique, avg_seconds: avg, avg_per_slide: slideViews ? Math.round(Object.values(slideTotals).reduce((a, x) => a + x.seconds, 0) / slideViews) : 0, downloads: visits.reduce((a, v) => a + v.downloads, 0), slides: slideTotals }
}
