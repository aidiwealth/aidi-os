// The filing form this job needs, and what the client has already sent.
import { INTAKE_FORMS, intakeKindFor } from '~/shared/intake'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ codes: string[]; service: string }>('SELECT codes, service FROM services.jobs WHERE id = $1 AND client_id = $2', [id, u.clientId])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  const kind = intakeKindFor(j.codes ?? [], j.service)
  if (!kind) return { kind: null }
  const sub = (await db().query<{ answers: Record<string, unknown>; files: { field: string; name: string }[]; ssn_last4: string | null; updated_at: string }>('SELECT answers, files, ssn_last4, updated_at FROM services.intakes WHERE job_id = $1 ORDER BY updated_at DESC LIMIT 1', [id])).rows[0] ?? null
  return { kind, form: INTAKE_FORMS[kind], submitted: sub }
})
