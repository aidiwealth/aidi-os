// The form a job needs (for the team to fill in when the client has not sent it yet).
import { INTAKE_FORMS, intakeKindFor } from '~/shared/intake'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ codes: string[] | null; service: string }>('SELECT codes, service FROM services.jobs WHERE id = $1', [id])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  const kind = intakeKindFor(j.codes ?? [], j.service)
  return { kind, form: kind ? INTAKE_FORMS[kind] : undefined }
})
