// The family's financial picture: what they tell us (income, tax, spending, debts, credit scores, goals) and what they
// upload (bank statements, tax returns, payslips, credit reports), turned by AI into simple financial statements,
// a health check, practical actions and a growth projection. Not investment advice: no products or securities.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export const DOC_KINDS = ['bank_statement', 'tax_return', 'payslip', 'credit_report', 'passport', 'proof_of_address', 'other']
export async function planGet(clientId: string) {
  const profile = (await db().query<{ data: Record<string, unknown>; updated_at: string }>('SELECT data, updated_at FROM wm.profiles WHERE client_id = $1', [clientId])).rows[0] ?? { data: {}, updated_at: null }
  const docs = (await db().query("SELECT p.id, p.kind, p.name, p.created_at, d.size_bytes, d.mime_type FROM wm.profile_docs p JOIN core.documents d ON d.id = p.document_id WHERE p.client_id = $1 ORDER BY p.created_at DESC", [clientId])).rows
  const report = (await db().query<{ id: string; content: Record<string, unknown>; created_at: string }>('SELECT id, content, created_at FROM wm.reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1', [clientId])).rows[0] ?? null
  const history = (await db().query<{ as_of: string; net_worth: string }>("SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, net_worth::text FROM wm.snapshots WHERE client_id = $1 ORDER BY as_of", [clientId])).rows.map((r) => ({ as_of: r.as_of, net_worth: Number(r.net_worth) }))
  const link = !!(await db().query('SELECT 1 FROM wm.report_links WHERE client_id = $1 AND NOT revoked', [clientId])).rowCount
  const views = (await db().query("SELECT name, email, viewed_at FROM wm.views WHERE client_id = $1 AND kind = 'report' ORDER BY viewed_at DESC LIMIT 30", [clientId])).rows
  return { profile: profile.data, updated_at: profile.updated_at, docs, report, history, has_link: link, views }
}
const Money = z.number().min(0).max(1e12)
export const ProfileSchema = z.object({
  household: z.object({ adults: z.number().int().min(0).max(20).optional(), children: z.number().int().min(0).max(20).optional(), location: z.string().max(120).optional() }).optional(),
  incomes: z.array(z.object({ who: z.string().max(120), source: z.string().max(120), amount: Money, frequency: z.enum(['monthly', 'annual']), currency: z.string().regex(/^[A-Z]{3}$/) })).max(20).optional(),
  taxes: z.array(z.object({ kind: z.string().max(120), amount: Money, frequency: z.enum(['monthly', 'annual']), currency: z.string().regex(/^[A-Z]{3}$/) })).max(20).optional(),
  expenses: z.array(z.object({ category: z.string().max(120), amount: Money, frequency: z.enum(['monthly', 'annual']), currency: z.string().regex(/^[A-Z]{3}$/) })).max(40).optional(),
  debts: z.array(z.object({ name: z.string().max(120), balance: Money, rate: z.number().min(0).max(100).optional(), payment: Money.optional(), currency: z.string().regex(/^[A-Z]{3}$/) })).max(20).optional(),
  credit_scores: z.array(z.object({ person: z.string().max(120), score: z.number().int().min(300).max(900), source: z.string().max(60), date: z.string().max(20).optional() })).max(10).optional(),
  goals: z.array(z.object({ name: z.string().max(160), target: Money.optional(), by: z.string().max(20).optional() })).max(20).optional(),
  notes: z.string().max(4000).optional() })
export async function planSave(clientId: string, data: unknown) {
  const d = ProfileSchema.parse(data)
  await db().query('INSERT INTO wm.profiles (client_id, data) VALUES ($1,$2) ON CONFLICT (client_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [clientId, JSON.stringify(d)])
}
export async function planUpload(clientId: string, parts: { name?: string; filename?: string; type?: string; data: Buffer }[]) {
  const kind = parts.find((p) => p.name === 'kind' && !p.filename)?.data.toString('utf8') ?? 'other'
  let n = 0
  for (const f of parts.filter((p) => p.name === 'file' && p.filename && p.data.length).slice(0, 10)) {
    const mime = f.type || 'application/octet-stream'
    if (!/^(application\/pdf|image\/(png|jpeg|webp)|text\/csv|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/.test(mime)) continue
    if (f.data.length > 20 * 1024 * 1024) continue
    const id = randomUUID(), ext = mime === 'application/pdf' ? 'pdf' : mime === 'text/csv' ? 'csv' : mime.includes('sheet') ? 'xlsx' : mime.split('/')[1]
    await putObject({ key: 'documents/' + id + '.' + ext, body: new Uint8Array(f.data), contentType: mime })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [id, 'Financial profile — ' + (f.filename ?? 'document').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150), 'documents/' + id + '.' + ext, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
    await db().query('INSERT INTO wm.profile_docs (client_id, document_id, kind, name) VALUES ($1,$2,$3,$4)', [clientId, id, DOC_KINDS.includes(kind) ? kind : 'other', (f.filename ?? '').slice(0, 200)])
    n++
  }
  return n
}
const Out = z.object({ summary: z.string(), health_score: z.number().min(0).max(100), currency: z.string(),
  income_statement: z.object({ lines: z.array(z.object({ label: z.string(), annual: z.number() })), total_income: z.number(), total_spending: z.number(), net: z.number() }),
  balance_sheet: z.object({ assets: z.array(z.object({ label: z.string(), value: z.number() })), liabilities: z.array(z.object({ label: z.string(), value: z.number() })), net_worth: z.number() }),
  cash_flow: z.object({ monthly_income: z.number(), monthly_spending: z.number(), monthly_surplus: z.number(), savings_rate_pct: z.number() }),
  strengths: z.array(z.string()).max(8), risks: z.array(z.string()).max(8),
  actions: z.array(z.object({ title: z.string(), detail: z.string(), priority: z.enum(['high', 'medium', 'low']), timeframe: z.string() })).max(10),
  projection: z.object({ monthly_contribution: z.number().min(0), annual_return_pct: z.number().min(0).max(20), years: z.number().int().min(1).max(40) }) })
export async function planGenerate(clientId: string, userId: string | null) {
  const c = (await db().query<{ name: string; country: string; kind: string }>('SELECT name, country, kind FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const p = await planGet(clientId)
  const s = await clientSummary(clientId)
  const docs = (await db().query<{ storage_key: string; mime_type: string; kind: string; name: string | null; size_bytes: string }>("SELECT d.storage_key, d.mime_type, p.kind, p.name, d.size_bytes::text FROM wm.profile_docs p JOIN core.documents d ON d.id = p.document_id WHERE p.client_id = $1 AND d.mime_type = 'application/pdf' ORDER BY p.created_at DESC LIMIT 3", [clientId])).rows
  const blocks: unknown[] = []
  for (const d of docs) if (Number(d.size_bytes) < 4.5 * 1024 * 1024) { try { blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(await getObject(d.storage_key)).toString('base64') }, title: d.kind + ': ' + (d.name ?? '') }) } catch { /* skip */ } }
  const ctx = { household: c.name, kind: c.kind, country: c.country === 'NG' ? 'Nigeria' : 'United States', profile: p.profile, holdings_summary_usd: s.totals, by_asset_class_usd: s.by_class, accounts: s.accounts.map((a) => ({ institution: a.institution, kind: a.kind, currency: a.currency, balance: Number(a.balance) })), bank_cash_usd: s.totals.cash }
  blocks.push({ type: 'text', text: 'HOUSEHOLD DATA (JSON):\n' + JSON.stringify(ctx).slice(0, 60000) + '\n\nRead any attached statements, tax returns, payslips or credit reports for figures the household did not type in. Build the financial picture and return it with the tool.' })
  const { output } = await runAiTool({ task: 'wealth_plan', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'wealth-plan-v1', inputRef: 'wm:' + clientId, maxTokens: 5000,
    system: 'You prepare a clear, honest personal financial review for a family or business owner, like a private bank would. Use only the figures provided or found in the attached documents; when something is missing, say so instead of guessing. Work in the household\'s main currency. Build an annual income statement (income less taxes and spending), a balance sheet (assets and debts; use holdings and accounts given), monthly cash flow and savings rate, a 0–100 financial health score, strengths, risks, and up to 8 practical actions (budgeting, emergency fund, debt order, tax filing and allowances, insurance gaps, savings rate, estate basics, credit score). Do NOT recommend specific investments, securities, funds, coins or products, and do not promise returns: this is general financial guidance, not investment advice. For the projection, choose a realistic monthly contribution the household can afford from its surplus, a conservative long-run return assumption (for example 4 to 7% a year), and a horizon matching their goals.',
    user: '', userContent: blocks, toolName: 'financial_review', toolDescription: 'The financial review', schema: Out,
    jsonSchema: { type: 'object', required: ['summary', 'health_score', 'currency', 'income_statement', 'balance_sheet', 'cash_flow', 'strengths', 'risks', 'actions', 'projection'], properties: {
      summary: { type: 'string', description: 'Three to five plain sentences: where they are, and the most important next step.' }, health_score: { type: 'number' }, currency: { type: 'string' },
      income_statement: { type: 'object', required: ['lines', 'total_income', 'total_spending', 'net'], properties: { lines: { type: 'array', items: { type: 'object', required: ['label', 'annual'], properties: { label: { type: 'string' }, annual: { type: 'number', description: 'Positive for income, negative for taxes and spending.' } } } }, total_income: { type: 'number' }, total_spending: { type: 'number' }, net: { type: 'number' } } },
      balance_sheet: { type: 'object', required: ['assets', 'liabilities', 'net_worth'], properties: { assets: { type: 'array', items: { type: 'object', required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'number' } } } }, liabilities: { type: 'array', items: { type: 'object', required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'number' } } } }, net_worth: { type: 'number' } } },
      cash_flow: { type: 'object', required: ['monthly_income', 'monthly_spending', 'monthly_surplus', 'savings_rate_pct'], properties: { monthly_income: { type: 'number' }, monthly_spending: { type: 'number' }, monthly_surplus: { type: 'number' }, savings_rate_pct: { type: 'number' } } },
      strengths: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
      actions: { type: 'array', items: { type: 'object', required: ['title', 'detail', 'priority', 'timeframe'], properties: { title: { type: 'string' }, detail: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] }, timeframe: { type: 'string' } } } },
      projection: { type: 'object', required: ['monthly_contribution', 'annual_return_pct', 'years'], properties: { monthly_contribution: { type: 'number' }, annual_return_pct: { type: 'number' }, years: { type: 'integer' } } } } } })
  // projection series from today's net worth: as-is (no new saving) and with the plan
  const start = output.balance_sheet.net_worth || s.totals.net_worth, r = output.projection.annual_return_pct / 100 / 12
  const series: { year: number; as_is: number; plan: number }[] = []; let a = start, b = start
  for (let y = 0; y <= output.projection.years; y++) { if (y > 0) for (let m = 0; m < 12; m++) { a = a * (1 + r); b = b * (1 + r) + output.projection.monthly_contribution } series.push({ year: new Date().getFullYear() + y, as_is: Math.round(a), plan: Math.round(b) }) }
  const content = { ...output, series, generated: new Date().toISOString(), household: c.name }
  await db().query('INSERT INTO wm.reports (client_id, content, created_by) VALUES ($1,$2,$3)', [clientId, JSON.stringify(content), userId])
  return content
}
export async function planShare(clientId: string, on: boolean) {
  await db().query('UPDATE wm.report_links SET revoked = true WHERE client_id = $1', [clientId])
  if (!on) return null
  const tok = newToken(); await db().query('INSERT INTO wm.report_links (client_id, token_hash) VALUES ($1,$2)', [clientId, sha256(tok)])
  return brands().aidi.url + '/wr/' + tok
}
