// Refresh now: Airbnb calendars (iCal) and the public listing pages (title, photo, rating, reviews).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  await rateLimit('rentals_refresh', 'x', 6, 60 * 60 * 1000)
  await db().query('UPDATE rentals.units SET refreshed_at = NULL')
  const cal = await syncCalendars(), listings = await refreshListings()
  const errs = (await db().query<{ name: string; refresh_error: string }>('SELECT name, refresh_error FROM rentals.units WHERE active AND refresh_error IS NOT NULL')).rows
  return { ok: true, calendars: cal, listings, errors: errs }
})
