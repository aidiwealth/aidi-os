// Progress of a background AI job (only the person who started it).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const r = (await db().query<{ kind: string; status: string; stage: string; progress: Record<string, unknown>; result: unknown; error: unknown; stale: boolean }>("SELECT kind, status, stage, progress, result, error, (updated_at < now() - interval '8 minutes') AS stale FROM core.ai_jobs WHERE id = $1 AND created_by = $2", [id, user.userId])).rows[0]
  if (!r) throw apiError('not_found', 'Not found', 404)
  if (r.status === 'running' && r.stale) return { status: 'failed', error: { message: 'The read stopped before it finished.', advice: ['Try again.'] } }
  return { kind: r.kind, status: r.status, stage: r.stage, progress: r.progress, result: r.status === 'done' ? r.result : undefined, error: r.status === 'failed' ? r.error : undefined }
})
