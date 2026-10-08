// The AI analyst: a small, cheap model with read-only tools. Nothing is sent up front except a short system prompt;
// the model asks for exactly the data a question needs, tool results are trimmed, and only the last few turns travel.
import type { H3Event } from 'h3'
const MODEL = 'claude-haiku-4-5-20251001'
const PRICE = { input: 1, output: 5 } // USD per million tokens
const cut = (v: unknown, n = 2500) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…(trimmed)' : s }
interface Tool { name: string; description: string; input_schema: Record<string, unknown>; run: (a: Record<string, any>) => Promise<unknown> }
const S = (props: Record<string, unknown> = {}, req: string[] = []) => ({ type: 'object', properties: props, required: req })
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
  { name: 'compliance_deadlines', description: 'Upcoming filing and renewal deadlines.', input_schema: S({ days: { type: 'integer', description: 'Look ahead this many days (default 90).' } }),
    run: async (a) => (await db().query("SELECT title, category, jurisdiction, to_char(next_due, 'YYYY-MM-DD') AS due, (next_due - current_date)::int AS days_left FROM compliance.obligations WHERE active AND next_due <= current_date + $1::int ORDER BY next_due LIMIT 15", [Math.min(Number(a.days) || 90, 365)])).rows },
  { name: 'find_contacts', description: 'Search contacts (investors, advisers, partners) by name, firm or email.', input_schema: S({ q: { type: 'string' } }, ['q']),
    run: async (a) => (await db().query('SELECT name, email, firm, title FROM crm.contacts WHERE name ILIKE $1 OR firm ILIKE $1 OR email ILIKE $1 ORDER BY name LIMIT 10', ['%' + String(a.q).slice(0, 60) + '%'])).rows },
  { name: 'open_page', description: 'Offer the user a link to a page in the app (for example /financials, /compliance, /updates).', input_schema: S({ path: { type: 'string' }, label: { type: 'string' } }, ['path', 'label']),
    run: async (a) => ({ action: { type: 'open', path: String(a.path).startsWith('/') ? String(a.path).slice(0, 120) : '/', label: String(a.label).slice(0, 40) } }) }]
const finvry: Tool[] = [
  { name: 'company_metrics', description: "The company's latest monthly metrics (revenue, margins, burn, runway, cash) with the previous month.", input_schema: S(),
    run: async () => { const e = await companyEntityId(); return e ? metricsFor('entity:' + e) : { note: 'No company entity yet.' } } },
  { name: 'statements', description: "The company's statements for recent periods.", input_schema: S({ period: { type: 'string', enum: ['month', 'quarter', 'year'] }, count: { type: 'integer' } }),
    run: async (a) => { const e = await companyEntityId(); if (!e) return []; const r = await loadStatements('entity:' + e, a.period || 'month', 'USD'); return r.slice(-Math.min(Number(a.count) || 6, 12)).map((x) => ({ period_end: x.period_end, lines: x.lines })) } },
  { name: 'fundraising', description: 'Fundraising pipelines with investors, stages and amounts.', input_schema: S(),
    run: async () => (await db().query("SELECT p.name, p.currency, p.target::float, p.status, (SELECT json_agg(json_build_object('investor', d.investor, 'stage', s.name, 'amount', d.amount::float) ORDER BY d.updated_at DESC) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id) AS investors FROM crm.pipelines p ORDER BY p.created_at DESC LIMIT 3")).rows },
  { name: 'investor_updates', description: 'Recent investor updates with status and open counts.', input_schema: S(),
    run: async () => (await db().query("SELECT title, status, sent_at FROM financials.updates ORDER BY created_at DESC LIMIT 6").catch(() => ({ rows: [] }))).rows }]
const aidi: Tool[] = [
  { name: 'entity_metrics', description: 'Latest monthly metrics for a group entity or company, by name.', input_schema: S({ name: { type: 'string' } }, ['name']),
    run: async (a) => { const e = await entityByName(a.name); return e ? { entity: e.name, ...(await metricsFor('entity:' + e.id)) } : { note: 'No entity matches that name.' } } },
  { name: 'deal_pipeline', description: 'Venture deals in the pipeline, optionally filtered by stage or company name.', input_schema: S({ stage: { type: 'string' }, q: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT company, stage, round, raise_usd::float, check_usd::float, to_char(created_at, 'YYYY-MM-DD') AS added FROM deals.deals WHERE ($1 = '' OR stage ILIKE $1) AND ($2 = '' OR company ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT 15", [String(a.stage ?? ''), String(a.q ?? '')])).rows },
  { name: 'portfolio', description: 'Portfolio companies.', input_schema: S(),
    run: async () => (await db().query('SELECT name, founder_name, relationship, active FROM portfolio.companies ORDER BY name LIMIT 40')).rows },
  { name: 'fund_lps', description: 'LPs in the funds, optionally searched by name.', input_schema: S({ q: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT l.name, l.kind, l.country, l.kyc_status, (SELECT sum(c.amount)::float FROM funds.commitments c WHERE c.lp_id = l.id) AS committed FROM funds.lps l WHERE $1 = '' OR l.name ILIKE '%' || $1 || '%' ORDER BY l.name LIMIT 20", [String(a.q ?? '')]).catch(() => ({ rows: [] }))).rows },
  { name: 'holdings', description: 'Investments and assets in Investments & AUM, with values. Optionally filter by owner or category.', input_schema: S({ owner: { type: 'string' }, category: { type: 'string' } }),
    run: async (a) => (await db().query("SELECT h.name, h.category, h.platform, h.currency, h.current_value::float AS value, coalesce(c.name, h.client_name) AS owner FROM wealth.holdings h LEFT JOIN wm.clients c ON c.id = h.wm_client_id WHERE h.status NOT IN ('sold','written_off') AND ($1 = '' OR coalesce(c.name, h.client_name, '') ILIKE '%' || $1 || '%') AND ($2 = '' OR h.category = $2) ORDER BY h.current_value DESC NULLS LAST LIMIT 25", [String(a.owner ?? ''), String(a.category ?? '')])).rows },
  { name: 'wealth_client', description: "A wealth-management client's summary: net worth, invested, cash, holdings by class.", input_schema: S({ name: { type: 'string' } }, ['name']),
    run: async (a) => { const c = (await db().query<{ id: string; name: string }>('SELECT id, name FROM wm.clients WHERE name ILIKE $1 LIMIT 1', ['%' + a.name + '%'])).rows[0]; if (!c) return { note: 'No client matches.' }; const s = await clientSummary(c.id); return { client: c.name, totals: s.totals, by_class: s.by_class } } }]
export async function analystReply(event: H3Event, history: { role: 'user' | 'assistant'; content: string }[], path: string) {
  const { anthropicApiKey, anthropicBaseUrl } = useRuntimeConfig()
  if (!anthropicApiKey) throw apiError('ai_off', 'The AI analyst is not set up on this server.', 503)
  const gate = await aiGate()
  const org = await currentOrg(), isCo = org?.kind === 'company'
  const tools = [...(isCo ? finvry : aidi), ...common]
  const today = new Date().toISOString().slice(0, 10)
  const system = (isCo ? 'You are the AI analyst inside Finvry, helping a founder with their company: metrics, statements, fundraising, investor updates and compliance.' : 'You are the AI analyst inside Aidi OS, the internal platform of The Aidi Group: venture deals, portfolio, funds and LPs, group entities, wealth management and compliance.')
    + ' Today is ' + today + '. The user is on ' + path + '. Use tools to look things up; never invent figures. Be brief: a few sentences or a short list, with figures and dates. If a page would help, call open_page. You cannot change data; say how to do it in the app instead. Not investment, legal or tax advice.'
  const msgs: any[] = history.slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  const toolDefs = tools.map(({ run, ...t }, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t))
  const actions: unknown[] = []; let inTok = 0, outTok = 0, text = ''
  for (let round = 0; round < 4; round++) {
    const res = await fetch(anthropicBaseUrl.replace(/\/$/, '') + '/v1/messages', { method: 'POST', headers: { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], tools: toolDefs, messages: msgs }), signal: AbortSignal.timeout(45000) }).catch(() => null)
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
      try { out = t ? await t.run(c.input ?? {}) : { error: 'Unknown tool' } } catch (err) { out = { error: 'Could not load that.' }; console.error('[analyst]', c.name, err) }
      if (out && typeof out === 'object' && 'action' in (out as object)) actions.push((out as { action: unknown }).action)
      results.push({ type: 'tool_result', tool_use_id: c.id, content: cut(out) })
    }
    msgs.push({ role: 'user', content: results })
  }
  const cost = (inTok * PRICE.input + outTok * PRICE.output) / 1_000_000
  await db().query("INSERT INTO core.ai_runs (task, model, prompt_version, input_ref, output, valid, error, input_tokens, output_tokens, cost_usd, billed_to) VALUES ('analyst',$1,'analyst-v1',$2,$3,true,null,$4,$5,$6,$7)", [MODEL, path.slice(0, 120), JSON.stringify({ chars: text.length }), inTok, outTok, cost, gate.billed]).catch(() => {})
  if (gate.billed === 'credits' && gate.orgId) await aiChargeCredits(gate.orgId, inTok + outTok)
  return { text: text || 'I could not find an answer to that.', actions, tokens: inTok + outTok }
}
