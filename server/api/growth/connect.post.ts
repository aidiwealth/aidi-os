// Connect a CRM (HubSpot, Pipedrive) to a sales process: the key is checked by reading the deals, kept encrypted, and
// what the deals would add or change is held for review. Later reads happen when Sales opens (every six hours at most)
// or with Sync now, and are held for review the same way. Read-only: nothing is written back to the CRM.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ process_id: z.string().uuid(), source: z.enum(['hubspot', 'pipedrive']), token: z.string().trim().min(10).max(500), name: z.string().trim().max(120).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste the key from your CRM.')
  const user = await requireKind(event, 'sales_deals')
  await rateLimit('growth_crm', user.userId, 20, 60 * 60 * 1000)
  const p = (await db().query('SELECT 1 FROM growth.processes WHERE id = $1 AND kind = $2', [b.data.process_id, 'sales'])).rowCount
  if (!p) throw apiError('not_found', 'Choose a sales process.', 404)
  const secret = encryptText(b.data.token), label = b.data.name || CRMS[b.data.source]!.label
  const t = await crmTable(b.data.source, secret)
  if (!t.rows.length) throw apiError('empty', 'No deals were found in ' + CRMS[b.data.source]!.label + '.', 422)
  const map = await mapTable('sales_deals', t, await targetsFor('sales_deals', b.data.process_id))
  const sc = await forecastScope(event); map.entity = sc.group ? null : sc.entity
  const { ai: _ai, ...keep } = map; void _ai
  const link = (await one<{ id: string }>("INSERT INTO growth.links (kind, process_id, name, url, mapping, auto, source, secret_enc, created_by, last_synced_at) VALUES ('sales_deals', $1, $2, NULL, $3, true, $4, $5, $6, now()) RETURNING id", [b.data.process_id, label, JSON.stringify(keep), b.data.source, secret, user.userId])).id
  const h = await holdImport({ kind: 'sales_deals', processId: b.data.process_id, linkId: link, name: label, ref: b.data.source, t, map, userId: user.userId })
  await audit({ event, actorUserId: user.userId, action: 'growth.crm_connect', objectType: 'growth_link', objectId: link, detail: { source: b.data.source, deals: t.rows.length } })
  return { ok: true, link, pending: h.id, summary: h.summary }
})
