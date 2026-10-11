// Add or edit a person at the client (contact, owner, director or officer).
import { z } from 'zod'
// Lenient on blanks and formats people type (null fields, "50%", "50 %"); clear message for the field that is wrong.
const str = (n: number) => z.string().trim().max(n).nullish().transform((v) => v || undefined)
const Body = z.object({
  id: z.string().uuid().nullish().or(z.literal('')).transform((v) => v || undefined), name: z.string().trim().min(1, 'Add the name.').max(200),
  email: z.string().trim().max(254).nullish().transform((v) => v || undefined).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Check the email address.'),
  phone: str(40), role: z.enum(['contact', 'owner', 'director', 'officer', 'other']).default('contact'),
  ownership_pct: z.union([z.number(), z.string(), z.null()]).optional().transform((v, ctx) => {
    if (v === null || v === undefined || String(v).trim() === '') return null
    const n = Number(String(v).replace(/[%\s,]/g, ''))
    if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ownership must be a number between 0 and 100.' }); return z.NEVER }
    return n }),
  company_id: z.string().uuid().nullish().or(z.literal('')).transform((v) => v || undefined),
  address: str(500), nationality: str(100), portal_access: z.boolean().nullish().transform((v) => !!v)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!cid.success) throw apiError('invalid', 'Client not found.')
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message && !/^(Expected|Invalid|Required)/.test(b.error.issues[0].message) ? b.error.issues[0].message : 'Check ' + (b.error.issues[0]?.path.join('.') || 'the details') + '.')
  const d = b.data
  if (d.portal_access && !d.email) throw apiError('invalid', 'Finvry access needs an email address (sign-in is by emailed code).')
  if (d.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [d.company_id, cid.data])).rowCount) throw apiError('invalid', 'Choose one of this client\'s companies.')
  const vals = [d.name, d.email?.toLowerCase() ?? null, d.phone || null, d.role, d.ownership_pct ?? null, d.company_id ?? null, d.address || null, d.nationality || null, d.portal_access]
  const r = d.id
    ? await db().query<{ id: string }>('UPDATE services.people SET name=$3, email=$4, phone=$5, role=$6, ownership_pct=$7, company_id=$8, address=$9, nationality=$10, portal_access=$11 WHERE id=$1 AND client_id=$2 RETURNING id', [d.id, cid.data, ...vals])
    : await db().query<{ id: string }>('INSERT INTO services.people (client_id, name, email, phone, role, ownership_pct, company_id, address, nationality, portal_access) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [cid.data, ...vals])
  if (!r.rows[0]) throw apiError('not_found', 'Person not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.person_save', objectType: 'client', objectId: cid.data, detail: { person: d.name } })
  return { ok: true, id: r.rows[0].id }
})
