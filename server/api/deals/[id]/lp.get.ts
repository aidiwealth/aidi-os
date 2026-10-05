// Whether this deal is shown to LPs, and which LPs are interested.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const p = (await db().query<{ lp_share: string; status: string; screened: boolean }>('SELECT lp_share, status, EXISTS (SELECT 1 FROM deals.screenings s WHERE s.pitch_id = p.id) AS screened FROM deals.pitches p WHERE id = $1', [id])).rows[0]
  if (!p) throw apiError('not_found', 'Not found', 404)
  const interest = (await db().query("SELECT l.name, l.email, i.note, to_char(i.created_at, 'YYYY-MM-DD') AS at FROM deals.lp_interest i JOIN funds.lps l ON l.id = i.lp_id WHERE i.pitch_id = $1 ORDER BY i.created_at DESC", [id])).rows
  const visible = p.lp_share === 'show' || (p.lp_share === 'auto' && ['screened', 'advancing'].includes(p.status) && p.screened)
  return { share: p.lp_share, visible, interest }
})
