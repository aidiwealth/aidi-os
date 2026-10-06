// Client: the fundraising brief. Creates the job for the desk and starts the program.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const s = await readSession(event)
  const org = s?.orgId ? (await asPlatform(() => db().query<{ settings: Record<string, unknown> }>('SELECT settings FROM core.organizations WHERE id = $1', [s.orgId]))).rows[0] : undefined
  if (org?.settings.raise_enabled !== true) throw apiError('not_enabled', 'Managed fundraising is not switched on for your company.', 403)
  const u = await requirePortal(event)
  const money = z.union([z.coerce.number().min(0).max(1e12), z.literal('').transform(() => null)]).optional()
  const b = z.object({ target: z.coerce.number().positive().max(1e12), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), round: z.string().trim().max(60), instrument: z.string().trim().max(60), valuation: money,
    raised_so_far: money, use_of_funds: z.string().trim().max(3000), traction: z.string().trim().max(3000).default(''), deck_url: z.string().trim().max(500).default(''), target_investors: z.string().trim().max(3000).default(''),
    timeline: z.string().trim().max(200).default(''), agree_fee: z.literal(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues.some((i) => i.path[0] === 'agree_fee') ? 'Please accept the success fee to continue.' : 'Add the amount you are raising, the round, the instrument and how you will use the money.')
  const d = b.data
  const p = (await db().query<{ id: string; job_id: string | null; fee_pct: string }>('SELECT id, job_id, fee_pct FROM services.raise_programs WHERE client_id = $1', [u.clientId])).rows[0]
  if (!p) throw apiError('not_found', 'Refresh the page and try again.', 404)
  let job = p.job_id
  if (!job) job = (await one<{ id: string }>("INSERT INTO services.jobs (client_id, service, codes, title, description, status) VALUES ($1, 'other', ARRAY['fundraising'], $2, $3, 'new') RETURNING id", [u.clientId, 'Managed fundraising: ' + d.round + ' ' + d.currency + ' ' + d.target.toLocaleString('en-US'),
    'Fundraising brief from ' + u.name + ' (' + u.email + '). Success fee ' + p.fee_pct + '% of money closed.\nRound: ' + d.round + ' · ' + d.instrument + (d.valuation ? ' · valuation/cap ' + d.valuation.toLocaleString('en-US') : '') + (d.raised_so_far ? ' · raised so far ' + d.raised_so_far.toLocaleString('en-US') : '') + '\nUse of funds: ' + d.use_of_funds + (d.timeline ? '\nTimeline: ' + d.timeline : '') + (d.deck_url ? '\nDeck: ' + d.deck_url : '') + (d.target_investors ? '\nInvestors they suggest: ' + d.target_investors : '')])).id
  await db().query("UPDATE services.raise_programs SET target = $2, currency = $3, round = $4, instrument = $5, valuation = $6, intake = $7, intake_at = now(), job_id = $8, status = CASE WHEN status = 'intake' THEN 'active' ELSE status END, updated_at = now() WHERE id = $1",
    [p.id, d.target, d.currency, d.round, d.instrument, d.valuation ?? null, JSON.stringify(d), job])
  return { ok: true }
})
