// Open pixel in the update email: records an open (once per 30 minutes per reader).
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length >= 30) {
    try {
      const s = (await asPlatform(() => db().query<{ id: string; organization_id: string; update_id: string; email: string; title: string; fresh: boolean }>(
        "SELECT s.id, s.organization_id, s.update_id, i.email, u.title, (s.opened_at IS NULL OR s.opened_at < now() - interval '30 minutes') AS fresh FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id JOIN financials.updates u ON u.id = s.update_id WHERE s.token_hash = $1", [sha256(token)]))).rows[0]
      if (s?.fresh) { await asPlatform(() => db().query('UPDATE financials.update_sends SET opens = opens + 1, opened_at = now() WHERE id = $1', [s.id])); await logActivity(s.organization_id, s.email, 'update_opened', 'Opened ' + s.title, s.update_id) }
    } catch (err) { console.error('[updates] pixel', err) }
  }
  setHeader(event, 'content-type', 'image/gif'); setHeader(event, 'cache-control', 'no-store')
  return GIF
})
