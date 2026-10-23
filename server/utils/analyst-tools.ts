import { burnReview, deriveLines, withSecurities } from '~/shared/fin-view'
// More tools for the AI analyst: the newer areas (Secondaries with AI screening, wealth clients' risk levels, pitches,
// notices, fundraising clients, linked sheets, contact lists, the data room, custom metrics), a calculator so figures
// are computed rather than guessed, and proposed actions the person confirms with one click (carried out by
// /api/ai/act under their own access, never by the model).
import type { H3Event } from 'h3'

export interface ACtx { event: H3Event; userId: string; roles: string[] }
export interface ATool { name: string; module: string | null; roles?: string[]; description: string; input_schema: Record<string, unknown>; run: (a: Record<string, any>, c: ACtx) => Promise<unknown> }
const S = (props: Record<string, unknown> = {}, req: string[] = []) => ({ type: 'object', properties: props, required: req })
const str = (v: unknown, n = 80) => String(v ?? '').trim().slice(0, n)
const daysTo = (d: string | null) => (d ? Math.round((new Date(d + 'T00:00:00Z').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) / 86400e3) : null)

// A small arithmetic evaluator (no eval): numbers, + - * / ^ %, brackets, and min max round abs sqrt pow log exp.
// Expressions can use the names of earlier ones, so a calculation can be built in steps.
export function calc(expr: string, vars: Record<string, number>): number {
  const src = expr.replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, '')
  let i = 0
  const FN: Record<string, (...a: number[]) => number> = { min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, log: Math.log, exp: Math.exp, round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d }
  const peek = () => src[i] ?? ''
  function prim(): number {
    if (peek() === '(') { i++; const v = add(); if (src[i++] !== ')') throw new Error('missing )'); return v }
    if (peek() === '-') { i++; return -prim() }
    const num = /^\d+(\.\d+)?(e[+-]?\d+)?/i.exec(src.slice(i))
    if (num) { i += num[0].length; let v = Number(num[0]); if (peek() === '%') { i++; v /= 100 } return v }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))
    if (id) {
      i += id[0].length; const k = id[0].toLowerCase()
      if (peek() === '(') { i++; const args: number[] = []; if (peek() !== ')') { args.push(add()); while (peek() === ',') { i++; args.push(add()) } } if (src[i++] !== ')') throw new Error('missing )'); const f = FN[k]; if (!f) throw new Error('unknown function ' + k); return f(...args) }
      if (k in vars) return vars[k]!
      throw new Error('unknown name ' + id[0])
    }
    throw new Error('unexpected "' + peek() + '"')
  }
  function pow(): number { const b = prim(); if (peek() === '^') { i++; return Math.pow(b, pow()) } return b }
  function mul(): number { let v = pow(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = pow(); v = op === '*' ? v * r : v / r } return v }
  function add(): number { let v = mul(); while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = mul(); v = op === '+' ? v + r : v - r } return v }
  const v = add(); if (i < src.length) throw new Error('unexpected "' + src.slice(i, i + 10) + '"')
  if (!Number.isFinite(v)) throw new Error('not a finite number')
  return v
}

// What the analyst may propose. Each is checked again, with the person's own access, when they click it.
export const ACTION_KINDS = {
  secondary_status: { module: 'secondaries', roles: ['admin', 'gp', 'team'] },
  add_contact: { module: 'contacts', roles: ['gp', 'team'] },
  add_pipeline_investor: { module: 'fundraising', roles: ['gp', 'team'] }
} as const
export type ActionKind = keyof typeof ACTION_KINDS
const SEC_STATUS = ['new', 'reviewing', 'interested', 'invested', 'passed', 'expired']

export const calculator: ATool = {
  name: 'calculate', module: null,
  description: 'Compute figures exactly instead of estimating: growth rates, runway (cash / burn), multiples, ownership after dilution, sums and averages. Give one or more named expressions; later ones can use earlier names. Supports + - * / ^ %, brackets, min max round abs sqrt pow log exp.',
  input_schema: S({ steps: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', description: 'a_name for the result' }, expr: { type: 'string', description: 'e.g. (120000 - 95000) / 95000 * 100' } }, required: ['name', 'expr'] }, description: 'Up to 20 steps.' } }, ['steps']),
  run: async (a) => {
    const vars: Record<string, number> = {}, out: Record<string, number | string> = {}
    for (const s of (Array.isArray(a.steps) ? a.steps : []).slice(0, 20)) {
      const name = str(s?.name, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'x'
      try { const v = calc(str(s?.expr, 300), vars); vars[name] = v; out[name] = Math.round(v * 1e6) / 1e6 } catch (e) { out[name] = 'error: ' + (e as Error).message }
    }
    return out
  }
}

export const proposeAction: ATool = {
  name: 'propose_action', module: null,
  description: 'Offer the person a one-click action (they must click to confirm; nothing happens otherwise). Kinds: secondary_status {deal, status} to set a Secondaries opportunity to new, reviewing, interested, passed or expired; add_contact {name, email, firm, list} to add someone to Contacts (and a list); add_pipeline_investor {pipeline, investor, amount, stage} to add an investor to a fundraising pipeline. Use names as the person said them. Only propose when it clearly helps.',
  input_schema: S({ kind: { type: 'string', enum: Object.keys(ACTION_KINDS) }, args: { type: 'object', description: 'Arguments for that kind.' }, label: { type: 'string', description: 'Button text, under 40 characters, e.g. "Mark Mercury as interested".' } }, ['kind', 'args', 'label']),
  run: async (a, c) => {
    const kind = a.kind as ActionKind, spec = ACTION_KINDS[kind]
    if (!spec) return { error: 'Unknown action.' }
    if (!(await usableModules(c.roles, c.event)).has(spec.module) || !c.roles.some((r) => (spec.roles as readonly string[]).includes(r) || r === 'admin')) return { error: 'This person cannot do that here.' }
    const g = (a.args ?? {}) as Record<string, unknown>
    let args: Record<string, unknown>, summary: string
    if (kind === 'secondary_status') {
      const st = str(g.status, 20).toLowerCase(); if (!SEC_STATUS.includes(st) || st === 'invested') return { error: 'Status must be new, reviewing, interested, passed or expired (record investments on the deal).' }
      const q = str(g.deal ?? g.id, 120)
      const d = (await db().query<{ id: string; title: string; company: string | null; status: string }>("SELECT id, title, company, status FROM wm.secondaries WHERE id::text = $1 OR company ILIKE $2 OR title ILIKE $2 ORDER BY (id::text = $1) DESC, received_at DESC LIMIT 2", [q, '%' + q + '%'])).rows
      if (!d.length) return { error: 'No opportunity matches "' + q + '".' }
      if (d.length > 1 && d[0]!.id !== q) return { error: 'More than one opportunity matches "' + q + '": be more specific.' }
      if (d[0]!.status === 'invested') return { error: (d[0]!.company || d[0]!.title) + ' is already invested; its status stays.' }
      args = { id: d[0]!.id, status: st }; summary = 'Set ' + (d[0]!.company || d[0]!.title) + ' to ' + st
    } else if (kind === 'add_contact') {
      const email = str(g.email, 254).toLowerCase(), name = str(g.name, 200)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return { error: 'A contact needs a name and a valid email.' }
      args = { name, email, firm: str(g.firm, 200) || null, list: str(g.list, 80) || null }; summary = 'Add ' + name + ' <' + email + '> to Contacts' + (args.list ? ' (list ' + args.list + ')' : '')
    } else {
      const pl = (await db().query<{ id: string; name: string }>("SELECT id, name FROM crm.pipelines WHERE name ILIKE $1 ORDER BY status = 'open' DESC, created_at DESC LIMIT 1", ['%' + str(g.pipeline, 120) + '%'])).rows[0]
      if (!pl) return { error: 'No pipeline matches "' + str(g.pipeline) + '".' }
      const inv = str(g.investor, 200); if (!inv) return { error: 'Name the investor.' }
      const amount = g.amount == null || g.amount === '' ? null : Number(String(g.amount).replace(/[,$\s]/g, ''))
      args = { pipeline_id: pl.id, investor: inv, amount: amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null, stage: str(g.stage, 60) || null }; summary = 'Add ' + inv + ' to ' + pl.name + (args.amount ? ' for ' + Number(args.amount).toLocaleString('en-US') : '')
    }
    return { action: { type: 'do', kind, args, label: str(a.label, 40) || summary.slice(0, 40), summary }, note: 'Shown as a button; the person decides.' }
  }
}

export const aidiExtra: ATool[] = [
  { name: 'secondaries', module: 'secondaries', description: 'Secondaries / SPV opportunities (from deal alerts or added by hand): company, what it is, sector, stage, lead and co-investors, minimum, valuation or cap, days left, status, whether it fits our criteria, the AI screen (score, verdict, summary), wealth clients interested, and amount invested. Filter by status (open = new/reviewing/interested) or text.', input_schema: S({ status: { type: 'string', description: 'open, new, reviewing, interested, invested, passed, expired or all' }, q: { type: 'string' } }),
    run: async (a) => {
      const st = str(a.status, 20) || 'open'
      const rows = (await db().query<Record<string, any>>(`SELECT s.id, s.company, s.title, s.sector, s.stage, s.source, s.lead, s.co_investors, s.min_investment::float, s.valuation, to_char(s.closes_at, 'YYYY-MM-DD') AS closes_at, s.status, s.fits, s.fit_note, s.amount::float AS invested, s.ai_screen,
          (SELECT count(*)::int FROM wm.secondary_interest i WHERE i.secondary_id = s.id AND i.status <> 'withdrawn') AS clients_interested
        FROM wm.secondaries s WHERE ($1 = 'all' OR ($1 = 'open' AND s.status IN ('new','reviewing','interested')) OR s.status = $1) AND ($2 = '' OR s.company ILIKE '%' || $2 || '%' OR s.title ILIKE '%' || $2 || '%' OR s.lead ILIKE '%' || $2 || '%' OR s.sector ILIKE '%' || $2 || '%')
        ORDER BY s.received_at DESC LIMIT 25`, [st, str(a.q, 60)])).rows
      return rows.map((r) => ({ company: r.company, what: String(r.title).slice(0, 140), sector: r.sector, stage: r.stage, platform: r.source, lead: r.lead, co_investors: r.co_investors, minimum_usd: r.min_investment, valuation_or_cap: r.valuation, days_left: daysTo(r.closes_at), status: r.status, fits_criteria: r.fits, criteria_note: r.fit_note,
        ai_screen: r.ai_screen ? { score: r.ai_screen.score, verdict: r.ai_screen.recommendation, summary: (r.ai_screen.summary ?? []).join(' '), concerns: (r.ai_screen.concerns ?? []).slice(0, 2) } : null, clients_interested: r.clients_interested, invested_usd: r.invested }))
    } },
  { name: 'wealth_risk', module: 'wealth_mgmt', description: "Wealth clients' risk levels against their holdings: who has no risk level yet, and whose holdings are riskier than their level (holdings above the allowed rating, or too much in high-risk assets).", input_schema: S(),
    run: async () => {
      const cl = (await db().query<{ id: string; name: string; risk_profile: string | null }>("SELECT id, name, risk_profile FROM wm.clients WHERE status <> 'closed' ORDER BY name LIMIT 40")).rows
      const out = { no_level: [] as string[], outside_level: [] as unknown[], fine: 0 }
      for (const c of cl) {
        if (!c.risk_profile) { out.no_level.push(c.name); continue }
        const r = (await clientSummary(c.id)).risk
        if (r.ok || (!r.over.length && !r.over_high)) out.fine++
        else out.outside_level.push({ client: c.name, level: r.label, high_risk_pct: r.high_pct, limit_pct: r.max_high_pct, riskier_holdings: r.over.slice(0, 5).map((o) => o.name + ' (' + o.category + ')') })
      }
      return out
    } },
  { name: 'pitches', module: 'pitches', description: 'Pitches received (company, sector, stage, country, raising, status) with the latest AI screening score and recommendation. Filter by status or text.', input_schema: S({ status: { type: 'string' }, q: { type: 'string' } }),
    run: async (a) => (await db().query(`SELECT p.company, p.one_liner, p.sector, p.stage, p.country, p.raising_usd::float, p.status, p.funding_type, to_char(p.received_at, 'YYYY-MM-DD') AS received, s.score, s.recommendation
        FROM deals.pitches p LEFT JOIN LATERAL (SELECT score, recommendation FROM deals.screenings x WHERE x.pitch_id = p.id ORDER BY x.created_at DESC LIMIT 1) s ON true
       WHERE ($1 = '' OR p.status = $1) AND ($2 = '' OR p.company ILIKE '%' || $2 || '%' OR p.sector ILIKE '%' || $2 || '%' OR p.one_liner ILIKE '%' || $2 || '%') ORDER BY p.received_at DESC LIMIT 20`, [str(a.status, 30), str(a.q, 60)])).rows },
  { name: 'notices', module: 'notices', description: 'Notices (registered agent, state, tax, bank and legal emails): open ones with the AI summary, the action needed, the due date and which entity.', input_schema: S({ all: { type: 'boolean', description: 'Include done ones' } }),
    run: async (a) => (await db().query(`SELECT n.subject, n.from_name, to_char(n.received_at, 'YYYY-MM-DD') AS received, n.status, n.summary, n.action, to_char(n.due_date, 'YYYY-MM-DD') AS due, (n.due_date - current_date)::int AS days_left, e.name AS entity
        FROM inbox.notices n LEFT JOIN core.entities e ON e.id = n.entity_id WHERE $1 OR n.status <> 'done' ORDER BY n.due_date NULLS LAST, n.received_at DESC LIMIT 20`, [a.all === true])).rows },
  { name: 'fundraising_clients', module: 'cs_raise', description: 'Fundraising clients (the raise service for founders): each client with target, round, status, investors by stage, amount committed and closed.', input_schema: S(),
    run: async () => (await db().query(`SELECT c.name AS client, p.round, p.currency, p.target::float, p.status, p.fee_pct::float,
        (SELECT json_object_agg(x.status, x.n) FROM (SELECT status, count(*)::int AS n FROM services.raise_investors WHERE program_id = p.id GROUP BY status) x) AS investors_by_stage,
        (SELECT coalesce(sum(committed), 0)::float FROM services.raise_investors WHERE program_id = p.id AND status IN ('committed','closed')) AS committed,
        (SELECT coalesce(sum(committed), 0)::float FROM services.raise_investors WHERE program_id = p.id AND status = 'closed') AS closed
        FROM services.raise_programs p JOIN services.clients c ON c.id = p.client_id ORDER BY p.updated_at DESC LIMIT 20`)).rows }]

export const finvryExtra: ATool[] = [
  { name: 'spend_and_cuts', module: 'banking_treasury', description: 'Banking & Treasury: money in and out by month from the bank ledger, spend by category against budget, top vendors, the biggest changes, tools doing the same job, recurring payments and the cut list (each with the runway it would give back), and what is already marked to cancel.', input_schema: S(),
    run: async () => { const t = await treasuryView(); return { currency: t.currency, months: t.months.slice(-6), burn: t.burn, runway: t.runway, marked_to_cancel_monthly: t.marked_monthly, runway_if_cut: t.runway_if_cut, by_category: t.by_category.slice(0, 10).map((c) => ({ category: c.label, last_month: Math.round(c.last), previous: Math.round(c.prev), budget: c.budget })),
      top_vendors: t.top_vendors.slice(0, 10).map((v) => ({ vendor: v.name, category: v.category, last_month: Math.round(v.last), twelve_months: Math.round(v.total), monthly: v.recurring })), duplicates: t.duplicates, cut_list: t.cut_list.slice(0, 12).map((v) => ({ vendor: v.name, monthly: v.monthly, runway_gain: v.runway_gain, status: v.status })), transactions: t.ledger.count } } },
  { name: 'stage_monitor', module: 'stage_monitor', description: "The company's Stage Monitor: funding stage (from the cap table) and operating stage (from revenue), health (profitable, default alive, default dead, struggling, critical), runway and the month cash runs out, the month revenue overtakes costs at today's trends, equity and debt readiness scores (0-100, Medium and Scale plans) and what would move them up. Indicative only, not a valuation or credit decision.", input_schema: S(),
    run: async (_a, c) => { const s = await stageMonitor(c.event); return { funding_stage: s.funding.label, funding_basis: s.funding.basis, operating_stage: s.operating.label, arr_usd: s.operating.arr_usd, health: s.health.label, health_note: s.health.note, runway_months: s.runway.months, cash_runs_out: s.runway.cash_out, revenue_overtakes_costs: s.alive?.cross ?? null, cash_zero_at_trend: s.alive?.zero ?? null,
      equity_readiness: s.equity ? { score: s.equity.total, likelihood: s.equity.likelihood } : 'Medium plan', debt_readiness: s.debt ? { score: s.debt.total, likelihood: s.debt.likelihood } : 'Medium plan', what_moves_you_up: s.moves.map((m) => m.fix + ' (+' + m.gain + ' ' + m.of.toLowerCase() + ')') } } },
  { name: 'contact_lists', module: 'contacts', description: 'Contacts and lists: how many contacts, how many are unsubscribed, and each list (e.g. Shareholders, Investors) with members and how many receive updates.', input_schema: S(),
    run: async () => ({ contacts: Number((await db().query('SELECT count(*)::int AS n FROM crm.contacts')).rows[0]?.n ?? 0), unsubscribed: Number((await db().query('SELECT count(*)::int AS n FROM crm.contacts WHERE NOT subscribed')).rows[0]?.n ?? 0),
      lists: (await db().query('SELECT l.name, count(m.contact_id)::int AS members, count(m.contact_id) FILTER (WHERE c.subscribed)::int AS receive_updates FROM crm.lists l LEFT JOIN crm.list_members m ON m.list_id = l.id LEFT JOIN crm.contacts c ON c.id = m.contact_id GROUP BY l.id ORDER BY l.name')).rows }) },
  { name: 'data_room', module: 'fundraising', description: 'Data room links: views, last viewed, and who looked at which files and for how long in the last 30 days.', input_schema: S(),
    run: async () => ({ links: (await db().query("SELECT name, views, to_char(last_viewed_at, 'YYYY-MM-DD') AS last_viewed, revoked, (expires_at < now()) AS expired FROM fundraise.links ORDER BY last_viewed_at DESC NULLS LAST LIMIT 15").catch(() => ({ rows: [] }))).rows,
      recent: (await db().query("SELECT coalesce(v.viewer_email, 'anonymous') AS viewer, f.title AS file, sum(coalesce(v.seconds, 0))::int AS seconds, count(*)::int AS opens, to_char(max(v.started_at), 'YYYY-MM-DD') AS last FROM fundraise.views v JOIN fundraise.files f ON f.id = v.file_id WHERE v.started_at > now() - interval '30 days' GROUP BY 1, 2 ORDER BY max(v.started_at) DESC LIMIT 25").catch(() => ({ rows: [] }))).rows }) },
  { name: 'custom_metrics', module: 'financials', description: 'Custom metrics (KPIs such as customers, ARR, MRR, churn, headcount, revenue in another currency) by month for the last 12 months, plus quarterly and yearly statements kept (for example from a linked financial model).', input_schema: S(),
    run: async () => {
      const ent = await companyEntityId(); if (!ent) return { note: 'No company entity yet.' }
      const m = (await db().query<{ period_end: string; kpis: Record<string, number> }>("SELECT to_char(period_end, 'YYYY-MM') AS period_end, kpis FROM financials.statements WHERE entity_id = $1 AND period_type = 'month' AND kpis <> '{}'::jsonb ORDER BY period_end DESC LIMIT 12", [ent])).rows.reverse()
      const other = (await db().query("SELECT period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, currency, lines, kpis FROM financials.statements WHERE entity_id = $1 AND period_type IN ('quarter','year') ORDER BY period_end DESC LIMIT 8", [ent])).rows
      return { monthly_metrics: m, quarters_and_years: other }
    } }]

// Newer Finvry features: customer revenue (retention, churn, customer analysis), subsidiaries, the burn check and the
// annual financial report.
finvryExtra.push(
  { name: 'customer_retention', module: 'fin_customers', description: 'Revenue retention and churn from the customer revenue the company uploaded or linked: net and gross revenue retention (12 months), customer churn, new / expansion / contraction / churned revenue in the last 3 months, retention by group (size bands Enterprise / Mid-market / SMB, or segment, sector, plan, country), cohort retention, and how customer revenue compares with revenue in Financials. Also whether a live sheet feeds it and possible duplicate customers to merge.', input_schema: S(),
    run: async () => {
      const cs = await loadCustomers(); if (!cs.length) return { note: 'No customer revenue yet. Add it under Financials → Revenue retention (upload any layout, PDF or Word, or link a Google Sheet).' }
      const cfg = await customerConfig(), l = await customerLink()
      return { ...(customerFacts('retention', cs, cfg, await financialsRevenue(cfg.currency)) ?? {}), live_sheet: l.url ? { name: l.name, last_read: l.synced_at, error: l.error, possible_duplicates: (l.result?.possible ?? []).slice(0, 8).map((d) => d.names) } : null, page: '/financials/retention' }
    } },
  { name: 'customer_analysis', module: 'fin_customers', description: 'Customer analysis: top customers and their share of revenue, concentration (top 1 / 5 / 10, how many customers make 80% of revenue), fastest growing and biggest declines, sectors, average revenue per customer, lifetime value, LTV to CAC and payback when acquisition cost is given.', input_schema: S(),
    run: async () => {
      const cs = await loadCustomers(); if (!cs.length) return { note: 'No customer revenue yet. Add it under Financials → Customers.' }
      const cfg = await customerConfig()
      return { ...(customerFacts('customers', cs, cfg, await financialsRevenue(cfg.currency)) ?? {}), page: '/financials/customers' }
    } },
  { name: 'subsidiaries', module: 'financials', description: 'The company and its subsidiaries, each with its own Financials page (name and currency), and the latest revenue, net income and cash for each; the group view adds them up at the latest daily rate.', input_schema: S(),
    run: async () => {
      const es = (await db().query<{ id: string; name: string; currency: string | null; main: boolean }>("SELECT id, name, currency, parent_id IS NULL AS main FROM core.entities WHERE kind = 'operating' AND status <> 'closed' ORDER BY (parent_id IS NOT NULL), created_at")).rows
      const out = []
      for (const e of es) {
        const r = (await db().query<{ period_end: string; currency: string; lines: Record<string, number> }>("SELECT to_char(period_end, 'YYYY-MM') AS period_end, currency, lines FROM financials.statements WHERE entity_id = $1 AND period_type = 'month' ORDER BY period_end DESC LIMIT 1", [e.id])).rows[0]
        out.push({ name: e.name, is_subsidiary: !e.main, currency: r?.currency ?? e.currency, latest_month: r?.period_end ?? null, revenue: r?.lines.revenue ?? null, net_income: r?.lines.net_income ?? null, cash: r?.lines.cash ?? null })
      }
      return { entities: out, note: es.length > 1 ? 'Pick a subsidiary or "Group" from the name next to Financials.' : 'No subsidiaries yet: add one from the name next to Financials (paid plans).' }
    } },
  { name: 'burn_check', module: 'financials', description: 'Burn and runway checked on the last three months (operating and investing cash flow; cash flow worked out from the balance sheet, i.e. the loss adjusted for payables, receivables and other working capital; fall in cash excluding money raised; net loss with depreciation added back): the figure used, the runway, the cash date, what explains a gap between cash burn and the loss, and anything that does not add up.', input_schema: S(),
    run: async () => {
      const ent = await companyEntityId(); if (!ent) return { note: 'No company entity yet.' }
      const rows = (await db().query<{ period_end: string; period_type: string; currency: string; lines: Record<string, number> }>("SELECT to_char(period_end, 'YYYY-MM-DD') AS period_end, period_type, currency, lines FROM financials.statements WHERE entity_id = $1 AND period_type = 'month' ORDER BY period_end", [ent])).rows
      // Same basis as Financials: burn and runway count treasury bills, trading them is not burn.
      const sec = await cashPolicy()
      const r = burnReview(rows.map((x) => ({ ...x, kpis: {}, derived: withSecurities(deriveLines(x.lines, 1), sec) })))
      return { monthly_burn: r.burn, basis: r.basis, runway_months: r.runway, cash: r.cash, cash_as_of: r.cash_at, methods: r.methods.map((m) => ({ method: m.label, monthly: m.value === null ? null : Math.round(m.value) })), status: r.status, issues: r.issues, notes: r.notes, drivers: r.drivers.map((d) => d.label), burn_at_loss: r.loss_burn, runway_if_bills_paid: r.runway_at_loss }
    } })

export const sheetsTool: ATool = { name: 'linked_sheets', module: 'financials', description: 'Spreadsheets linked to Financials or forecasts: when each last synced, how many periods it brought in, any error, and (for workbooks read with AI) the figures worth adding to the sheet.', input_schema: S(),
  run: async () => (await db().query<Record<string, any>>("SELECT l.name, l.target, l.mode, l.currency, to_char(l.last_synced_at, 'YYYY-MM-DD HH24:MI') AS last_synced, l.last_error AS error, l.last_result, l.ai_map->'suggestions' AS suggestions FROM financials.sheet_links l ORDER BY l.created_at").catch(() => ({ rows: [] }))).rows
    .map((r) => ({ name: r.name, feeds: r.target, read_with_ai: r.mode === 'ai', currency: r.currency, last_synced: r.last_synced, periods_brought_in: r.last_result?.months ?? null, skipped: r.last_result?.skipped ?? [], error: r.error, worth_adding: (r.suggestions ?? []).map((s: { metric: string }) => s.metric) })) }

// Pages the analyst may link to: in-app paths only (never another site).
export const safePath = (p: unknown): string | null => { const s = String(p ?? ''); return /^\/(?![/\\])[A-Za-z0-9/_\-?=&.%]*$/.test(s) && s.length <= 120 ? s : null }
