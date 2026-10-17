// LPs who have signed: onto the LP register (made from their prospect details, or the one they already have) and,
// for a fund raise, a commitment to the fund for their amount. For a co-investment, they are marked as interested in
// the deal. Debt facilities record the lender only.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const pid = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), committed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the LPs.')
  const p = (await db().query<{ kind: string; fund_id: string | null; pitch_id: string | null }>('SELECT p.kind, p.fund_id, d.pitch_id FROM funds.lp_pipelines p LEFT JOIN deals.deals d ON d.id = p.deal_id WHERE p.id = $1', [/^[0-9a-f-]{36}$/.test(pid) ? pid : null])).rows[0]
  if (!p) throw apiError('not_found', 'Pipeline not found.', 404)
  const rows = (await db().query<{ id: string; amount: number | null; stage_kind: string; commitment_id: string | null; prospect_id: string; lp_id: string | null; name: string; kind: string; contact_name: string | null; email: string | null; country: string | null; notes: string | null }>(
    `SELECT t.id, t.amount::float AS amount, s.kind AS stage_kind, t.commitment_id, x.id AS prospect_id, coalesce(t.lp_id, x.lp_id) AS lp_id, x.name, x.kind, x.contact_name, x.email, x.country, x.mandate AS notes
     FROM funds.lp_targets t JOIN funds.lp_stages s ON s.id = t.stage_id JOIN funds.lp_prospects x ON x.id = t.prospect_id WHERE t.pipeline_id = $1 AND t.id = ANY($2::uuid[])`, [pid, b.data.ids])).rows
  const done: string[] = [], skipped: { name: string; reason: string }[] = []
  const regKind = (k: string) => (k === 'hnwi' || k === 'angel' ? 'individual' : ['family_office', 'corporate', 'other'].includes(k) ? 'entity' : 'institution')
  for (const r of rows) {
    if (r.stage_kind !== 'won' && r.stage_kind !== 'committed') { skipped.push({ name: r.name, reason: 'not committed yet' }); continue }
    if (p.kind === 'fund' && !r.amount) { skipped.push({ name: r.name, reason: 'no amount' }); continue }
    let lp = r.lp_id
    if (!lp) lp = (await db().query<{ id: string }>('SELECT id FROM funds.lps WHERE lower(name) = lower($1) LIMIT 1', [r.name])).rows[0]?.id ?? null
    if (!lp) lp = (await one<{ id: string }>("INSERT INTO funds.lps (name, kind, contact_name, email, country, kyc_status, notes, created_by) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING id",
      [r.name, regKind(r.kind), r.contact_name, r.email, r.country, r.notes?.slice(0, 3000) ?? null, user.userId])).id
    await db().query('UPDATE funds.lp_prospects SET lp_id = $2 WHERE id = $1', [r.prospect_id, lp])
    let commitment: string | null = r.commitment_id
    if (p.kind === 'fund' && p.fund_id && !commitment) commitment = (await one<{ id: string }>('INSERT INTO funds.commitments (fund_id, lp_id, amount, committed_on) VALUES ($1,$2,$3,coalesce($4::date, CURRENT_DATE)) ON CONFLICT (fund_id, lp_id) DO UPDATE SET amount = funds.commitments.amount RETURNING id', [p.fund_id, lp, r.amount, b.data.committed_on ?? null])).id
    if (p.kind === 'co_invest' && p.pitch_id) await db().query("INSERT INTO deals.lp_interest (organization_id, pitch_id, lp_id, note) VALUES (core.current_org(), $1, $2, $3) ON CONFLICT (pitch_id, lp_id) DO NOTHING", [p.pitch_id, lp, r.amount ? 'Co-investment: ' + Math.round(r.amount).toLocaleString('en-US') : 'Co-investment'])
    await db().query('UPDATE funds.lp_targets SET lp_id = $2, commitment_id = $3, updated_at = now() WHERE id = $1', [r.id, lp, commitment])
    done.push(r.name)
  }
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_registered', objectType: 'lp_pipeline', objectId: pid, detail: { lps: done.length } })
  return { ok: true, added: done.length, skipped }
})
