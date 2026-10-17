// Standard financial statements as a PDF or Excel file: income statement, balance sheet and cash flow by month,
// quarter or year, with the company logo set in Settings and the founder's comments.
// Downloaded, and added to the data room when asked.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { deriveLines, type FinRow } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  const parts = (await readMultipartFormData(event)) ?? []
  const val = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8') ?? ''
  const b = z.object({ subject: z.string().regex(/^(entity|company):[0-9a-f-]{36}$/), period_type: z.enum(['month', 'quarter', 'year']).default('month'), count: z.coerce.number().int().min(1).max(36).default(12),
    format: z.enum(['pdf', 'xlsx']).default('pdf'), comments: z.string().max(8000).default(''), note_income: z.string().max(1500).default(''), note_balance: z.string().max(1500).default(''), note_cash: z.string().max(1500).default(''), room: z.enum(['0', '1']).default('0') })
    .safeParse(Object.fromEntries(['subject', 'period_type', 'count', 'format', 'comments', 'note_income', 'note_balance', 'note_cash', 'room'].map((k) => [k, val(k) || undefined])))
  if (!b.success) throw apiError('invalid', 'Choose the period and format.')
  await rateLimit('fin_statements', user.userId, 60, 60 * 60 * 1000)
  const d = b.data, org = (await currentOrg())!
  const raw: FinRow[] = []
  for (const t of ['month', 'quarter', 'year'] as const) for (const r of await loadStatements(d.subject, t, (org.settings.currency as string) || 'USD')) raw.push({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: deriveLines(r.lines, 1) })
  if (!raw.length) throw apiError('empty', 'Add your figures first.')
  const name = await subjectName(d.subject)
  const s = buildStatements(raw, { company: name, period_type: d.period_type, count: d.count, withSecurities: org.settings.cash_with_securities === true, comments: d.comments, notes: { income: d.note_income, balance: d.note_balance, cash: d.note_cash } })
  if (!s.periods.length) throw apiError('empty', 'No ' + d.period_type + 'ly figures up to today.')
  // The company logo set in Settings.
  const logo = await companyLogoImage()
  const bytes = d.format === 'xlsx' ? await statementsXlsx(s, logo) : Buffer.from(await statementsPdf(s, logo))
  const title = name + ' financial statements ' + s.periods[0] + (s.periods.length > 1 ? ' to ' + s.periods[s.periods.length - 1] : '')
  const fname = title.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) + '.' + d.format
  const mime = d.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
  if (d.room === '1') {
    const id = randomUUID(), key = 'documents/' + id + '.' + d.format
    await putObject({ key, body: new Uint8Array(bytes), contentType: mime }).catch(() => { throw apiError('storage', 'Could not store the file just now.', 503) })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Data room — ' + fname, key, mime, bytes.length, createHash('sha256').update(bytes).digest('hex')])
    await db().query('INSERT INTO fundraise.files (document_id, title, folder, room_id) VALUES ($1,$2,$3,$4)', [id, fname, 'Financials', await roomId(undefined)])
  }
  await audit({ event, actorUserId: user.userId, action: 'financials.statements_file', objectType: 'subject', detail: { format: d.format, periods: s.periods.length, room: d.room === '1' } })
  setHeader(event, 'content-type', mime)
  setHeader(event, 'content-disposition', 'attachment; filename="' + fname.replace(/"/g, '') + '"')
  return bytes
})
