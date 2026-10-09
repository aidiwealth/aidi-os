// Daily: sends founders their update link when their company's schedule is due (monthly, or quarterly in Jan/Apr/Jul/Oct).
import type { Cadence } from '~/server/utils/portfolio-requests'
// Each period is asked for once; a request already sent by hand for that period counts. Called by the scheduled GitHub Action.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  let sent = 0, emailed = 0
  for (const org of await liveOrgs()) {
    setOrgContext(org.id)
    if (!(await enabledModules()).has('portfolio')) continue
    const firm = (await publicWorkspace()).firm || org.name
    const cos = (await db().query<{ id: string; report_cadence: Cadence; report_day: number }>("SELECT id, report_cadence, report_day FROM portfolio.companies WHERE active AND report_cadence <> 'off'")).rows
    for (const c of cos) {
      const period = duePeriod(c.report_cadence, c.report_day)
      if (!period) continue
      if ((await db().query('SELECT 1 FROM portfolio.requests WHERE company_id = $1 AND period = $2', [c.id, period])).rowCount) continue
      try { const r = await createReportRequest(c.id, period, { userId: null, fromName: firm, sendEmail: true, cadence: c.report_cadence }); sent++; if (r.emailed) emailed++ }
      catch (err) { console.error('[portfolio] scheduled request failed', c.id, err) }
    }
  }
  return { ok: true, requests: sent, emails: emailed }
})
