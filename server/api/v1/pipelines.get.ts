// GET /api/v1/pipelines — fundraising pipelines with their investors, stages and amounts.
export default defineEventHandler(async (event) => {
  await requireApiKey(event, 'read')
  const p = await db().query("SELECT p.id, p.name, p.currency, p.target::float, p.status, coalesce((SELECT json_agg(json_build_object('investor', d.investor, 'stage', s.name, 'stage_kind', s.kind, 'amount', d.amount::float, 'contact_email', c.email, 'updated_at', d.updated_at) ORDER BY d.updated_at DESC) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id LEFT JOIN crm.contacts c ON c.id = d.contact_id WHERE d.pipeline_id = p.id), '[]') AS investors FROM crm.pipelines p ORDER BY p.created_at DESC")
  return { data: p.rows }
})
