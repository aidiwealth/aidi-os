// Finvry MCP server: connect Claude, ChatGPT, Cursor and other AI tools to your company's data (read-only).
// Streamable HTTP, JSON responses. Authorization: Bearer fv_live_… (a Data API read key).
const TOOLS = [
  { name: 'company_metrics', description: "Latest monthly metrics (revenue, margins, burn, runway, cash) and the previous month.", inputSchema: { type: 'object', properties: {} } },
  { name: 'statements', description: 'Financial statements for recent periods.', inputSchema: { type: 'object', properties: { period: { type: 'string', enum: ['month', 'quarter', 'year'] }, count: { type: 'integer', minimum: 1, maximum: 24 } } } },
  { name: 'compliance_deadlines', description: 'Upcoming filing and renewal deadlines.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365 } } } },
  { name: 'fundraising', description: 'Fundraising pipelines with investors, stages and amounts.', inputSchema: { type: 'object', properties: {} } },
  { name: 'contacts', description: 'Search your contacts (investors and others) by name, firm or email.', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }]
async function call(name: string, a: Record<string, any>, kind: string) {
  const subj = kind === 'company' ? await apiSubject(kind) : null
  if (name === 'company_metrics') { if (!subj) return { note: 'Available to company workspaces.' }; const r = await loadStatements(subj, 'month', 'USD'); const l = r[r.length - 1], p = r[r.length - 2]; return l ? { period_end: l.period_end, currency: l.currency, metrics: derive(l.lines, 'month'), previous: p ? { period_end: p.period_end, metrics: derive(p.lines, 'month') } : null } : { note: 'No statements yet.' } }
  if (name === 'statements') { if (!subj) return []; const r = await loadStatements(subj, a.period || 'month', 'USD'); return r.slice(-Math.min(Number(a.count) || 6, 24)).map((x) => ({ period_end: x.period_end, currency: x.currency, lines: x.lines })) }
  if (name === 'compliance_deadlines') return (await db().query("SELECT title, category, jurisdiction, to_char(next_due, 'YYYY-MM-DD') AS due, (next_due - current_date)::int AS days_left FROM compliance.obligations WHERE active AND next_due <= current_date + $1::int ORDER BY next_due LIMIT 30", [Math.min(Number(a.days) || 90, 365)])).rows
  if (name === 'fundraising') return (await db().query("SELECT p.name, p.currency, p.target::float, p.status, (SELECT json_agg(json_build_object('investor', d.investor, 'stage', s.name, 'amount', d.amount::float) ORDER BY d.updated_at DESC) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id) AS investors FROM crm.pipelines p ORDER BY p.created_at DESC LIMIT 5")).rows
  if (name === 'contacts') return (await db().query('SELECT name, email, firm, title FROM crm.contacts WHERE $1 = \'\' OR name ILIKE $2 OR firm ILIKE $2 OR email ILIKE $2 ORDER BY name LIMIT 25', [String(a.q ?? ''), '%' + String(a.q ?? '').slice(0, 60) + '%'])).rows
  throw new Error('Unknown tool')
}
export default defineEventHandler(async (event) => {
  if (getMethod(event) === 'GET') { setResponseStatus(event, 405); return { error: 'Use POST (MCP Streamable HTTP). See ' + getRequestURL(event).origin + '/developers#mcp' } }
  if (getMethod(event) === 'DELETE') return null
  const k = await requireApiKey(event, 'read')
  const msg = await readBody<{ jsonrpc: string; id?: string | number; method: string; params?: Record<string, any> }>(event)
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg.id === undefined) { setResponseStatus(event, 202); return null }
  switch (msg.method) {
    case 'initialize': return reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'finvry', title: 'Finvry', version: '1.0.0' }, instructions: 'Read-only access to this Finvry workspace: metrics, statements, fundraising, contacts and compliance deadlines.' })
    case 'ping': return reply({})
    case 'tools/list': return reply({ tools: TOOLS })
    case 'tools/call': {
      try { const out = await call(String(msg.params?.name), msg.params?.arguments ?? {}, k.kind); return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: Array.isArray(out) ? { items: out } : out }) }
      catch (err) { return reply({ content: [{ type: 'text', text: (err as Error).message || 'Tool failed' }], isError: true }) }
    }
    default: return fail(-32601, 'Method not found')
  }
})
