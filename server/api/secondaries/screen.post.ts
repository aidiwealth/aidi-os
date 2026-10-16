// Screen a secondary opportunity with AI. With an id, the deal (with any edits in the form) is screened and the result
// kept on it; without, the draft in the form is screened and the result returned for saving with it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  rateLimit('sec_screen', user.userId, 60, 60 * 60 * 1000)
  const t = (n: number) => z.string().trim().max(n).optional().nullable()
  const b = z.object({ id: z.string().uuid().optional(), title: t(500), company: t(200), website: t(300), sector: t(120), stage: t(60), lead: t(300), co_investors: t(300),
    min_investment: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : typeof v === 'string' ? Number(v.replace(/[,\s$]/g, '')) : v), z.number().nonnegative().nullable()).optional(),
    valuation: t(120), closes_at: t(10), notes: t(5000), source: z.enum(['meridian', 'wefunder', 'other']).default('other') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the deal details.')
  const d = b.data
  let row: SecDealIn
  if (d.id) {
    const r = (await db().query<SecDealIn & { company_info: SecDealIn['info'] }>("SELECT title, company, website, sector, stage, lead, co_investors, min_investment::float, valuation, source, to_char(closes_at, 'YYYY-MM-DD') AS closes_at, notes, company_info FROM wm.secondaries WHERE id = $1", [d.id])).rows[0]
    if (!r) throw apiError('not_found', 'Not found', 404)
    // What is in the form now wins over what was saved (the team may be editing).
    const given = Object.fromEntries(Object.entries(d).filter(([k, v]) => k !== 'id' && k !== 'source' && v !== undefined && v !== null && v !== '')) as Partial<SecDealIn>
    row = { ...r, ...given, source: r.source, info: r.company_info }
  } else row = { title: d.title ?? '', company: d.company ?? null, website: d.website ?? null, sector: d.sector ?? null, stage: d.stage ?? null, lead: d.lead ?? null, co_investors: d.co_investors ?? null, min_investment: d.min_investment ?? null, valuation: d.valuation ?? null, source: d.source, closes_at: d.closes_at || null, notes: d.notes ?? null, info: null }
  if (!row.company && !row.website) throw apiError('invalid', 'Add the company name and website first.')
  if (!d.id && row.website) row.info = (await companyInfo({ name: row.company ?? undefined, website: row.website }).catch(() => null)) as SecDealIn['info']
  let s
  try { s = await screenSecondary(row, 'secondary:' + (d.id ?? 'draft')) }
  catch (err) { if ((err as { statusCode?: number }).statusCode) throw err; console.error('[secondaries] screen', (err as Error).message); throw apiError('ai_failed', 'Could not screen it just now. Try again in a minute.', 502) }
  const at = new Date().toISOString()
  if (d.id) await db().query('UPDATE wm.secondaries SET ai_screen = $2, ai_screened_at = now() WHERE id = $1', [d.id, JSON.stringify(s)])
  return { screen: s, screened_at: at }
})
