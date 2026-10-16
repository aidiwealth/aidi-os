// Progress of a workbook read started at POST /api/sheet-links/ai-read (only the person who started it).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const r = (await db().query<{ status: string; stage: string; progress: Record<string, unknown>; result: unknown; error: unknown; stale: boolean }>("SELECT status, stage, progress, result, error, (updated_at < now() - interval '6 minutes') AS stale FROM financials.sheet_reads WHERE id = $1 AND created_by = $2", [id, user.userId])).rows[0]
  if (!r) throw apiError('not_found', 'Not found', 404)
  // A read that stopped moving (for example the server restarted mid-read) is reported as failed rather than left spinning.
  if (r.status === 'running' && r.stale) return { status: 'failed', error: { stage: r.stage, message: 'The read stopped before it finished.', advice: ['Try again.', 'If it keeps stopping, link a copy with only the financial tabs.'] } }
  return { status: r.status, stage: r.stage, progress: r.progress, result: r.status === 'done' ? r.result : undefined, error: r.status === 'failed' ? r.error : undefined }
})
