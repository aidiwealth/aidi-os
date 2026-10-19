// Find trading peers and comparable deals with AI (in the background; the Valuation tab follows it). Peers the founder
// added stay; peers found before are replaced by fresher figures for the same company. The AI's discounts are offered
// alongside, not applied.
import { z } from 'zod'
import { type Peer } from '~/shared/valuation'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  await rateLimit('valuation_peers', user.userId, 10, 60 * 60 * 1000)
  const b = z.object({ ct: z.string().uuid().optional(), focus: z.string().trim().max(300).default(''), about: z.string().trim().max(600).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the search details.')
  const ct = await capTableId(b.data.ct)
  const running = (await db().query("SELECT 1 FROM equity.valuations WHERE captable_id = $1 AND search_status = 'running' AND search_started_at > now() - interval '6 minutes'", [ct])).rowCount
  if (running) return { ok: true, running: true }
  await db().query(`INSERT INTO equity.valuations (captable_id, search_status, search_started_at) VALUES ($1, 'running', now())
    ON CONFLICT (captable_id) DO UPDATE SET search_status = 'running', search_started_at = now(), search_error = NULL`, [ct])
  const org = await currentOrg()
  const page = (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0]
  const c = await valuationBasis()
  const run = (async () => {
    try {
      const prev = (await db().query<{ peers: Peer[] }>('SELECT peers FROM equity.valuations WHERE captable_id = $1', [ct])).rows[0]?.peers ?? []
      const fmt = (v: number | null) => (v == null ? 'n/a' : 'USD ' + Math.round(v).toLocaleString('en-US'))
      const metrics = ['revenue last 12 months ' + fmt(c.revenue_ttm), c.run_rate != null ? 'run rate ' + fmt(c.run_rate) : '', c.growth_pct != null ? 'growth ' + c.growth_pct + '%' : '', c.gross_margin_pct != null ? 'gross margin ' + c.gross_margin_pct + '%' : '',
        c.ebitda_ttm != null ? 'EBITDA ' + fmt(c.ebitda_ttm) : ''].filter(Boolean).join(', ')
      const r = await findPeers({ company: org?.name ?? 'the company', about: b.data.about || [page?.headline, page?.about].filter(Boolean).join(' — ').replace(/<[^>]+>/g, ' ').slice(0, 600), website: page?.website ?? '',
        focus: b.data.focus, metrics, business: c.business_type, existing: prev.map((p) => p.name).slice(0, 30) })
      const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const merged = [...prev]
      for (const p of r.peers) { const i = merged.findIndex((x) => key(x.name) === key(p.name)); if (i >= 0) { if (merged[i]!.added !== 'founder') merged[i] = { ...p, use: merged[i]!.use } } else merged.push(p) }
      await db().query(`UPDATE equity.valuations SET peers = $2, searched_at = now(), search_status = 'idle', search_note = $3,
        assumptions = assumptions || jsonb_build_object('ai', $4::jsonb), updated_at = now() WHERE captable_id = $1`,
        [ct, JSON.stringify(merged.slice(0, 40)), r.searched ? 'Found with a web search; each figure links to its page and date.' : 'From the AI\'s own knowledge (web search was not available): figures may be out of date, so check them before relying on them.',
          JSON.stringify({ private_discount: r.private_discount, market_discount: r.market_discount, rationale: r.rationale, summary: r.summary })])
    } catch (err) {
      console.error('[valuation] peers', (err as Error).message)
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'The search could not finish. Try again in a minute.'
      await db().query("UPDATE equity.valuations SET search_status = 'failed', search_error = $2 WHERE captable_id = $1", [ct, msg.slice(0, 300)]).catch(() => {})
    }
  })()
  event.waitUntil?.(run)
  await audit({ event, actorUserId: user.userId, action: 'equity.valuation_peer_search', objectType: 'captable', objectId: ct })
  return { ok: true, running: true }
})
