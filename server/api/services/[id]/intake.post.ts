// The team fills in the filing form on a client's job (same form the client sees in Finvry).
import { intakeKindFor } from '~/shared/intake'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ codes: string[]; service: string; client_id: string }>('SELECT codes, service, client_id FROM services.jobs WHERE id = $1', [id])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  const kind = intakeKindFor(j.codes ?? [], j.service)
  if (!kind) throw apiError('invalid', 'This job does not need a form.')
  await saveIntake(event, id, j.client_id, kind, user.email)
  return { ok: true }
})
