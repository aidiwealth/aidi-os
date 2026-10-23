// Work that should not hold up a page: syncing a bank feed, re-reading linked sheets and CRMs, tidying categories.
// Started when a page opens (if due), run after the response, once per workspace and job at a time; the scheduled
// job (/api/public/cron/banking) does the same work every few hours so pages rarely need to.
const running = new Map<string, Promise<unknown>>()
export function inBackground(job: string, fn: () => Promise<unknown>) {
  const key = (currentOrgId() ?? '') + ':' + job
  if (running.has(key)) return
  const p = fn().catch((e) => console.error('[background] ' + job, (e as Error).message)).finally(() => running.delete(key))
  running.set(key, p)
}
