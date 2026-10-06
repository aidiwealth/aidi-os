// Founder: start a raise (creates the desk job) or edit the brief of one of their raises.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const s = await readSession(event)
  const org = s?.orgId ? (await asPlatform(() => db().query<{ settings: Record<string, unknown> }>('SELECT settings FROM core.organizations WHERE id = $1', [s.orgId]))).rows[0] : undefined
  if (org?.settings.raise_enabled !== true) throw apiError('not_enabled', 'Managed fundraising is not switched on for your company.', 403)
  const u = await requirePortal(event)
  const money = z.union([z.coerce.number().min(0).max(1e12), z.literal('').transform(() => null), z.null()]).optional()
  const b = z.object({ id: z.string().uuid().optional(), target: z.coerce.number().positive().max(1e12), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), round: z.string().trim().max(60), instrument: z.string().trim().max(60), valuation: money,
    raised_so_far: money, use_of_funds: z.string().trim().max(3000), traction: z.string().trim().max(3000).default(''), deck_url: z.string().trim().max(500).default(''), target_investors: z.string().trim().max(3000).default(''),
    timeline: z.string().trim().max(200).default(''), agree_fee: z.literal(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues.some((i) => i.path[0] === 'agree_fee') ? 'Please accept the success fee to continue.' : 'Add the amount you are raising, the round, the instrument and how you will use the money.')
  const d = b.data, fee = Number(org.settings.raise_fee_pct ?? 4)
  const intake = { ...d }; delete (intake as { id?: string }).id
  const desc = 'Fundraising brief from ' + u.name + ' (' + u.email + '). Success fee ' + fee + '% of money closed.\nRound: ' + d.round + ' · ' + d.instrument + (d.valuation ? ' · valuation/cap ' + d.valuation.toLocaleString('en-US') : '') + (d.raised_so_far ? ' · raised so far ' + d.raised_so_far.toLocaleString('en-US') : '') + '\nUse of funds: ' + d.use_of_funds + (d.timeline ? '\nTimeline: ' + d.timeline : '') + (d.deck_url ? '\nDeck: ' + d.deck_url : '') + (d.target_investors ? '\nInvestors they suggest: ' + d.target_investors : '')
  const title = 'Managed fundraising: ' + d.round + ' ' + d.currency + ' ' + d.target.toLocaleString('en-US')
  if (d.id) {
    const p = (await db().query<{ id: string; job_id: string | null; status: string }>('SELECT id, job_id, status FROM services.raise_programs WHERE id = $1 AND client_id = $2', [d.id, u.clientId])).rows[0]
    if (!p) throw apiError('not_found', 'Not found', 404)
    if (p.status === 'closed') throw apiError('closed', 'This raise is closed. Start a new one instead.', 409)
    await db().query('UPDATE services.raise_programs SET target = $2, currency = $3, round = $4, instrument = $5, valuation = $6, intake = $7, updated_at = now() WHERE id = $1', [p.id, d.target, d.currency, d.round, d.instrument, d.valuation ?? null, JSON.stringify(intake)])
    if (p.job_id) { await db().query('UPDATE services.jobs SET title = $2, description = $3, updated_at = now() WHERE id = $1', [p.job_id, title, desc]); await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', 'Updated the fundraising brief.', true)", [p.job_id]) }
    return { ok: true, id: p.id }
  }
  const job = (await one<{ id: string }>("INSERT INTO services.jobs (client_id, service, codes, title, description, status) VALUES ($1, 'other', ARRAY['fundraising'], $2, $3, 'new') RETURNING id", [u.clientId, title, desc])).id
  const p = await one<{ id: string }>("INSERT INTO services.raise_programs (client_id, workspace_id, fee_pct, target, currency, round, instrument, valuation, intake, intake_at, job_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,'active') RETURNING id",
    [u.clientId, s!.orgId, fee, d.target, d.currency, d.round, d.instrument, d.valuation ?? null, JSON.stringify(intake), job])
  return { ok: true, id: p.id }
})
