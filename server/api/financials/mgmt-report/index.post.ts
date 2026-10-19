// Makes the monthly management report (PDF or Excel) with the sections the founder picked, and remembers the choice.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { MR_SECTIONS, buildMgmtReport, companyAbout, mgmtPdf, mgmtXlsx } from '~/server/utils/mgmt-report'
import { customerFacts, analyseCustomers } from '~/server/utils/customer-analysis'
import { deriveLines, withSecurities, type FinRow } from '~/shared/fin-view'
import { addM, groupOf, span } from '~/shared/customer-metrics'
const Body = z.object({ subject: z.string().regex(/^(group|(entity|company):[0-9a-f-]{36})$/).optional(), month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), sections: z.array(z.enum(MR_SECTIONS.map((s) => s.key) as [string, ...string[]])).min(1).max(20),
  format: z.enum(['pdf', 'xlsx']).default('pdf'), comments: z.string().max(8000).default(''), priorities: z.string().max(4000).default(''), about: z.string().max(4000).optional(), room: z.boolean().default(false), deliver: z.enum(['download', 'room']).default('download'), chart: z.enum(['area', 'line', 'bar']).optional(), pies: z.boolean().optional(), update: z.boolean().default(false), remember: z.boolean().default(true),
  cust_group: z.object({ by: z.enum(['size', 'segment', 'sector', 'plan', 'country']), value: z.string().min(1).max(60) }).nullable().optional(), cash_with_securities: z.boolean().nullable().optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the month and at least one section.')
  await rateLimit('fin_mgmt_report', user.userId, 60, 60 * 60 * 1000)
  const org = (await currentOrg())!
  // Without a subject: the company itself; without a month: the latest one with figures.
  const ent = await companyEntityId().catch(() => null)
  const d = { ...b.data, subject: b.data.subject ?? (ent ? 'entity:' + ent : '') }
  if (!d.subject) throw apiError('invalid', 'Choose a company.')
  // Treasury bills with cash or on their own line: the team chooses for each report (investor-facing).
  const sec = await investorCashPolicy(d.cash_with_securities ?? null)
  const rows = (await loadStatements(d.subject, 'month', await subjectCurrency(d.subject))).map((r) => ({ ...r, kpis: r.kpis ?? {}, derived: withSecurities(deriveLines(r.lines, 1), sec) }))
  if (!rows.length) throw apiError('empty', 'Add your monthly figures first.')
  const name = await subjectName(d.subject)
  const month = d.month ?? rows.filter((r) => r.period_end <= new Date().toISOString().slice(0, 10)).pop()?.period_end ?? rows[rows.length - 1]!.period_end
  const model = ((org.settings.business_models as Record<string, string> | undefined) ?? {})[d.subject] ?? null
  // The analysis (key points and what to raise) is for the latest month; for an earlier month the rule-based points
  // from the figures up to that month are used.
  const upTo = rows.filter((r) => r.period_end.slice(0, 7) <= month.slice(0, 7))
  const latest = upTo.length === rows.filter((r) => r.period_end <= new Date().toISOString().slice(0, 10)).length
  let analysis: { headline: string; insights: { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }[]; flags: { for: string; item: string; why: string }[] } | null = null
  if (d.sections.includes('summary') || d.sections.includes('actions')) {
    if (latest && upTo.length >= 3) analysis = await analyseFinancials(d.subject, upTo as unknown as FinRow[], upTo[upTo.length - 1]!.currency, name, false, model).catch(() => null)
    else if (upTo.length >= 3) { const f = factsOf(upTo as unknown as FinRow[], model); analysis = { headline: '', insights: f.rules, flags: f.flags } }
  }
  let customers: Record<string, unknown> | null = null
  // Customer sections: the company's own customers, or every company's combined for the group.
  const custAt = await custForSubject(d.subject)
  if ((d.sections.includes('customers') || d.sections.includes('retention')) && org.kind === 'company' && custAt !== null && (await enabledModules()).has('fin_customers')) {
    event.context.custEntity = custAt
    const cfg = await customerConfig(), all = await loadCustomers(), g = d.cust_group ?? null
    // One group only (Enterprise, SMB, a segment…): the customers in it at the latest month; retention trends judge
    // size at the start of each window. Financials revenue is not compared for a group.
    const sp = span(all), t = { enterprise: cfg.enterprise_arr, midmarket: cfg.midmarket_arr }
    const cs = g && sp ? all.filter((c) => groupOf(c, g.by, addM(sp.last, -12), t) === g.value || groupOf(c, g.by, sp.last, t) === g.value) : all
    customers = cs.length ? customerFacts('customers', cs, cfg, g ? { revenue: {}, gm: (await financialsRevenue(cfg.currency)).gm } : await financialsRevenue(cfg.currency)) : null
    if (customers) {
      if (g) customers.only = g.value + (g.by === 'size' ? ' (by revenue size)' : '')
      const last = String(customers.as_of), ms = Array.from({ length: 12 }, (_, i) => addM(last, i - 11)), sfx = g ? '@' + g.by + '=' + g.value : ''
      const keys = ['cust:nrr', 'cust:grr', 'cust:logo_churn', 'cust:arr', 'cust:active'].map((k) => k + sfx), tr = await customerSeries(keys, ms)
      customers.trend = { labels: ms, nrr: tr[keys[0]!] ?? [], grr: tr[keys[1]!] ?? [], churn: tr[keys[2]!] ?? [], arr: tr[keys[3]!] ?? [], active: tr[keys[4]!] ?? [] }
      // The write-up from the Retention and Customers pages (the headline and four key points) goes into the report,
      // so those pages can stay as charts. Not for one group only: the write-up is about all customers.
      if (!g) customers.points = { retention: d.sections.includes('retention') ? await analyseCustomers('retention').catch(() => null) : null, customers: d.sections.includes('customers') ? await analyseCustomers('customers').catch(() => null) : null }
    }
  }
  const { profile } = await reportProfile().catch(() => ({ profile: { fye_month: 12 } as { fye_month: number } }))
  const prevSaved = ((org.settings.mgmt_report as Record<string, { about?: string; chart?: 'area' | 'line' | 'bar'; pies?: boolean }> | undefined) ?? {})[d.subject]
  const chart = d.chart ?? prevSaved?.chart ?? 'area', pies = d.pies ?? prevSaved?.pies ?? true
  let r
  try { r = buildMgmtReport(rows as never, { company: name, month, sections: d.sections, fyeMonth: profile.fye_month || 12, model, withSecurities: sec, analysis, customers, comments: d.comments, priorities: d.priorities, about: d.sections.includes('intro') ? await companyAbout(d.subject, d.about) : null, chart, pies }) }
  catch (e) { throw apiError('empty', (e as Error).message, 422) }
  // Remember the sections for next month.
  const all = { ...((org.settings.mgmt_report as Record<string, unknown> | undefined) ?? {}), [d.subject]: { sections: d.sections, about: d.about ?? prevSaved?.about ?? '', chart, pies } }
  // Not when made from Retention or Customers (a customers-only report should not change next month's choice).
  if (d.remember) await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('mgmt_report', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(all)]))
  const logo = await companyLogoImage()
  const bytes = d.format === 'xlsx' ? await mgmtXlsx(r, logo) : Buffer.from(await mgmtPdf(r, logo))
  const fname = (name + ' monthly management report ' + r.label).replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) + '.' + d.format
  const mime = d.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
  if (d.room || d.deliver === 'room') {
    const id = randomUUID(), key = 'documents/' + id + '.' + d.format
    await putObject({ key, body: new Uint8Array(bytes), contentType: mime }).catch(() => { throw apiError('storage', 'Could not store the file just now.', 503) })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Data room — ' + fname, key, mime, bytes.length, createHash('sha256').update(bytes).digest('hex')])
    await db().query('INSERT INTO fundraise.files (document_id, title, folder, room_id) VALUES ($1,$2,$3,$4)', [id, fname, 'Financials', await roomId(undefined)])
  }
  // A draft investor update from the same numbers: the headline and key points, a metrics table, a revenue chart and,
  // with customer data, retention and revenue by sector. The founder edits and sends it from Investor updates.
  let updateId: string | null = null
  if (d.update && (await enabledModules()).has('updates')) {
    const hasCust = !!customers && !d.cust_group
    const blocks = [
      { type: 'text', md: '## ' + r.label + '\n\n' + (analysis?.headline || '') + (analysis?.insights.length ? '\n\n' + analysis.insights.slice(0, 4).map((x) => '- **' + x.title + '.** ' + x.detail).join('\n') : '') + (d.comments.trim() ? '\n\n' + d.comments.trim() : '') },
      { type: 'metrics_table', title: 'Key metrics', metrics: ['revenue', 'gross_margin', 'net_income', 'cash', 'burn', 'runway'], period: 'month', count: 6 },
      { type: 'chart', title: 'Revenue', metrics: ['revenue'], period: 'month', count: 12 },
      ...(hasCust ? [{ type: 'metrics_table', title: 'Customers and retention', metrics: ['cust:nrr', 'cust:grr', 'cust:arr', 'cust:active'], period: 'month', count: 6 }, { type: 'sectors', title: 'Revenue by customer sector' }] : []),
      ...(d.priorities.trim() ? [{ type: 'text', md: '## Priorities for next month\n\n' + d.priorities.trim() }] : [])]
    const end = month.length === 7 ? month + '-28' : month
    updateId = (await one<{ id: string }>("INSERT INTO financials.updates (title, period_type, period_end, created_by, blocks, subject) VALUES ($1,'month',$2,$3,$4,$5) RETURNING id", [name + ': ' + r.label + ' update', end, user.userId, JSON.stringify(blocks), org.kind === 'company' ? null : d.subject])).id
  }
  await audit({ event, actorUserId: user.userId, action: 'financials.mgmt_report', objectType: 'subject', detail: { subject: d.subject, month: d.month, format: d.format, sections: d.sections, room: d.room } })
  if (d.deliver === 'room') return { ok: true, name: fname, update_id: updateId }
  if (updateId) setHeader(event, 'x-update-id', updateId)
  setHeader(event, 'content-type', mime)
  setHeader(event, 'content-disposition', 'attachment; filename="' + fname.replace(/"/g, '') + '"')
  return bytes
})
