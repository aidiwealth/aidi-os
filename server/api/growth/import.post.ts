// Bring a spreadsheet into Sales, Marketing or Banking: a dropped file (Excel or CSV) brought in once, or a sheet link
// (Google Sheets, Excel online, Dropbox) brought in and, when asked, kept in step.
import { z } from 'zod'
const Kind = z.enum(['sales_deals', 'marketing_months', 'bank_txns'])
export default defineEventHandler(async (event) => {
  const ct = getRequestHeader(event, 'content-type') ?? ''
  let buf: Buffer, ext: 'xlsx' | 'csv', f: Record<string, string> = {}, url = '', fileName = ''
  if (ct.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const file = parts?.find((p) => p.name === 'file' && p.filename)
    for (const p of parts ?? []) if (!p.filename) f[p.name ?? ''] = p.data.toString('utf8').trim()
    if (!file || !file.data.length) throw apiError('invalid', 'Choose an Excel or CSV file.')
    if (file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 15 MB.', 413)
    const e = (file.filename ?? '').split('.').pop()?.toLowerCase()
    if (e !== 'xlsx' && e !== 'csv') throw apiError('bad_type', 'Use an Excel (.xlsx) or CSV file.')
    buf = file.data; ext = e; fileName = file.filename ?? ''
  } else {
    f = Object.fromEntries(Object.entries((await readBody(event)) ?? {}).map(([k, v]) => [k, String(v ?? '')]))
    url = f.url ?? ''; const r = await fetchLinkedSheet(url); buf = r.buf; ext = r.ext
  }
  const kind = Kind.safeParse(f.kind); if (!kind.success) throw apiError('invalid', 'Choose what to bring in.')
  const user = await requireKind(event, kind.data)
  await rateLimit('growth_import', user.userId, 40, 60 * 60 * 1000)
  const pid = kind.data === 'bank_txns' ? null : z.string().uuid().safeParse(f.process_id).data ?? null
  if (kind.data !== 'bank_txns' && !pid) throw apiError('invalid', 'Choose the process first.')
  const t = tableOf(await readGrids(buf, ext)); if (!t) throw apiError('empty', 'No table with headings found. Put headings in the first row and one record per row.', 422)
  const map = await mapTable(kind.data, t, await targetsFor(kind.data, pid))
  if (kind.data === 'bank_txns') { map.currency = /^[A-Z]{3}$/.test(f.currency ?? '') ? f.currency : 'USD'; map.account = (f.account || fileName || 'Linked sheet').slice(0, 120) }
  // The company the rows belong to: the one chosen at the top; on the group view, the one picked in the form (bank
  // transactions) or, for deals, the main company unless the process belongs to one.
  const sc = await forecastScope(event), picked = sc.companies.find((c) => c.id === f.entity_id)?.id
  map.entity = sc.group ? (picked ?? null) : sc.entity
  if (kind.data === 'bank_txns' && (f.all_out === 'true' || f.all_out === 'false')) map.all_out = f.all_out === 'true'
  // Nothing is written yet: what the rows would add or change is held for the founder to accept (with the link kept
  // only once they do).
  const h = await holdImport({ kind: kind.data, processId: pid, name: (f.name || fileName || 'Sheet').slice(0, 120), ref: url || fileName, t, map, userId: user.userId,
    keepLink: url && f.link === 'true' ? { url, name: (f.name || 'Linked sheet').slice(0, 120), auto: true } : null })
  await audit({ event, actorUserId: user.userId, action: 'growth.import_review', objectType: 'growth_import', detail: { kind: kind.data, added: h.summary.added, changed: h.summary.changed, linked: url && f.link === 'true', ai: map.ai } })
  const used = Object.entries(map.columns).filter(([, i]) => i !== null && i !== undefined).map(([k, i]) => ({ field: k, column: t.headers[i!] || 'column ' + (i! + 1) }))
  return { ok: true, pending: h.id, summary: h.summary, rows: t.rows.length, columns: used, ai: map.ai, all_out: map.all_out ?? null }
})
