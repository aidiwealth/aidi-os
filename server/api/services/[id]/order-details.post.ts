// The team corrects an order: the new company (name, type, state, country, EIN, status) and the virtual office
// (country, state, street address). Updates the company record, the order description and the virtual office renewal.
import { z } from 'zod'
const Body = z.object({
  company: z.object({ name: z.string().trim().min(1).max(200), entity_type: z.enum(['llc', 'c_corp', 's_corp', 'ltd', 'plc', 'other']), jurisdiction: z.string().trim().max(100).default(''), country: z.string().trim().min(2).max(100),
    ein: z.string().trim().regex(/^[0-9]{2}-?[0-9]{7}$/).optional().or(z.literal('').transform(() => undefined)), status: z.enum(['forming', 'active', 'dissolved']).optional() }).optional(),
  vo: z.object({ country: z.string().trim().min(2).max(100), state: z.string().trim().max(100).default(''), address: z.string().trim().max(500).default('') }).optional()
})
const TYPE_LABEL: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp', s_corp: 'S-Corp', ltd: 'Ltd', plc: 'PLC', other: 'Other' }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the details. An EIN looks like 12-3456789.')
  const j = (await db().query<{ client_id: string; company_id: string | null; description: string | null }>('SELECT client_id, company_id, description FROM services.jobs WHERE id = $1', [id.data])).rows[0]
  if (!j) throw apiError('not_found', 'Job not found', 404)
  let lines = (j.description ?? '').split('\n')
  const d = b.data
  if (d.company) {
    if (!j.company_id) throw apiError('state', 'This job has no company yet. Choose one under Job settings first.')
    const c = d.company
    await db().query('UPDATE services.companies SET name = $2, entity_type = $3, jurisdiction = nullif($4, \'\'), country = $5, ein = coalesce($6, ein), status = coalesce($7, status) WHERE id = $1', [j.company_id, c.name, c.entity_type, c.jurisdiction, c.country, c.ein ?? null, c.status ?? null])
    const i = lines.findIndex((l) => l.startsWith('New company: '))
    if (i >= 0) { const tail = lines[i]!.match(/\)((?:; .*)?)$/)?.[1] ?? ''; lines[i] = 'New company: ' + c.name + ' (' + TYPE_LABEL[c.entity_type] + ', ' + [c.jurisdiction, c.country].filter(Boolean).join(', ') + ')' + tail }
  }
  if (d.vo) {
    const v = d.vo, ng = /^nigeria$/i.test(v.country)
    const loc = ng ? 'Lagos, Nigeria' : [v.state, v.country].filter(Boolean).join(', ')
    const line = 'Virtual office location: ' + loc + (v.address ? ' — ' + v.address.replace(/\n/g, ', ') : '')
    const i = lines.findIndex((l) => l.startsWith('Virtual office location: '))
    if (i >= 0) lines[i] = line
    else { const k = lines.findIndex((l) => l.startsWith('- ')); lines.splice(k >= 0 ? k : lines.length, 0, line) }
    if (j.company_id && v.address) await db().query('UPDATE services.companies SET address = $2, virtual_office = true WHERE id = $1', [j.company_id, v.address])
    const ws = (await db().query<{ workspace_id: string | null }>('SELECT workspace_id FROM services.clients WHERE id = $1', [j.client_id])).rows[0]?.workspace_id
    if (ws) await asPlatform(() => db().query("UPDATE wallet.subscriptions SET details = details || $2::jsonb, updated_at = now() WHERE organization_id = $1 AND code = 'virtual_office' AND status <> 'cancelled'", [ws, JSON.stringify({ country: v.country, state: ng ? 'Lagos' : v.state, address: v.address })]))
  }
  lines = lines.map((l) => l)
  await db().query('UPDATE services.jobs SET description = $2, updated_at = now() WHERE id = $1', [id.data, lines.join('\n').slice(0, 5000)])
  await audit({ event, actorUserId: user.userId, action: 'services.order_details_edit', objectType: 'job', objectId: id.data, detail: d })
  return { ok: true }
})
