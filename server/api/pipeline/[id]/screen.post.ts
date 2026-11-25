// Screen a pipeline deal with AI, as pitches are. A deal added by hand gets a pitch made from what the deal says (it
// then shows on the Pitches page, already in the pipeline); later screenings refresh that pitch first. The score goes
// to Slack. No founder names or contact details are sent to the model.
import { z } from 'zod'
const ROUNDS = ['pre_seed', 'seed', 'series_a', 'series_b', 'later']
const REC: Record<string, string> = { prioritise: 'Prioritise', review: 'Review', likely_pass: 'Likely pass' }
interface Row { id: string; pitch_id: string | null; company: string; one_liner: string | null; website: string | null; deck_url: string | null; country: string | null; round: string | null; sector: string | null; raise_usd: string | null; description: string | null; traction: string | null; founders: { name?: string; role?: string }[] | null }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Deal not found', 404)
  await rateLimit('deal_screen', user.userId, 20, 60 * 60 * 1000)
  const d = (await db().query<Row>('SELECT id, pitch_id, company, one_liner, website, deck_url, country, round, sector, raise_usd::text, description, traction, founders FROM deals.deals WHERE id = $1', [id.data])).rows[0]
  if (!d) throw apiError('not_found', 'Deal not found', 404)
  if (!(d.description ?? '').trim() && !(d.one_liner ?? '').trim()) throw apiError('too_little', 'Add a one-liner or an About first, so there is something to screen.')
  const cut = (s: string | null | undefined, n: number) => { const t = (s ?? '').trim(); return t ? t.slice(0, n) : null }
  const team = cut((d.founders ?? []).map((f) => [f.name, f.role].filter(Boolean).join(' — ')).filter(Boolean).join('\n'), 3000)
  const fields = [cut(d.company, 200), cut(d.website, 500), cut(d.deck_url, 1000), cut(d.country, 100), ROUNDS.includes(d.round ?? '') ? d.round : null, cut(d.sector, 100), d.raise_usd,
    cut(d.one_liner, 300) ?? cut(d.company, 300), cut(d.description, 5000) ?? cut(d.one_liner, 5000), cut(d.traction, 3000), team]
  let pitchId = d.pitch_id
  if (!pitchId) {
    pitchId = (await one<{ id: string }>(
      `INSERT INTO deals.pitches (source, status, founder_name, email, company, website, deck_url, country, stage, sector, raising_usd, one_liner, description, traction, team)
       VALUES ('pipeline', 'advancing', $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [cut(d.founders?.[0]?.name, 200) ?? 'Not given', ...fields])).id
    await db().query('UPDATE deals.deals SET pitch_id = $2 WHERE id = $1 AND pitch_id IS NULL', [d.id, pitchId])
  } else {
    // A pitch made from this deal follows the deal's latest details; a founder's own pitch is left as they sent it.
    await db().query(`UPDATE deals.pitches SET company = $2, website = $3, deck_url = $4, country = $5, stage = $6, sector = $7, raising_usd = $8, one_liner = $9, description = $10, traction = $11, team = $12
       WHERE id = $1 AND source = 'pipeline'`, [pitchId, ...fields])
  }
  const { screeningId, output } = await screenPitch(pitchId)
  await audit({ event, actorUserId: user.userId, action: 'deal.screen_pipeline', objectType: 'deal', objectId: d.id, detail: { pitch_id: pitchId, screening_id: screeningId, score: output.score } })
  slack('aidi.deal_screened', 'Screened: ' + d.company + ' · ' + output.score + '/100 · ' + REC[output.recommendation], [
    ['Score', output.score + '/100'], ['Recommendation', REC[output.recommendation] ?? output.recommendation],
    ['Thesis fit', output.thesis_fit + '/5'], ['Team', output.team + '/5'], ['Market', output.market + '/5'], ['Traction', output.traction + '/5'],
    ['Summary', output.summary.join(' ')]], { label: 'Open the deal', path: '/pipeline/' + d.id, brand: 'aidi' })
  return { ok: true, pitch_id: pitchId }
})
