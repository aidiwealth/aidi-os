// A shared financial board (read-only). No sign-in; the link is private to whoever has it.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw apiError('not_found', 'This link is not valid.', 404)
  const b = (await asPlatform(() => db().query<{ id: string; organization_id: string; name: string; note: string | null; kpis: string[]; charts: BoardChart[]; period: string; count: number; share_enabled: boolean; expired: boolean }>(
    'SELECT id, organization_id, name, note, kpis, charts, period, count, share_enabled, (share_expires IS NOT NULL AND share_expires < now()) AS expired FROM financials.boards WHERE share_token = $1', [token]))).rows[0]
  if (!b || !b.share_enabled) throw apiError('not_found', 'This link is not valid.', 404)
  if (b.expired) throw apiError('expired', 'This link has expired. Ask the company for a new one.', 410)
  setOrgContext(b.organization_id)
  await asPlatform(() => db().query('UPDATE financials.boards SET views = views + 1, last_viewed_at = now() WHERE id = $1', [b.id]))
  return { name: b.name, note: b.note, data: await boardData(b.kpis, b.charts, b.period, b.count), workspace: await publicWorkspace(), branding: await brandingOf(b.organization_id).catch(() => null) }
})
