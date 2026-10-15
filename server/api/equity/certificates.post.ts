// Electronic share certificates for issuances on a cap table (all that have none yet, or the ones chosen).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ ct: z.string().uuid().optional(), ids: z.array(z.string().uuid()).max(500).optional(), redo: z.boolean().default(false), officer: z.object({ name: z.string().trim().min(1).max(200), title: z.string().trim().max(120).default('Chief Executive Officer') }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the shares.')
  const ct = await capTableId(b.data.ct)
  const me = (await db().query<{ name: string | null }>('SELECT p.full_name AS name FROM core.users u LEFT JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]
  const ids = (await db().query<{ id: string }>('SELECT id FROM equity.issuances WHERE captable_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[])) AND ($3 OR certificate_doc_id IS NULL) ORDER BY issued_on, created_at', [ct, b.data.ids ?? null, b.data.redo])).rows
  const made: string[] = []
  for (const r of ids) made.push(await issueCertificate(r.id, b.data.officer ?? { name: me?.name ?? '', title: 'Authorized officer' }))
  await audit({ event, actorUserId: user.userId, action: 'equity.certificates', objectType: 'equity_captable', objectId: ct, detail: { count: made.length } })
  return { ok: true, count: made.length, documents: made }
})
