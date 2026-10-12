// Managed raise → the founder's Fundraising pipeline. An investor the services team adds can be placed in one of the
// founder's pipelines (or a new one). The deal shows the investor (firm) and stage, never the contact: no contact is
// linked and no email is copied. Later status and amount changes by the team follow it.
const STD: [string, string, string][] = [['Contacted', 'grey', 'open'], ['Meeting', 'blue', 'open'], ['Diligence', 'purple', 'open'], ['Term sheet', 'teal', 'committed'], ['Committed', 'amber', 'committed'], ['Closed', 'green', 'won'], ['Passed', 'red', 'lost']]
const NAME: Record<string, string[]> = { target: ['contacted'], contacted: ['contacted'], meeting: ['meeting'], diligence: ['diligence'], term_sheet: ['term sheet', 'signed'], committed: ['committed'], closed: ['closed', 'wired'], passed: ['passed'] }
const KIND: Record<string, string> = { term_sheet: 'committed', committed: 'committed', closed: 'won', passed: 'lost' }
const INSTR: Record<string, string> = { 'SAFE': 'safe', 'Priced equity': 'priced', 'Convertible note': 'convertible_note' }

async function inWorkspace<T>(orgId: string, fn: () => Promise<T>): Promise<T> { const prev = currentOrgId(); setOrgContext(orgId); try { return await fn() } finally { setOrgContext(prev) } }
async function programOf(programId: string) {
  return (await db().query<{ workspace_id: string | null; round: string | null; instrument: string | null; currency: string; target: string | null; pipeline_id: string | null }>('SELECT workspace_id, round, instrument, currency, target::text, pipeline_id FROM services.raise_programs WHERE id = $1', [programId])).rows[0]
}

// The founder's pipelines, for the team to choose from.
export async function founderPipelines(programId: string): Promise<{ pipelines: { id: string; name: string; status: string; deals: number }[]; current: string | null; workspace: boolean }> {
  const p = await programOf(programId)
  if (!p?.workspace_id) return { pipelines: [], current: null, workspace: false }
  const rows = await inWorkspace(p.workspace_id, async () => (await db().query<{ id: string; name: string; status: string; deals: number }>('SELECT p.id, p.name, p.status, (SELECT count(*)::int FROM crm.deals d WHERE d.pipeline_id = p.id) AS deals FROM crm.pipelines p ORDER BY (p.status = \'open\') DESC, p.created_at DESC')).rows)
  return { pipelines: rows, current: p.pipeline_id, workspace: true }
}

async function stageFor(pipelineId: string, status: string): Promise<string | null> {
  const st = (await db().query<{ id: string; name: string; kind: string; sort: number }>('SELECT id, name, kind, sort FROM crm.stages WHERE pipeline_id = $1 ORDER BY sort', [pipelineId])).rows
  return (st.find((s) => (NAME[status] ?? []).includes(s.name.toLowerCase())) ?? st.find((s) => s.kind === (KIND[status] ?? 'open')) ?? st[0])?.id ?? null
}

// Put (or keep) a raise investor in the founder's pipeline. target: an existing pipeline id, or 'new' with a name.
export async function syncInvestorToPipeline(programId: string, raiseInvestorId: string, target?: { id?: string; new_name?: string } | null): Promise<void> {
  const p = await programOf(programId)
  if (!p?.workspace_id) return
  const inv = (await db().query<{ name: string; firm: string | null; status: string; committed: string | null; ticket: string | null; deal_id: string | null }>('SELECT name, firm, status, committed::text, ticket::text, deal_id FROM services.raise_investors WHERE id = $1', [raiseInvestorId])).rows[0]
  if (!inv) return
  if (!inv.deal_id && !target) return
  const dealId = await inWorkspace(p.workspace_id, async () => {
    let pipelineId: string | null = null
    if (inv.deal_id) pipelineId = (await db().query<{ pipeline_id: string }>('SELECT pipeline_id FROM crm.deals WHERE id = $1', [inv.deal_id])).rows[0]?.pipeline_id ?? null
    if (!pipelineId && target?.id && target.id !== 'new') pipelineId = (await db().query<{ id: string }>('SELECT id FROM crm.pipelines WHERE id = $1', [target.id])).rows[0]?.id ?? null
    if (!pipelineId && target) {
      const cur = ['USD', 'NGN'].includes(p.currency) ? p.currency : 'USD'
      pipelineId = (await one<{ id: string }>('INSERT INTO crm.pipelines (name, currency, target, instrument) VALUES ($1,$2,$3,$4) RETURNING id', [(target.new_name?.trim() || p.round || 'Fundraise').slice(0, 120), cur, p.target, INSTR[p.instrument ?? ''] ?? 'safe'])).id
      for (const [i, s] of STD.entries()) await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [pipelineId, s[0], s[1], s[2], i])
    }
    if (!pipelineId) return null
    const stage = await stageFor(pipelineId, inv.status)
    if (!stage) return null
    const label = (inv.firm || inv.name).slice(0, 200), amount = inv.committed ?? inv.ticket
    if (inv.deal_id && (await db().query('UPDATE crm.deals SET investor = $2, stage_id = $3, amount = $4, updated_at = now() WHERE id = $1 AND added_by_team', [inv.deal_id, label, stage, amount])).rowCount) return { deal: inv.deal_id, pipelineId }
    const d = await one<{ id: string }>("INSERT INTO crm.deals (pipeline_id, stage_id, investor, amount, notes, added_by_team) VALUES ($1,$2,$3,$4,'Introduced by the Finvry fundraising team. Contact details are kept by the team.', true) RETURNING id", [pipelineId, stage, label, amount])
    return { deal: d.id, pipelineId }
  })
  if (!dealId) return
  await db().query('UPDATE services.raise_investors SET deal_id = $2 WHERE id = $1', [raiseInvestorId, dealId.deal])
  await db().query('UPDATE services.raise_programs SET pipeline_id = $2 WHERE id = $1', [programId, dealId.pipelineId])
}

// The team removed the investor: take the deal it added out of the founder's pipeline too.
export async function removeInvestorFromPipeline(programId: string, dealId: string | null): Promise<void> {
  if (!dealId) return
  const p = await programOf(programId)
  if (p?.workspace_id) await inWorkspace(p.workspace_id, () => db().query('DELETE FROM crm.deals WHERE id = $1 AND added_by_team', [dealId]))
}
