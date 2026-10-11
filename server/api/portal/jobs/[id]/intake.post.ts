// The client submits the filing form: answers (JSON in "answers") and files (fields named after the question).
import { intakeKindFor } from '~/shared/intake'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('intake', u.clientId, 20, 60 * 60 * 1000)
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ codes: string[]; service: string; title: string }>('SELECT codes, service, title FROM services.jobs WHERE id = $1 AND client_id = $2', [id, u.clientId])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  const kind = intakeKindFor(j.codes ?? [], j.service)
  if (!kind) throw apiError('invalid', 'This request does not need a form.')
  await saveIntake(event, id, u.clientId, kind, u.email)
  return { ok: true }
})
