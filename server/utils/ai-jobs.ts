// Background AI work the page follows: start a job, report progress, then the result (or why it failed and what to
// do). Big reads can take minutes, longer than a web request may stay open.
import type { H3Event } from 'h3'
export type JobSet = (stage: string, progress?: Record<string, unknown>) => Promise<void>
export async function startAiJob(event: H3Event, kind: string, userId: string, work: (set: JobSet) => Promise<unknown>, explain: (err: unknown) => { message: string; advice: string[] }): Promise<string> {
  await db().query("DELETE FROM core.ai_jobs WHERE created_at < now() - interval '2 days'")
  const id = (await one<{ id: string }>('INSERT INTO core.ai_jobs (kind, created_by) VALUES ($1, $2) RETURNING id', [kind, userId])).id
  const set: JobSet = async (stage, progress = {}) => { await db().query('UPDATE core.ai_jobs SET stage = $2, progress = progress || $3::jsonb, updated_at = now() WHERE id = $1', [id, stage, JSON.stringify(progress)]).catch(() => {}) }
  const run = (async () => {
    try { const result = await work(set); await db().query("UPDATE core.ai_jobs SET status = 'done', stage = 'done', result = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify(result)]) }
    catch (err) { console.error('[ai-job]', kind, (err as Error).message); await db().query("UPDATE core.ai_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify(explain(err))]).catch(() => {}) }
  })()
  event.waitUntil?.(run)
  return id
}
// A plain-words reason for an AI failure, with what to do instead.
export function aiJobError(err: unknown, fallback: string[]): { message: string; advice: string[] } {
  const e = err as { data?: { error?: { code?: string; message?: string } }; statusCode?: number }
  const msg = e.data?.error?.message
  if (e.statusCode && msg) return { message: msg, advice: e.data?.error?.code === 'ai_limit' ? ['Wait for the allowance to reset or add AI credits in Settings → AI usage.'] : fallback }
  return { message: 'The AI could not finish reading this just now.', advice: ['Try again in a minute.', ...fallback] }
}
