// The AI analyst: a small, cheap model with read-only tools. Nothing is sent up front except a short system prompt;
// the model asks for exactly the data a question needs, tool results are trimmed, and only the last few turns travel.
import type { H3Event } from 'h3'
const MODEL = 'claude-haiku-4-5-20251001'
const PRICE = { input: 1, output: 5 } // USD per million tokens
const cut = (v: unknown, n = 2500) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…(trimmed)' : s }
interface Ctx { event: H3Event; userId: string; roles: string[] }
// Each tool belongs to a module: it is offered only when that module is switched on and this person's role may use it
// (with the admin's choices on the Modules page). Data is read under the person's own access, so people limited to some
// companies only get those companies (row-level security, plus the minutes rule).
interface Tool { name: string; module: string | null; description: string; input_schema: Record<string, unknown>; run: (a: Record<string, any>, c: Ctx) => Promise<unknown> }
const S = (props: Record<string, unknown> = {}, req: string[] = []) => ({ type: 'object', properties: props, required: req })
const r2 = (n: number) => Math.round(n * 100) / 100
async function entityByName(name?: string): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  return (await db().query<{ id: string; name: string }>('SELECT id, name FROM core.entities WHERE name ILIKE $1 ORDER BY length(name) LIMIT 1', ['%' + name + '%'])).rows[0] ?? null
}
async function metricsFor(subject: string) {
  const rows = await loadStatements(subject, 'month', 'USD')
  const last = rows[rows.length - 1], prev = rows[rows.length - 2]
  if (!last) return { note: 'No statements yet.' }
  return { period_end: last.period_end, currency: last.currency, metrics: derive(last.lines, 'month'), previous: prev ? { period_end: prev.period_end, metrics: derive(prev.lines, 'month') } : null }
}
const common: Tool[] = [
  { name: 'compliance_deadlines', module: 'compliance', description: 'Upcoming filing and renewal deadlines (and overdue ones), by entity.', input_schema: S({ days: { type: 'integer', description: 'Look ahead this many days (default 90).' } }),
    run: async (a) => (await db().query("SELECT o.title, o.category, o.jurisdiction, e.name AS entity, to_char(o.next_due, 'YYYY-MM-DD') AS due, (o.next_due - current_date)::int AS days_left FROM compliance.obligations o LEFT JOIN core.entities e ON e.id = o.entity_id WHERE o.active AND o.next_due <= current_date + $1::int ORDER BY o.next_due LIMIT 20", [Math.min(Number(a.days) || 90, 365)])).rows },
  { name: 'find_contacts', module: 'contacts', description: 'Search contacts (investors, advisers, partners) by name, firm or email.', input_schema: S({ q: { type: 'string' } }, ['q']),
    run: async (a) => (await db().query('SELECT name, email, firm, title FROM crm.contacts WHERE name ILIKE $1 OR firm ILIKE $1 OR email ILIKE $1 ORDER BY name LIMIT 10', ['%' + String(a.q).slice(0, 60) + '%'])).rows },
  { name: 'meetings', module: 'meetings', description: 'Recent meeting minutes (title, date, company, summary) and open action items with owners and due dates. Optionally search by text.', input_schema: S({ q: { type: 'string' } }),
    run: async (a, c) => { const vis = meetingScope(c.event, c.userId, 2); const people = await orgPeople(), nm = (id?: string | null) => people.find((p) => p.id === id)?.name ?? null
      const rows = (await db().query<{ title: string; held_at: string; entity: string | null; status: string; summary: string | null; actions: MeetingAction[] }>("SELECT m.title, to_char(m.held_at, 'YYYY-MM-DD') AS held_at, e.name AS entity, m.status, m.summary, m.actions FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id WHERE ($1 = '' OR m.title ILIKE '%' || $1 || '%' OR m.summary ILIKE '%' || $1 || '%' OR m.notes ILIKE '%' || $1 || '%') AND " + vis.sql + ' ORDER BY m.held_at DESC LIMIT 8', [String(a.q ?? '').slice(0, 60), ...vis.params])).rows
      return rows.map((m) => ({ title: m.title, date: m.held_at, company: m.entity ?? 'Group-wide', status: m.status, summary: (m.summary ?? '').slice(0, 300), open_actions: (m.actions ?? []).filter((x) => !x.done).map((x) => ({ text: x.text, owner: nm(x.owner_id) ?? x.owner ?? null, due: x.due ?? null })) })) } },
  { name: 'decks', module: 'decks', description: 'Pitch decks shared by link, with visits, unique viewers, average time and the last view.', input_schema: S(),
    run: async () => (await db().query("SELECT d.title, d.primary_deck AS main, count(v.id)::int AS visits, count(DISTINCT coalesce(v.email, v.visitor_key))::int AS unique_viewers, coalesce(avg(v.seconds), 0)::int AS avg_seconds, to_char(max(v.last_at), 'YYYY-MM-DD') AS last_view FROM fundraise.decks d LEFT JOIN fundraise.deck_visits v ON v.deck_id = d.id WHERE d.active GROUP BY d.id ORDER BY d.primary_deck DESC, d.updated_at DESC LIMIT 8")).rows },
  { name: 'open_page', module: null, description: 'Offer the user a link to a page in the app. Only use paths from the list of areas in your instructions.', input_schema: S({ path: { type: 'string' }, label: { type: 'string' } }, ['path', 'label']),
    run: async (a) => ({ action: { type: 'open', path: String(a.path).startsWith('/') ? String(a.path).slice(0, 120) : '/', label: String(a.label).slice(0, 40) } }) }]
const finvry: Tool[] = [
  { name: 'company_metrics', module: 'financials', description: "The company's latest monthly metrics (revenue, margins, burn, runway, cash) with the previous month.", input_schema: S(),
    run: async () => { const e = await companyEntityId(); return e ? metricsFor('entity:' + e) : { note: 'No company entity yet.' } } },
  { name: 'statements', module: 'financials', description: "The company's statements for recent periods.", input_schema: S({ period: { type: 'string', enum: ['month', 'quarter', 'year'] }, count: { type: 'integer' } }),
    run: async (a) => { const e = await companyEntityId(); if (!e) return []; const r = await loadStatements('entity:' + e, a.period || 'month', 'USD'); return r.slice(-Math.min(Number(a.count) || 6, 12)).map((x) => ({ period_end: x.period_end, lines: x.lines })) } },
  { name: 'fundraising', module: 'fundraising', description: 'Fundraising pipelines (target, instrument, close date) with investors, stages and amounts.', input_schema: S(),
    run: async () => (await db().query("SELECT p.name, p.currency, p.target::float, p.instrument, p.status, to_char(p.target_close, 'YYYY-MM-DD') AS target_close, (SELECT json_agg(json_build_object('investor', d.investor, 'stage', s.name, 'amount', d.amount::float) ORDER BY d.updated_at DESC) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id) AS investors FROM crm.pipelines p ORDER BY p.created_at DESC LIMIT 3")).rows },
  { name: 'investor_updates', module: 'updates', description: 'Recent investor updates: title, period, status, when sent and to how many.', input_schema: S(),
    run: async () => (await db().query("SELECT title, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, status, to_char(sent_at, 'YYYY-MM-DD') AS sent, sent_count FROM financials.updates WHERE NOT coalesce(is_template, false) ORDER BY created_at DESC LIMIT 6").catch(() => ({ rows: [] }))).rows }]
const aidi: Tool[] = [
  { name: 'entity_metrics', module: 'financials', description: 'Latest monthly metrics (revenue, margins, burn, runway, cash) for a group entity or company, by name.', input_schema: S({ name: { type: 'string' } }, ['name']),
    run: async (a) => { const e = await entityByName(a.name); return e ? { entity: e.name, ...(await metricsFor('entity:' + e.id)) } : { note: 'No entity matches that name.' } } },
  { name: 'entities', module: 'entities', description: 'Group entities (companies, funds, trusts, SPVs) with type, jurisdiction, status and parent.', input_schema: S(),
    run: async () => (await db().query("SELECT e.name, e.kind, e.jurisdiction, e.status, p.name AS parent FROM core.entities e LEFT JOIN core.entities p ON p.id = e.parent_id ORDER BY e.kind, e.name LIMIT 60").catch(async () => db().query('SELECT name, kind, jurisdiction, status FROM core.entities ORDER BY kind, name LIMIT 60'))).rows },
  { name: 'deal_pipeline', module: 'pipeline', description: 'Venture deals in the pipeline (stage, round, raise, cheque, valuation), optionally filtered by stage or company name.', input_schema: S({ stage: { type: 'string' }, q: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT company, stage, round, raise_usd::float, check_usd::float, valuation_usd::float, to_char(created_at, 'YYYY-MM-DD') AS added, to_char(stage_since, 'YYYY-MM-DD') AS in_stage_since FROM deals.deals WHERE ($1 = '' OR stage ILIKE $1) AND ($2 = '' OR company ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT 15", [String(a.stage ?? ''), String(a.q ?? '')])).rows },
  { name: 'portfolio', module: 'portfolio', description: 'Portfolio companies: founder, relationship, holding entity, whether linked to Finvry.', input_schema: S(),
    run: async () => (await db().query('SELECT c.name, c.founder_name, c.relationship, c.active, e.name AS held_by, (c.finvry_org_id IS NOT NULL) AS on_finvry FROM portfolio.companies c LEFT JOIN core.entities e ON e.id = c.holding_entity_id ORDER BY c.name LIMIT 40')).rows },
  { name: 'funds', module: 'funds', description: 'Funds: vintage, target size, status, LP count, commitments and amounts invested.', input_schema: S(),
    run: async () => (await db().query("SELECT e.name, f.currency, f.target_size::float, f.vintage, f.status, (SELECT count(DISTINCT c.lp_id)::int FROM funds.commitments c WHERE c.fund_id = f.id) AS lps, (SELECT coalesce(sum(c.amount), 0)::float FROM funds.commitments c WHERE c.fund_id = f.id) AS committed, (SELECT coalesce(sum(d.amount), 0)::float FROM finance.deployments d WHERE d.fund_id = f.id) AS invested FROM funds.funds f JOIN core.entities e ON e.id = f.entity_id ORDER BY f.vintage DESC NULLS LAST").catch(() => ({ rows: [] }))).rows },
  { name: 'fund_lps', module: 'funds', description: 'LPs in the funds, optionally searched by name, with KYC status and commitments.', input_schema: S({ q: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT l.name, l.kind, l.country, l.kyc_status, (SELECT sum(c.amount)::float FROM funds.commitments c WHERE c.lp_id = l.id) AS committed FROM funds.lps l WHERE $1 = '' OR l.name ILIKE '%' || $1 || '%' ORDER BY l.name LIMIT 20", [String(a.q ?? '')]).catch(() => ({ rows: [] }))).rows },
  { name: 'credit_book', module: 'credit', description: 'Venture debt and loans: book per currency (outstanding, arrears, PAR 30), and each active loan with lender company, borrower, outstanding, days late and next payment.', input_schema: S(),
    run: async () => {
      const loans = (await db().query<{ id: string; borrower: string; country: string | null; lender: string | null; principal: string; currency: string; rate: string; status: string }>("SELECT l.id, b.name AS borrower, b.country, e.name AS lender, l.principal::text, l.currency, l.annual_rate::text AS rate, l.status FROM credit.loans l JOIN credit.borrowers b ON b.id = l.borrower_id LEFT JOIN core.entities e ON e.id = l.lender_entity_id WHERE l.status = 'active' ORDER BY l.disbursed_on DESC LIMIT 30")).rows
      const totals: Record<string, { outstanding: number; arrears: number; par30: number; loans: number }> = {}, list = []
      for (const l of loans) { const p = await loadPosition(l.id, Number(l.principal)); const t = (totals[l.currency] ??= { outstanding: 0, arrears: 0, par30: 0, loans: 0 }); t.loans++; t.outstanding = r2(t.outstanding + p.outstandingPrincipal); t.arrears = r2(t.arrears + p.arrears); if (p.dpd > 30) t.par30 = r2(t.par30 + p.outstandingPrincipal)
        list.push({ borrower: l.borrower, country: l.country, lent_by: l.lender, currency: l.currency, principal: Number(l.principal), rate_pct: Number(l.rate), outstanding: r2(p.outstandingPrincipal), arrears: r2(p.arrears), days_late: p.dpd, next_payment: p.next }) }
      return { totals, loans: list } } },
  { name: 'cash', module: 'banking', description: 'Bank accounts with the latest statement balance and date, by entity.', input_schema: S(),
    run: async () => (await db().query("SELECT e.name AS entity, a.bank_name, a.account_name, a.currency, s.closing_balance::float AS balance, to_char(s.period_end, 'YYYY-MM-DD') AS as_of FROM banking.accounts a JOIN core.entities e ON e.id = a.entity_id LEFT JOIN LATERAL (SELECT closing_balance, period_end FROM banking.statements WHERE account_id = a.id ORDER BY period_end DESC LIMIT 1) s ON true WHERE a.active ORDER BY e.name, a.bank_name LIMIT 40")).rows },
  { name: 'payments', module: 'expenses', description: 'Payments made (expenses) by entity and category for a period (default this year), with the latest ones.', input_schema: S({ from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }),
    run: async (a) => { const from = /^\d{4}-\d{2}-\d{2}$/.test(a.from ?? '') ? a.from : new Date().getUTCFullYear() + '-01-01', to = /^\d{4}-\d{2}-\d{2}$/.test(a.to ?? '') ? a.to : '2999-12-31'
      const by = (await db().query("SELECT coalesce(e.name, 'No entity') AS entity, x.category, x.currency, sum(x.amount)::float AS total, count(*)::int AS n FROM finance.expenses x LEFT JOIN core.entities e ON e.id = x.entity_id WHERE x.paid_on BETWEEN $1 AND $2 GROUP BY 1, 2, 3 ORDER BY total DESC LIMIT 25", [from, to])).rows
      const latest = (await db().query("SELECT to_char(x.paid_on, 'YYYY-MM-DD') AS paid_on, x.payee, x.category, x.amount::float, x.currency, e.name AS entity FROM finance.expenses x LEFT JOIN core.entities e ON e.id = x.entity_id ORDER BY x.paid_on DESC LIMIT 8")).rows
      return { from, to, by_entity_and_category: by, latest } } },
  { name: 'deployments', module: 'deployments', description: 'Money deployed (investments and loans paid out): date, company, amount, which entity paid, instrument.', input_schema: S({ q: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT to_char(d.paid_on, 'YYYY-MM-DD') AS paid_on, d.company, d.amount::float, d.currency, d.instrument, e.name AS paid_by FROM finance.deployments d LEFT JOIN core.entities e ON e.id = d.paying_entity_id WHERE $1 = '' OR d.company ILIKE '%' || $1 || '%' ORDER BY d.paid_on DESC LIMIT 15", [String(a.q ?? '')])).rows },
  { name: 'rentals', module: 'rentals', description: 'Rental & real estate (Aidi Haven): income, expenses (shared costs split by the cost model), profit, nights and occupancy for a period, per property, plus check-ins in the next 14 days.', input_schema: S({ period: { type: 'string', description: 'YYYY-MM, YYYY-Qn or YYYY (default last month).' } }),
    run: async (a) => { const period = PERIOD_RE.test(String(a.period ?? '')) ? String(a.period) : lastMonth()
      const all = await pnl(period, null), props = (await db().query<{ id: string }>('SELECT id FROM rentals.properties WHERE active ORDER BY sort, name')).rows
      const per = []; for (const p of props) { const x = await pnl(period, p.id); per.push({ property: x.title, income: x.income, expenses: x.expense_total, profit: x.profit, nights: x.nights }) }
      const soon = (await db().query("SELECT u.name AS unit, to_char(c.starts, 'YYYY-MM-DD') AS check_in, (c.ends - c.starts) AS nights FROM rentals.calendar c JOIN rentals.units u ON u.id = c.unit_id WHERE c.kind = 'reserved' AND c.starts BETWEEN current_date AND current_date + 14 ORDER BY c.starts LIMIT 10").catch(() => ({ rows: [] }))).rows
      return { period: all.label, all_properties: { income: all.income, expenses: all.expense_total, by_category: all.expenses.slice(0, 8), profit: all.profit, nights: all.nights }, per_property: per, upcoming_check_ins: soon } } },
  { name: 'holdings', module: 'wealth', description: 'Investments and assets in Investments & AUM, with values. Optionally filter by owner or category.', input_schema: S({ owner: { type: 'string' }, category: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT h.name, h.category, h.platform, h.currency, h.current_value::float AS value, coalesce(c.name, h.client_name) AS owner FROM wealth.holdings h LEFT JOIN wm.clients c ON c.id = h.wm_client_id WHERE h.status NOT IN ('sold','written_off') AND ($1 = '' OR coalesce(c.name, h.client_name, '') ILIKE '%' || $1 || '%') AND ($2 = '' OR h.category = $2) ORDER BY h.current_value DESC NULLS LAST LIMIT 25", [String(a.owner ?? ''), String(a.category ?? '')])).rows },
  { name: 'wealth_clients', module: 'wealth_mgmt', description: 'Wealth-management book: clients by country and status, and fees (due and paid this year).', input_schema: S(),
    run: async () => ({ clients: (await db().query("SELECT country, status, count(*)::int AS n FROM wm.clients GROUP BY 1, 2 ORDER BY 3 DESC")).rows,
      fees: (await db().query("SELECT currency, status, count(*)::int AS n, sum(amount)::float AS total FROM wm.fees WHERE coalesce(issue_date, created_at::date) >= date_trunc('year', current_date) GROUP BY 1, 2")).rows }) },
  { name: 'wealth_client', module: 'wealth_mgmt', description: "A wealth-management client's summary: net worth, invested, cash, holdings by class.", input_schema: S({ name: { type: 'string' } }, ['name']),
    run: async (a) => { const c = (await db().query<{ id: string; name: string }>('SELECT id, name FROM wm.clients WHERE name ILIKE $1 LIMIT 1', ['%' + a.name + '%'])).rows[0]; if (!c) return { note: 'No client matches.' }; const s = await clientSummary(c.id); return { client: c.name, totals: s.totals, by_class: s.by_class } } },
  { name: 'governance', module: 'governance', description: 'Trusts & governance: resolutions, minutes, consents and distributions, with status and approvals, by entity.', input_schema: S({ status: { type: 'string', enum: ['draft', 'circulating', 'approved', 'rejected'] } }),
    run: async (a) => (await db().query("SELECT e.name AS entity, r.kind, r.title, r.status, r.required_approvals, (SELECT count(*)::int FROM governance.approvals x WHERE x.resolution_id = r.id AND x.decision = 'approve') AS approvals, r.amount::float, r.currency, to_char(r.created_at, 'YYYY-MM-DD') AS created FROM governance.resolutions r JOIN core.entities e ON e.id = r.entity_id WHERE $1 = '' OR r.status = $1 ORDER BY r.created_at DESC LIMIT 12", [String(a.status ?? '')])).rows },
  { name: 'client_services', module: 'services', description: 'Client services (Finvry services desk): open jobs by status, overdue jobs, fees on completed jobs this year, and the busiest clients.', input_schema: S(),
    run: async () => ({ by_status: (await db().query('SELECT status, count(*)::int AS n FROM services.jobs GROUP BY 1 ORDER BY 2 DESC')).rows,
      overdue: (await db().query("SELECT j.title, c.name AS client, to_char(j.due_date, 'YYYY-MM-DD') AS due FROM services.jobs j LEFT JOIN services.clients c ON c.id = j.client_id WHERE j.due_date < current_date AND j.status NOT IN ('done', 'completed', 'cancelled') ORDER BY j.due_date LIMIT 10")).rows,
      fees_this_year_usd: Number((await db().query("SELECT coalesce(sum(fee_usd), 0)::float AS v FROM services.jobs WHERE completed_at >= date_trunc('year', now())")).rows[0]?.v ?? 0),
      top_clients: (await db().query("SELECT c.name, count(j.id)::int AS jobs, coalesce(sum(j.fee_usd), 0)::float AS fees_usd FROM services.clients c JOIN services.jobs j ON j.client_id = c.id GROUP BY c.id ORDER BY jobs DESC LIMIT 8")).rows }) }]
export async function analystReply(event: H3Event, history: { role: 'user' | 'assistant'; content: string }[], path: string) {
  const { anthropicApiKey, anthropicBaseUrl } = useRuntimeConfig()
  if (!anthropicApiKey) throw apiError('ai_off', 'The AI analyst is not set up on this server.', 503)
  const gate = await aiGate()
  const org = await currentOrg(), isCo = org?.kind === 'company'
  const user = event.context.user as SessionUser
  const roles = (event.context.realRoles as string[] | undefined) ?? user.roles
  // Only the areas this person can open: switched-on modules their role may use (Modules page choices included).
  const usable = await usableModules(roles, event)
  const tools = [...(isCo ? finvry : aidi), ...common].filter((t) => !t.module || usable.has(t.module))
  const ctx: Ctx = { event, userId: user.userId, roles }
  const areas = MODULES.filter((m) => usable.has(m.code) && m.to && !['team', 'modules', 'settings', 'wm_portal', 'client_raise'].includes(m.code)).map((m) => m.label + ' ' + m.to).join('; ')
  const scoped = String(event.context.entityScope ?? '').split(',').filter(Boolean).length > 0
  const today = new Date().toISOString().slice(0, 10)
  const system = (isCo
    ? 'You are the AI analyst inside Finvry, helping the founder and team of ' + (org?.name ?? 'this company') + ' with their own company: metrics and statements, fundraising, investor updates, decks, meetings and compliance.'
    : 'You are the AI analyst inside Aidi OS, the internal platform of The Aidi Group (family office and venture firm): group entities and financials, venture deals, portfolio, funds and LPs, credit (venture debt), bank and cash, payments, deployments, rentals (Aidi Haven), wealth management, trusts and governance, meeting minutes, client services and compliance.')
    + '\nToday is ' + today + '. The user is on ' + path + '.' + (scoped ? ' This user is limited to some companies: answer only from what the tools return, which is already limited to them.' : '')
    + '\nAreas this user can open (label and path): ' + (areas || 'none') + '. Only discuss and link these areas; if asked about anything else, say they do not have access and suggest asking an admin.'
    + '\nRules: use tools to look things up and never invent figures, names or dates. Keep currencies separate (never add USD to NGN). Say the period or as-of date of every figure. If a tool returns nothing, say so and say where in the app to add it. '
    + 'Never name third-party data vendors or providers (for example credit bureaus or bank-data services); say "credit check" or "bank feed". '
    + 'Be brief: a few sentences or a short list, figures in bold. Point out what needs attention (late, overdue, falling, missing). If a page would help, call open_page with one of the paths above. You cannot change data; say how to do it in the app. Not investment, legal or tax advice.'
  const msgs: any[] = history.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  const toolDefs = tools.map(({ run, module, ...t }, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t))
  const actions: unknown[] = []; let inTok = 0, outTok = 0, text = ''
  for (let round = 0; round < 5; round++) {
    const res = await fetch(anthropicBaseUrl.replace(/\/$/, '') + '/v1/messages', { method: 'POST', headers: { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], tools: toolDefs, messages: msgs }), signal: AbortSignal.timeout(45000) }).catch(() => null)
    if (!res || !res.ok) throw apiError('ai_failed', 'The AI analyst could not answer right now. Please try again.', 502)
    const body = await res.json() as { content: any[]; stop_reason: string; usage?: Record<string, number> }
    const u = body.usage ?? {}; inTok += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); outTok += u.output_tokens ?? 0
    text = body.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
    const calls = body.content.filter((c) => c.type === 'tool_use')
    if (body.stop_reason !== 'tool_use' || !calls.length) break
    msgs.push({ role: 'assistant', content: body.content })
    const results = []
    for (const c of calls) {
      const t = tools.find((x) => x.name === c.name)
      let out: unknown
      try { out = t ? await t.run(c.input ?? {}, ctx) : { error: 'Unknown tool' } } catch (err) { out = { error: 'Could not load that.' }; console.error('[analyst]', c.name, err) }
      if (out && typeof out === 'object' && 'action' in (out as object)) actions.push((out as { action: unknown }).action)
      results.push({ type: 'tool_result', tool_use_id: c.id, content: cut(out) })
    }
    msgs.push({ role: 'user', content: results })
  }
  const cost = (inTok * PRICE.input + outTok * PRICE.output) / 1_000_000
  await db().query("INSERT INTO core.ai_runs (task, model, prompt_version, input_ref, output, valid, error, input_tokens, output_tokens, cost_usd, billed_to) VALUES ('analyst',$1,'analyst-v2',$2,$3,true,null,$4,$5,$6,$7)", [MODEL, path.slice(0, 120), JSON.stringify({ chars: text.length }), inTok, outTok, cost, gate.billed]).catch(() => {})
  if (gate.billed === 'credits' && gate.orgId) await aiChargeCredits(gate.orgId, inTok + outTok)
  return { text: text || 'I could not find an answer to that.', actions, tokens: inTok + outTok }
}
