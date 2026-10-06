// Desk: the client's filing form for a job (SSN masked).
import { INTAKE_FORMS } from '~/shared/intake'
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const job = String(getRouterParam(event, 'job') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(job)) throw apiError('not_found', 'Not found', 404)
  const r = (await db().query<{ id: string; kind: 'incorporation' | 'filing'; answers: Record<string, unknown>; files: unknown[]; ssn_last4: string | null; submitted_by: string | null; updated_at: string }>('SELECT id, kind, answers, files, ssn_last4, submitted_by, updated_at FROM services.intakes WHERE job_id = $1 ORDER BY updated_at DESC LIMIT 1', [job])).rows[0]
  return r ? { ...r, form: INTAKE_FORMS[r.kind] } : null
})
