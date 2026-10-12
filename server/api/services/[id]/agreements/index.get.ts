// The job's agreements: sent for signature, signed or withdrawn.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  return (await asPlatform(() => db().query("SELECT id, title, status, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, signed_at, signer_name, signer_email, signature_kind, created_at FROM legal.signatures WHERE job_id = $1 ORDER BY created_at DESC", [id.data]))).rows
})
