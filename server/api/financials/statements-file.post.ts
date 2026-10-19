// Financial statements as a PDF or Excel file, with the company logo set in Settings and the founder's comments:
// the annual report (kind=report: directors and advisers, directors' report, policies, statements, notes) for a
// fiscal year with the year before for comparison, or the statements alone by month, quarter or year.
// Downloaded, and added to the data room when asked.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { CapNote } from '~/server/utils/fin-report'
import { deriveLines, type FinRow } from '~/shared/fin-view'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  const parts = (await readMultipartFormData(event)) ?? []
  const val = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8') ?? ''
  const b = z.object({ subject: z.string().regex(/^(group|(entity|company):[0-9a-f-]{36})$/), period_type: z.enum(['month', 'quarter', 'year']).default('month'), count: z.coerce.number().int().min(1).max(36).default(12),
    format: z.enum(['pdf', 'xlsx']).default('pdf'), securities: z.enum(['1', '0']).optional(), comments: z.string().max(8000).default(''), note_income: z.string().max(1500).default(''), note_balance: z.string().max(1500).default(''), note_cash: z.string().max(1500).default(''), room: z.enum(['0', '1']).default('0'), kind: z.enum(['report', 'statements']).default('statements'), year: z.coerce.number().int().min(1990).max(2100).optional() })
    .safeParse(Object.fromEntries(['subject', 'period_type', 'count', 'format', 'comments', 'note_income', 'note_balance', 'note_cash', 'room', 'kind', 'year', 'securities'].map((k) => [k, val(k) || undefined])))
  if (!b.success) throw apiError('invalid', 'Choose the period and format.')
  await rateLimit('fin_statements', user.userId, 60, 60 * 60 * 1000)
  const d = b.data, org = (await currentOrg())!
  const raw: FinRow[] = []
  for (const t of ['month', 'quarter', 'year'] as const) for (const r of await loadStatements(d.subject, t, await subjectCurrency(d.subject))) raw.push({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: deriveLines(r.lines, 1) })
  if (!raw.length) throw apiError('empty', 'Add your figures first.')
  const name = await subjectName(d.subject)
  const logo0 = await companyLogoImage()
  const store = async (bytes: Buffer, fname: string, mime: string) => {
    if (d.room !== '1') return
    const id = randomUUID(), key = 'documents/' + id + '.' + d.format
    await putObject({ key, body: new Uint8Array(bytes), contentType: mime }).catch(() => { throw apiError('storage', 'Could not store the file just now.', 503) })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Data room — ' + fname, key, mime, bytes.length, createHash('sha256').update(bytes).digest('hex')])
    await db().query('INSERT INTO fundraise.files (document_id, title, folder, room_id) VALUES ($1,$2,$3,$4)', [id, fname, 'Financials', await roomId(undefined)])
  }
  if (d.kind === 'report') {
    const { profile } = await reportProfile()
    const year = d.year ?? reportYears(raw, profile.fye_month || 12)[0]?.year
    if (!year) throw apiError('empty', 'Add monthly or yearly figures first.')
    // The group's report is the consolidated one and lists the subsidiaries (basis of consolidation); the company's own
    // report and a subsidiary's stand alone.
    const main = 'entity:' + (await companyEntityId())
    const isGroup = d.subject === 'group'
    const mainName = isGroup ? await subjectName(main).catch(() => name) : name
    const subsidiaries = isGroup ? (await db().query<{ name: string; country: string | null }>("SELECT name, jurisdiction AS country FROM core.entities WHERE kind = 'operating' AND parent_id IS NOT NULL AND status <> 'closed' ORDER BY created_at")).rows : []
    const fye = profile.fye_month || 12, end = new Date(Date.UTC(year, fye, 0)).toISOString().slice(0, 10)
    let cap: CapNote | null = null
    if (d.subject === main || isGroup) {
      const start = new Date(Date.UTC(year - 1, fye, 0)).toISOString().slice(0, 10)
      cap = await shareholding(end, start, profile.share_classes).catch(() => null)
    }
    const r = buildReport(raw, { p: { ...profile, legal_name: isGroup ? (profile.legal_name || mainName) + ' and its subsidiaries' : d.subject === main ? profile.legal_name || name : name }, year, withSecurities: await investorCashPolicy(d.securities === undefined ? null : d.securities === '1'), comments: d.comments, notes: { income: d.note_income, balance: d.note_balance, cash: d.note_cash }, subsidiaries, cap })
    const bytes = d.format === 'xlsx' ? await reportXlsx(r, logo0) : Buffer.from(await reportPdf(r, logo0))
    const fname = (r.company + ' financial statements ' + r.period).replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) + '.' + d.format
    const mime = d.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
    await store(bytes, fname, mime)
    await audit({ event, actorUserId: user.userId, action: 'financials.report_file', objectType: 'subject', detail: { format: d.format, year, room: d.room === '1' } })
    setHeader(event, 'content-type', mime)
    setHeader(event, 'content-disposition', 'attachment; filename="' + fname.replace(/"/g, '') + '"')
    return bytes
  }
  const s = buildStatements(raw, { company: name, period_type: d.period_type, count: d.count, withSecurities: await investorCashPolicy(d.securities === undefined ? null : d.securities === '1'), comments: d.comments, notes: { income: d.note_income, balance: d.note_balance, cash: d.note_cash } })
  if (!s.periods.length) throw apiError('empty', 'No ' + d.period_type + 'ly figures up to today.')
  const logo = logo0
  const bytes = d.format === 'xlsx' ? await statementsXlsx(s, logo) : Buffer.from(await statementsPdf(s, logo))
  const title = name + ' financial statements ' + s.periods[0] + (s.periods.length > 1 ? ' to ' + s.periods[s.periods.length - 1] : '')
  const fname = title.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) + '.' + d.format
  const mime = d.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
  await store(bytes, fname, mime)
  await audit({ event, actorUserId: user.userId, action: 'financials.statements_file', objectType: 'subject', detail: { format: d.format, periods: s.periods.length, room: d.room === '1' } })
  setHeader(event, 'content-type', mime)
  setHeader(event, 'content-disposition', 'attachment; filename="' + fname.replace(/"/g, '') + '"')
  return bytes
})
