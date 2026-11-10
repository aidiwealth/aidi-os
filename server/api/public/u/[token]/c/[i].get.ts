// A link clicked in an investor update email: recorded for the company's analytics, then on to the link. Only links
// that are in the update can be reached this way (by their number), so this can't send anyone elsewhere.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? ''), i = Number(getRouterParam(event, 'i'))
  if (token.length < 30 || !Number.isInteger(i) || i < 0 || i > 500) throw apiError('invalid_link', 'This link is not valid.', 404)
  const s = (await asPlatform(() => db().query<{ id: string; organization_id: string; update_id: string; url: string | null }>(
    'SELECT s.id, s.organization_id, s.update_id, u.link_urls->>$2::int AS url FROM financials.update_sends s JOIN financials.updates u ON u.id = s.update_id WHERE s.token_hash = $1', [sha256(token), i]))).rows[0]
  if (!s?.url || !/^https?:\/\//i.test(s.url)) return sendRedirect(event, '/u/' + token, 302)
  try {
    await asPlatform(async () => {
      await db().query('INSERT INTO financials.update_clicks (organization_id, update_id, send_id, url) VALUES ($1,$2,$3,$4)', [s.organization_id, s.update_id, s.id, s.url!.slice(0, 600)])
      // A click means the email was opened, even if pictures were blocked.
      await db().query('UPDATE financials.update_sends SET clicks = clicks + 1, last_clicked_at = now(), first_opened_at = coalesce(first_opened_at, now()), opened_at = coalesce(opened_at, now()), opens = greatest(opens, 1) WHERE id = $1', [s.id])
    })
  } catch (e) { console.error('[updates] click', e) }
  setHeader(event, 'cache-control', 'no-store')
  return sendRedirect(event, s.url, 302)
})
