// Turn a CSV/Excel file or a shared Google Sheet into "Name, email, firm, title" lines for review before importing.
type Row = string[]
function csvRows(text: string): Row[] {
  const rows: Row[] = []; let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length && rows.length < 5000; i++) {
    const ch = text[i]!
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch; continue }
    if (ch === '"') q = true; else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = '' } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}
async function xlsxRows(buf: Buffer): Promise<Row[]> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]; const out: Row[] = []
  ws?.eachRow((r) => { if (out.length < 5000) out.push((r.values as unknown[]).slice(1).map((v) => (v && typeof v === 'object' ? ('text' in (v as object) ? String((v as { text: unknown }).text) : 'result' in (v as object) ? String((v as { result: unknown }).result) : '') : v == null ? '' : String(v)))) })
  return out
}
function toLines(rows: Row[]): { lines: string; count: number } {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean))
  if (!clean.length) return { lines: '', count: 0 }
  const h = clean[0]!.map((c) => c.toLowerCase())
  const find = (...names: string[]) => h.findIndex((c) => names.some((n) => c === n || c.includes(n)))
  const iE = find('email', 'e-mail'), iN = find('full name', 'name', 'contact'), iF = find('first'), iL = find('last', 'surname'), iC = find('company', 'firm', 'organisation', 'organization', 'fund'), iT = find('title', 'role', 'position')
  const hasHeader = iE >= 0
  const body = hasHeader ? clean.slice(1) : clean
  const out: string[] = []
  for (const r of body) {
    const email = (hasHeader ? r[iE] : r.find((c) => /@/.test(c))) ?? ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    const name = hasHeader ? (iN >= 0 && iN !== iF && iN !== iL ? r[iN] : [iF >= 0 ? r[iF] : '', iL >= 0 ? r[iL] : ''].join(' ').trim()) || email.split('@')[0] : r.find((c) => c && !c.includes('@')) ?? email.split('@')[0]
    const firm = hasHeader && iC >= 0 ? r[iC] ?? '' : '', title = hasHeader && iT >= 0 ? r[iT] ?? '' : ''
    out.push([name, email, firm, title].map((x) => String(x ?? '').replace(/,/g, ' ').trim()).join(', ').replace(/(, )+$/, ''))
  }
  return { lines: out.join('\n'), count: out.length }
}
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('contacts_parse', user.userId, 40, 60 * 60 * 1000)
  const ct = getRequestHeader(event, 'content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const file = parts?.find((p) => p.name === 'file' && p.filename)
    if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
    if (file.data.length > 10 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 10 MB.', 413)
    const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
    if (ext === 'xlsx') return toLines(await xlsxRows(file.data))
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return toLines(csvRows(file.data.toString('utf8')))
    throw apiError('bad_type', 'Upload a CSV, TSV, TXT or Excel (.xlsx) file.')
  }
  const b = await readBody<{ url?: string }>(event)
  const m = String(b?.url ?? '').match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/[^?#]*)?(?:[?#].*?gid=(\d+))?/)
  if (!m) throw apiError('invalid', 'Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…).')
  const res = await fetch('https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv' + (m[2] ? '&gid=' + m[2] : ''), { redirect: 'follow', signal: AbortSignal.timeout(15000) }).catch(() => null)
  const text = res && res.ok ? await res.text() : ''
  if (!text || /<html/i.test(text.slice(0, 200))) throw apiError('not_shared', 'We could not open that sheet. In Google Sheets choose Share → General access → "Anyone with the link" (Viewer), then try again.', 400)
  return toLines(csvRows(text.slice(0, 5_000_000)))
})
