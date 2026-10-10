// Invoice issuers and bank details for US (USD) and Nigerian (NGN) invoices.
import { z } from 'zod'
const s = (n: number) => z.string().trim().max(n).default('')
const Region = z.object({ issuer: s(200), address: s(500), phone: s(40), email: s(254), bank: z.record(z.string(), z.string().trim().max(120)).default({}) })
const Body = z.object({ prefix: z.string().trim().regex(/^[A-Z0-9]{2,10}$/), terms_days: z.coerce.number().int().min(0).max(120), note_top: s(500), note_bottom: s(500), us: Region, ng: Region })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fields. The invoice prefix is 2 to 10 capital letters or numbers.')
  const r = await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('cs_billing', $1::jsonb) WHERE id = core.current_org()", [JSON.stringify(b.data)])
  if (!r.rowCount) throw apiError('not_saved', 'Could not save the settings. Sign in again and retry.', 409)
  await audit({ event, actorUserId: user.userId, action: 'services.billing_settings', objectType: 'organization', objectId: user.orgId ?? undefined })
  return { ok: true }
})
