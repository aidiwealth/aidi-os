// Add or edit a lead.
import { z } from 'zod'
import { LEAD_SOURCES } from '~/server/utils/sales'
const Body = z.object({
  id: z.string().uuid().optional(),
  company: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().max(200).optional(),
  contact_email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  contact_phone: z.string().trim().max(40).optional(),
  kind: z.enum(ORG_KINDS).default('company'),
  country: z.string().trim().max(100).optional(),
  source: z.enum(LEAD_SOURCES).default('inbound'),
  plan_code: z.string().optional().or(z.literal('').transform(() => undefined)),
  seats: z.coerce.number().int().min(0).max(100000).optional().or(z.literal('').transform(() => undefined)),
  value_monthly_usd: z.coerce.number().min(0).max(1e8).optional().or(z.literal('').transform(() => undefined)),
  billing: z.enum(['monthly', 'annual']).default('monthly'),
  owner_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  expected_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(5000).optional()
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add at least the company name; check the email and numbers.')
  const d = b.data
  const vals = [d.company, d.contact_name || null, d.contact_email?.toLowerCase() ?? null, d.contact_phone || null, d.kind, d.country || null, d.source, d.plan_code ?? null,
    d.seats ?? null, d.value_monthly_usd ?? null, d.billing, d.owner_id ?? staff.userId, d.expected_close ?? null, d.notes || null]
  const id = await asPlatform(async () => {
    if (d.id) {
      const u = await db().query<{ id: string }>(`UPDATE platform.leads SET company=$2, contact_name=$3, contact_email=$4, contact_phone=$5, kind=$6, country=$7, source=$8, plan_code=$9,
          seats=$10, value_monthly_usd=$11, billing=$12, owner_id=$13, expected_close=$14, notes=$15, updated_at=now() WHERE id=$1 RETURNING id`, [d.id, ...vals])
      if (!u.rows[0]) throw apiError('not_found', 'Lead not found', 404)
      return u.rows[0].id
    }
    const i = await db().query<{ id: string }>(`INSERT INTO platform.leads (company, contact_name, contact_email, contact_phone, kind, country, source, plan_code, seats, value_monthly_usd, billing, owner_id, expected_close, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`, [...vals, staff.userId])
    return i.rows[0]!.id
  })
  return { ok: true, id }
})
