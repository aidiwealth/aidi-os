// For "Add to Fundraising": each holder on a cap table with what they put in, whether they are already a contact,
// and the pipelines and contact lists they can go into.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ct = await capTableId(getQuery(event).ct)
  const holders = (await db().query(`SELECT h.id, h.name, h.email, h.kind,
      (coalesce((SELECT sum(i.shares * coalesce(i.price, 0)) FROM equity.issuances i WHERE i.holder_id = h.id), 0) + coalesce((SELECT sum(c.amount) FROM equity.convertibles c WHERE c.holder_id = h.id), 0))::float AS invested,
      (SELECT c.id FROM crm.contacts c WHERE h.email IS NOT NULL AND lower(c.email) = lower(h.email) LIMIT 1) AS contact_id,
      (SELECT string_agg(DISTINCT p.name, ', ') FROM crm.deals d JOIN crm.pipelines p ON p.id = d.pipeline_id WHERE lower(d.investor) = lower(h.name)) AS in_pipelines
    FROM equity.holders h WHERE h.captable_id = $1 ORDER BY (h.kind = 'investor') DESC, h.name`, [ct])).rows
  const pipelines = (await db().query("SELECT id, name, currency FROM crm.pipelines ORDER BY status = 'open' DESC, created_at DESC")).rows
  const lists = (await db().query('SELECT id, name FROM crm.lists ORDER BY name')).rows
  return { captable_id: ct, holders, pipelines, lists }
})
