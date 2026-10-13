// Every two hours: Airbnb calendars (iCal) for each rentals workspace; once a day the listing pages (rating, reviews,
// title), recurring expenses, rent due and payout matching.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const orgs = (await asPlatform(() => db().query<{ organization_id: string }>('SELECT DISTINCT organization_id FROM rentals.properties WHERE active'))).rows
  const out = { workspaces: orgs.length, calendars: 0, listings: 0, expenses: 0, matched: 0 }
  for (const o of orgs) {
    setOrgContext(o.organization_id)
    try { out.calendars += await syncCalendars(); out.listings += await refreshListings(); out.expenses += await runRecurringExpenses(); await ensureRentCharges(); out.matched += await reconcile() }
    catch (e) { console.error('[cron rentals]', e) } finally { setOrgContext(null) }
  }
  return { ok: true, ...out }
})
