// Reading a client's financial documents with AI (Aidi Wealth): brokerage and stock-plan statements, RSU release and
// withholding confirmations, ESPP, 401(k), pension and IRA statements, bank statements, payslips, loan statements,
// agreements; PDF, Excel or CSV. The text is taken out of each file here and identity numbers are removed before
// anything reaches the AI (Social Security and tax numbers, BVN, dates of birth; account and card numbers keep only
// their last four digits). Nothing goes into the plan until the client or an adviser confirms it.
import { z } from 'zod'

const MAX_CHARS = 60000

// ---- Text out of a file ----
async function pdfText(buf: Uint8Array): Promise<string> {
  // The worker runs on the main thread on the server (loaded first so the bundle carries it).
  const g = globalThis as { pdfjsWorker?: unknown }
  // @ts-expect-error the worker build ships without type declarations
  if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise
  const out: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const page = await doc.getPage(i), tc = await page.getTextContent()
    // Lines by height on the page, words left to right, so "Gross Proceeds   $33,098.52" stays on one line.
    const lines = new Map<number, { x: number; s: string }[]>()
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5]! / 3) * 3, row = lines.get(y) ?? []
      row.push({ x: it.transform[4]!, s: it.str.trim() }); lines.set(y, row)
    }
    out.push('--- Page ' + i + ' ---')
    for (const y of [...lines.keys()].sort((a, b) => b - a)) out.push(lines.get(y)!.sort((a, b) => a.x - b.x).map((w) => w.s).join('   '))
    if (out.join('\n').length > MAX_CHARS) break
  }
  await doc.destroy()
  return out.join('\n')
}

// Identity numbers out: SSN/ITIN, EIN, BVN/NIN, dates of birth; long account and card numbers keep their last four.
// redactIds: the identity numbers only (also used on what clients type in the onboarding chat, where long numbers can
// be amounts); redact: also cuts long account and card numbers to their last four (documents).
export function redactIds(t: string): string {
  return t
    .replace(/\b(\d{3})[- ](\d{2})[- ](\d{4})\b/g, '[ID removed]')
    .replace(/\b(ssn|social security (number|no\.?)|social|tin|itin|taxpayer id(entification)?( number)?|bvn|nin)\b[\s:#.\-]{0,6}\d[\d\- ]{5,}\d/gi, '$1 [removed]')
    .replace(/\b\d{2}-\d{7}\b/g, '[EIN removed]')
    .replace(/\b(date of birth|dob|d\.o\.b\.?|birth date|born( on)?)\b[^\dA-Za-z]{0,24}([\d]{1,4}[\/.\-][\d]{1,2}[\/.\-][\d]{2,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2} [A-Za-z]{3,9},? \d{4})/gi, '$1 [removed]')
    .replace(/\b(passport|driver'?s? licen[cs]e|licen[cs]e|dl|id card|national id)\b\s*(no\.?|number|#)?[\s:#.\-]{0,6}(?=[A-Z0-9]*\d)[A-Z0-9]{6,12}\b/gi, '$1 [removed]')
}
export function redact(t: string): string {
  return redactIds(t)
    .replace(/\b(?:\d[ -]?){8,19}\b/g, (m) => { if (/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/.test(m.trim())) return m; const d = m.replace(/\D/g, ''); return d.length >= 8 ? '••••' + d.slice(-4) + (m.match(/\s+$/)?.[0] ?? '') : m })
}

export async function docText(buf: Buffer, mime: string, name: string): Promise<string | null> {
  try {
    if (mime === 'application/pdf') return redact(await pdfText(new Uint8Array(buf)))
    if (mime === 'text/csv' || /\.csv$/i.test(name)) return redact(await sheetToText(buf, 'csv', 3, 400))
    if (mime.includes('sheet') || /\.xlsx$/i.test(name)) return redact(await sheetToText(buf, 'xlsx', 6, 400))
  } catch (e) { console.error('[wm-docread] text', name, e) }
  return null // photos are kept with the plan but not read (identity numbers could not be removed from them)
}

// ---- What the AI reads out ----
const Amt = z.number().min(-1e12).max(1e12)
const Cur = z.string().regex(/^[A-Z]{3}$/).catch('USD')
const From = z.string().max(200).catch('')
export const DocRead = z.object({
  documents: z.array(z.object({ name: z.string().max(200), type: z.string().max(80), period: z.string().max(60).catch(''), institution: z.string().max(120).catch('') })).max(20),
  incomes: z.array(z.object({ source: z.string().max(120), amount: Amt, frequency: z.enum(['monthly', 'annual']).catch('annual'), currency: Cur, from: From })).max(20).catch([]),
  expenses: z.array(z.object({ category: z.string().max(120), amount: Amt, frequency: z.enum(['monthly', 'annual']).catch('monthly'), currency: Cur, from: From })).max(30).catch([]),
  debts: z.array(z.object({ name: z.string().max(120), balance: Amt, payment: Amt.nullable().catch(null), rate: z.number().min(0).max(100).nullable().catch(null), currency: Cur, from: From })).max(20).catch([]),
  accounts: z.array(z.object({ institution: z.string().max(120), kind: z.enum(['brokerage', 'retirement', 'bank', 'savings', 'crypto', 'company_stock', 'other']).catch('other'), value: Amt, currency: Cur, as_of: z.string().max(20).catch(''), from: From })).max(30).catch([]),
  equity: z.array(z.object({
    company: z.string().max(120), ticker: z.string().max(12).catch(''), shares_held: z.number().nullable().catch(null), price: z.number().nullable().catch(null), value: z.number().nullable().catch(null), as_of: z.string().max(20).catch(''),
    vested: z.array(z.object({ date: z.string().max(20), shares: z.number(), withheld_shares: z.number().nullable().catch(null), gross: z.number().nullable().catch(null), net: z.number().nullable().catch(null), tax_paid: z.number().nullable().catch(null), federal_rate_pct: z.number().nullable().catch(null) })).max(40).catch([]),
    grants: z.array(z.object({ id: z.string().max(40).catch(''), granted: z.string().max(20).catch(''), kind: z.enum(['rsu', 'option', 'espp', 'other']).catch('rsu'), shares: z.number().nullable().catch(null), unvested_shares: z.number().nullable().catch(null), next_vest: z.string().max(20).catch('') })).max(40).catch([]),
    espp: z.array(z.object({ date: z.string().max(20), shares: z.number(), purchase_price: z.number().nullable().catch(null), market_price: z.number().nullable().catch(null) })).max(20).catch([]),
    sold_shares: z.number().nullable().catch(null), from: From })).max(10).catch([]),
  flags: z.array(z.object({ title: z.string().max(140), detail: z.string().max(600) })).max(10).catch([]),
  // Payslip facts as printed; yearly salary and RSU income are worked out from them in code (see payIncomes).
  payslips: z.array(z.object({ employer: z.string().max(120).catch(''), period_end: z.string().max(20).catch(''), frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'unknown']).catch('unknown'),
    period_salary: z.number().nullable().catch(null), hourly_rate: z.number().nullable().catch(null), ytd_salary: z.number().nullable().catch(null), ytd_rsu: z.number().nullable().catch(null), ytd_gross: z.number().nullable().catch(null), currency: Cur })).max(6).catch([]),
})
export type DocReadOut = z.infer<typeof DocRead>

const SYSTEM = `You read a client's financial documents for a wealth adviser and pull out the figures needed for a financial plan. Use only what the documents show; never guess or invent. Amounts are numbers without symbols; currency is the 3-letter code. "from" names the document a figure came from.
- accounts: every account with a value: brokerage, retirement (401(k), 403(b), IRA, pension), bank, savings, crypto; employer stock held at a stock-plan administrator is kind "company_stock" with its closing value.
- equity: one entry per employer stock plan. Shares held and their value at the statement date; each vest or release (date, shares, shares withheld for tax, gross and net value, tax paid, federal withholding rate); grants (award id, grant date, kind, shares and unvested shares when shown); ESPP purchases (date, shares, purchase and market price); shares sold in the period.
- payslips: one entry per payslip, figures exactly as printed: employer, period end date (YYYY-MM-DD), pay frequency (weekly, biweekly, semimonthly, monthly), the salary for this pay period (the Current salary or regular pay line, not gross with other items), the hourly pay rate if shown, and year-to-date salary, year-to-date restricted stock (RSU) income and year-to-date gross. Never annualise anything yourself.
- incomes: only income other than salary and stock: rent, dividends, interest, business income, pensions being paid. Do not put salary, bonuses on a payslip, RSU vests or ESPP here (salary and RSU income are worked out from the payslips; vests belong to equity).
- expenses: recurring spending from bank statements, grouped (housing, living costs, children, travel, subscriptions, other), monthly.
- debts: mortgages, loans, cards: balance, monthly payment, rate.
- flags: short planning points an adviser would raise, only when the documents support them. For tech employees especially: concentration in employer stock; federal tax on RSU income withheld at the 22% supplemental rate when Social Security tax stopped part-way through the year (the wage base was passed) or the additional Medicare rate (2.35%) applies, meaning income over $200k and a likely shortfall at tax time; upcoming vests and the cash they bring; ESPP shares and the holding periods that change their tax; cash beyond an emergency reserve; high-rate debt. Plain words, no product recommendations.
Identity numbers were removed before you saw the text; do not ask for them.`

export async function readFinancialDocs(files: { name: string; mime: string; buf: Buffer }[], inputRef: string): Promise<{ out: DocReadOut; read: string[]; skipped: string[] }> {
  const parts: string[] = [], read: string[] = [], skipped: string[] = []
  for (const f of files) {
    const t = await docText(f.buf, f.mime, f.name)
    if (!t || t.replace(/\s/g, '').length < 40) { skipped.push(f.name); continue }
    parts.push('=== DOCUMENT: ' + f.name + ' ===\n' + t.slice(0, 40000)); read.push(f.name)
  }
  if (!parts.length) return { out: { documents: [], payslips: [], incomes: [], expenses: [], debts: [], accounts: [], equity: [], flags: [] }, read, skipped }
  const cfg = useRuntimeConfig() as unknown as Record<string, string>
  const { output } = await runAiTool({ task: 'wm_docread', model: cfg.aiModelSheets || cfg.aiModelAnalyst || cfg.aiModelPitchScreen!, promptVersion: 'wm-docread-v1', inputRef, maxTokens: 6000,
    system: SYSTEM, user: parts.join('\n\n').slice(0, 150000), toolName: 'financial_figures', toolDescription: 'The figures read from the documents',
    schema: DocRead,
    jsonSchema: { type: 'object', required: ['documents', 'payslips', 'incomes', 'expenses', 'debts', 'accounts', 'equity', 'flags'], properties: {
      documents: { type: 'array', items: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string' }, type: { type: 'string', description: 'e.g. Stock plan statement, RSU release confirmation, Bank statement, Payslip, 401(k) statement' }, period: { type: 'string' }, institution: { type: 'string' } } } },
      payslips: { type: 'array', items: { type: 'object', required: ['employer', 'frequency', 'currency'], properties: { employer: { type: 'string' }, period_end: { type: 'string' }, frequency: { type: 'string', enum: ['weekly', 'biweekly', 'semimonthly', 'monthly', 'unknown'] }, period_salary: { type: ['number', 'null'] }, hourly_rate: { type: ['number', 'null'] }, ytd_salary: { type: ['number', 'null'] }, ytd_rsu: { type: ['number', 'null'] }, ytd_gross: { type: ['number', 'null'] }, currency: { type: 'string' } } } },
      incomes: { type: 'array', items: { type: 'object', required: ['source', 'amount', 'frequency', 'currency'], properties: { source: { type: 'string' }, amount: { type: 'number' }, frequency: { type: 'string', enum: ['monthly', 'annual'] }, currency: { type: 'string' }, from: { type: 'string' } } } },
      expenses: { type: 'array', items: { type: 'object', required: ['category', 'amount', 'frequency', 'currency'], properties: { category: { type: 'string' }, amount: { type: 'number' }, frequency: { type: 'string', enum: ['monthly', 'annual'] }, currency: { type: 'string' }, from: { type: 'string' } } } },
      debts: { type: 'array', items: { type: 'object', required: ['name', 'balance', 'currency'], properties: { name: { type: 'string' }, balance: { type: 'number' }, payment: { type: ['number', 'null'] }, rate: { type: ['number', 'null'] }, currency: { type: 'string' }, from: { type: 'string' } } } },
      accounts: { type: 'array', items: { type: 'object', required: ['institution', 'kind', 'value', 'currency'], properties: { institution: { type: 'string' }, kind: { type: 'string', enum: ['brokerage', 'retirement', 'bank', 'savings', 'crypto', 'company_stock', 'other'] }, value: { type: 'number' }, currency: { type: 'string' }, as_of: { type: 'string', description: 'YYYY-MM-DD' }, from: { type: 'string' } } } },
      equity: { type: 'array', items: { type: 'object', required: ['company'], properties: {
        company: { type: 'string' }, ticker: { type: 'string' }, shares_held: { type: ['number', 'null'] }, price: { type: ['number', 'null'] }, value: { type: ['number', 'null'] }, as_of: { type: 'string' },
        vested: { type: 'array', items: { type: 'object', required: ['date', 'shares'], properties: { date: { type: 'string' }, shares: { type: 'number' }, withheld_shares: { type: ['number', 'null'] }, gross: { type: ['number', 'null'] }, net: { type: ['number', 'null'] }, tax_paid: { type: ['number', 'null'] }, federal_rate_pct: { type: ['number', 'null'] } } } },
        grants: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, granted: { type: 'string' }, kind: { type: 'string', enum: ['rsu', 'option', 'espp', 'other'] }, shares: { type: ['number', 'null'] }, unvested_shares: { type: ['number', 'null'] }, next_vest: { type: 'string' } } } },
        espp: { type: 'array', items: { type: 'object', required: ['date', 'shares'], properties: { date: { type: 'string' }, shares: { type: 'number' }, purchase_price: { type: ['number', 'null'] }, market_price: { type: ['number', 'null'] } } } },
        sold_shares: { type: ['number', 'null'] }, from: { type: 'string' } } } },
      flags: { type: 'array', items: { type: 'object', required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } } } } } })
  return { out: { ...output, incomes: [...payIncomes(output), ...output.incomes.filter((x) => !/salary|wage|rsu|restricted stock|espp|vest/i.test(x.source))] }, read, skipped }
}

// Yearly salary and RSU income from the latest payslip of each employer, worked out here rather than by the AI:
// salary = this period's salary × pay periods in a year (or the hourly rate × 2,080 hours); RSU income = year-to-date
// RSU income ÷ months so far × 12, marked as an estimate (vests are uneven). A single vest is never taken as a year.
export function payIncomes(r: Pick<DocReadOut, 'payslips'>): DocReadOut['incomes'] {
  const PER: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
  const latest = new Map<string, DocReadOut['payslips'][number]>()
  for (const p of r.payslips) { const k = p.employer.toLowerCase() || '-', had = latest.get(k); if (!had || p.period_end > had.period_end) latest.set(k, p) }
  const out: DocReadOut['incomes'] = []
  for (const p of latest.values()) {
    const who = p.employer || 'Employer', from = 'Payslip ' + (p.period_end || '')
    const salary = p.period_salary && PER[p.frequency] ? p.period_salary * PER[p.frequency]! : p.hourly_rate ? p.hourly_rate * 2080 : null
    if (salary) out.push({ source: who + ' salary', amount: Math.round(salary), frequency: 'annual', currency: p.currency, from })
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.period_end), months = m ? Number(m[1]) - 1 + Math.min(1, Number(m[2]) / 30) : null
    if (p.ytd_rsu && p.ytd_rsu > 0 && months && months >= 1) out.push({ source: who + ' RSU vesting (estimate from year to date)', amount: Math.round((p.ytd_rsu / months) * 12), frequency: 'annual', currency: p.currency, from })
  }
  return out
}

// The documents of a client (all, or those named), read together.
export async function readClientDocs(clientId: string, docIds?: string[]) {
  const rows = (await db().query<{ id: string; name: string | null; storage_key: string; mime_type: string; size_bytes: string }>(
    'SELECT p.id, p.name, d.storage_key, d.mime_type, d.size_bytes::text FROM wm.profile_docs p JOIN core.documents d ON d.id = p.document_id WHERE p.client_id = $1' + (docIds?.length ? ' AND p.id = ANY($2::uuid[])' : '') + ' ORDER BY p.created_at DESC LIMIT 12',
    docIds?.length ? [clientId, docIds] : [clientId])).rows
  const files: { name: string; mime: string; buf: Buffer }[] = []
  for (const r of rows) if (Number(r.size_bytes) < 20 * 1024 * 1024) { try { files.push({ name: r.name || 'document', mime: r.mime_type, buf: Buffer.from(await getObject(r.storage_key)) }) } catch { /* skipped */ } }
  return readFinancialDocs(files, 'wm:' + clientId)
}

// Planning checks worked out from the figures themselves (on top of what the AI noticed).
export function docChecks(r: DocReadOut): { title: string; detail: string }[] {
  const out: { title: string; detail: string }[] = []
  const usd = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
  const total = r.accounts.filter((a) => a.currency === 'USD').reduce((t, a) => t + Math.max(0, a.value), 0)
  for (const e of r.equity) {
    const v = e.value ?? (e.shares_held && e.price ? e.shares_held * e.price : null)
    if (v && total > 0 && v / total >= 0.25) out.push({ title: 'Concentrated in ' + e.company + ' stock', detail: usd(v) + ' is in ' + e.company + ', ' + Math.round((v / total) * 100) + '% of the accounts read here. A plan usually keeps one company to 10–15% of net worth; selling vested shares on a schedule lowers that.' })
    const low = e.vested.filter((x) => x.federal_rate_pct !== null && x.federal_rate_pct <= 22.5 && (x.gross ?? 0) > 0)
    if (low.length) out.push({ title: 'Tax on RSU income may be under-withheld', detail: 'Federal tax on ' + low.length + ' release' + (low.length === 1 ? '' : 's') + ' (' + usd(low.reduce((t, x) => t + (x.gross ?? 0), 0)) + ' of income) was withheld at 22%. Above about $250k of income the marginal rate is 32–37%, so tax may be owed in April; estimated payments or a higher withholding avoid a surprise.' })
  }
  return out
}

const PlanAdd = z.object({
  incomes: DocRead.shape.incomes, expenses: DocRead.shape.expenses, debts: DocRead.shape.debts, accounts: DocRead.shape.accounts, equity: DocRead.shape.equity, flags: DocRead.shape.flags,
})
// What the client or adviser confirmed goes into the plan: money in and out and debts are added to theirs, accounts
// become accounts ("From documents"), employer stock plans and planning points are kept with the plan.
export async function applyDocRead(clientId: string, take: unknown) {
  const t = PlanAdd.parse(take)
  const p = (await db().query<{ data: Record<string, any> }>('SELECT data FROM wm.profiles WHERE client_id = $1', [clientId])).rows[0]?.data ?? {}
  const pos = (v: number) => Math.max(0, Math.abs(v))
  const next = { ...p,
    incomes: [...(p.incomes ?? []), ...t.incomes.map((x) => ({ who: '', source: x.source, amount: pos(x.amount), frequency: x.frequency, currency: x.currency }))].slice(0, 20),
    expenses: [...(p.expenses ?? []), ...t.expenses.map((x) => ({ category: x.category, amount: pos(x.amount), frequency: x.frequency, currency: x.currency }))].slice(0, 40),
    debts: [...(p.debts ?? []), ...t.debts.map((x) => ({ name: x.name, balance: pos(x.balance), ...(x.payment ? { payment: pos(x.payment) } : {}), ...(x.rate !== null ? { rate: x.rate } : {}), currency: x.currency }))].slice(0, 20),
    equity: [...(p.equity ?? []).filter((e: { company: string }) => !t.equity.some((n) => n.company.toLowerCase() === e.company.toLowerCase())), ...t.equity].slice(0, 10),
    doc_flags: t.flags.length ? t.flags : p.doc_flags ?? [] }
  await planSave(clientId, next)
  for (const a of t.accounts) await db().query("INSERT INTO wm.accounts (client_id, provider, institution, kind, name, currency, balance, as_of, notes) VALUES ($1,'manual',$2,$3,$4,$5,$6,coalesce($7::date, current_date),'From documents')",
    [clientId, a.institution.slice(0, 120), a.kind === 'company_stock' ? 'brokerage' : a.kind, a.kind === 'company_stock' ? 'Company stock' : null, a.currency, a.value, /^\d{4}-\d{2}-\d{2}$/.test(a.as_of) ? a.as_of : null])
  return { added: t.incomes.length + t.expenses.length + t.debts.length + t.accounts.length + t.equity.length }
}
