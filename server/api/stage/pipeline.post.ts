// Add a matched capital provider to the company's fundraising: the open pipeline for that kind of money (equity,
// debt or grants), made with the usual stages if there is none yet.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  if (!(await usableModules(user.roles, event)).has('fundraising')) throw apiError('forbidden', 'Fundraising is not on your plan.', 403)
  const b = z.object({ provider_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a provider.')
  const p = (await asPlatform(() => db().query<{ name: string; instrument: string }>('SELECT name, instrument FROM platform.capital_providers WHERE id = $1 AND active AND verified_on IS NOT NULL', [b.data.provider_id]))).rows[0]
  if (!p) throw apiError('not_found', 'That provider is not available.', 404)
  const kinds = p.instrument === 'debt' ? ['debt'] : p.instrument === 'grant' ? ['grant'] : ['safe', 'priced', 'convertible_note', 'mixed']
  const org = await currentOrg(), cur = ((org?.settings.currency as string) === 'NGN' ? 'NGN' : 'USD')
  let pl = (await db().query<{ id: string; name: string }>("SELECT id, name FROM crm.pipelines WHERE status = 'open' AND instrument = ANY($1::text[]) ORDER BY created_at DESC LIMIT 1", [kinds])).rows[0]
  if (!pl) {
    const name = p.instrument === 'debt' ? 'Debt' : p.instrument === 'grant' ? 'Grants' : 'Equity raise', inst = p.instrument === 'debt' ? 'debt' : p.instrument === 'grant' ? 'grant' : 'safe'
    const id = (await one<{ id: string }>('INSERT INTO crm.pipelines (name, currency, instrument) VALUES ($1,$2,$3) RETURNING id', [name, cur, inst])).id
    const STD: [string, string, string][] = inst === 'grant' ? [['Researching', 'grey', 'open'], ['Preparing', 'blue', 'open'], ['Applied', 'purple', 'open'], ['Shortlisted', 'teal', 'committed'], ['Awarded', 'green', 'won'], ['Declined', 'red', 'lost']]
      : inst === 'debt' ? [['Contacted', 'grey', 'open'], ['Credit review', 'blue', 'open'], ['Term sheet', 'purple', 'open'], ['Approved', 'amber', 'committed'], ['Disbursed', 'green', 'won'], ['Declined', 'red', 'lost']]
      : [['Contacted', 'grey', 'open'], ['Meeting', 'blue', 'open'], ['Diligence', 'purple', 'open'], ['Term sheet', 'teal', 'committed'], ['Committed', 'amber', 'committed'], ['Closed', 'green', 'won'], ['Passed', 'red', 'lost']]
    for (const [i, s] of STD.entries()) await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [id, s[0], s[1], s[2], i])
    pl = { id, name }
  }
  if ((await db().query('SELECT 1 FROM crm.deals WHERE pipeline_id = $1 AND lower(investor) = lower($2)', [pl.id, p.name])).rowCount) return { ok: true, message: p.name + ' is already in ' + pl.name + '.' }
  const st = (await db().query<{ id: string }>('SELECT id FROM crm.stages WHERE pipeline_id = $1 ORDER BY sort LIMIT 1', [pl.id])).rows[0]
  if (!st) throw apiError('invalid', 'That pipeline has no stages yet.')
  await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor) VALUES ($1,$2,$3)', [pl.id, st.id, p.name])
  await audit({ event, actorUserId: user.userId, action: 'stage.provider_to_pipeline', objectType: 'crm_pipeline', objectId: pl.id, detail: { provider: p.name } })
  return { ok: true, message: p.name + ' added to ' + pl.name + '.' }
})
