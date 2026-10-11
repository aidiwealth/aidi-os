// Add or edit one of the client's companies (kept apart from the workspace's own group entities).
import { z } from 'zod'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined))
const Body = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), entity_type: z.enum(['llc', 'c_corp', 's_corp', 'ltd', 'plc', 'other']).default('llc'),
  jurisdiction: z.string().trim().max(100).optional(), country: z.string().trim().max(100).default('United States'), registration_number: z.string().trim().max(60).optional(),
  ein: z.string().trim().regex(/^[0-9]{2}-?[0-9]{7}$/).optional().or(z.literal('').transform(() => undefined)), formation_date: date, fiscal_year_end: z.string().trim().max(10).optional(),
  address: z.string().trim().max(500).optional(), registered_agent: z.enum(['ours', 'theirs', 'none']).default('ours'), agent_renewal: date,
  virtual_office: z.boolean().default(false), mailbox: z.boolean().default(false), status: z.enum(['forming', 'active', 'dissolved']).default('active'), notes: z.string().trim().max(3000).optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!cid.success || !b.success) throw apiError('invalid', 'Check the company details. An EIN looks like 12-3456789.')
  if (!(await db().query('SELECT 1 FROM services.clients WHERE id = $1', [cid.data])).rowCount) throw apiError('not_found', 'Client not found', 404)
  const d = b.data
  const vals = [d.name, d.entity_type, d.jurisdiction || null, d.country, d.registration_number || null, d.ein ?? null, d.formation_date ?? null, d.fiscal_year_end || null, d.address || null, d.registered_agent, d.agent_renewal ?? null, d.virtual_office || d.mailbox, false, d.status, d.notes || null]
  const r = d.id
    ? await db().query<{ id: string }>(`UPDATE services.companies SET name=$3, entity_type=$4, jurisdiction=$5, country=$6, registration_number=$7, ein=$8, formation_date=$9, fiscal_year_end=$10, address=$11, registered_agent=$12, agent_renewal=$13, virtual_office=$14, mailbox=$15, status=$16, notes=$17 WHERE id=$1 AND client_id=$2 RETURNING id`, [d.id, cid.data, ...vals])
    : await db().query<{ id: string }>(`INSERT INTO services.companies (client_id, name, entity_type, jurisdiction, country, registration_number, ein, formation_date, fiscal_year_end, address, registered_agent, agent_renewal, virtual_office, mailbox, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, [cid.data, ...vals])
  if (!r.rows[0]) throw apiError('not_found', 'Company not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.company_save', objectType: 'client', objectId: cid.data, detail: { company: d.name } })
  return { ok: true, id: r.rows[0].id }
})
