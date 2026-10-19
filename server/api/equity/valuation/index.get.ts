// Cap table → Valuation: the peers and deals, the discounts and basis, the company's figures from Financials, and
// whether a peer search is running.
import { VAL_DEFAULT, type Peer, type ValAssumptions } from '~/shared/valuation'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const ct = await capTableId(getQuery(event).ct)
  const v = (await db().query<{ assumptions: Partial<ValAssumptions>; peers: Peer[]; searched_at: string | null; search_status: string; search_error: string | null; search_note: string | null; stale: boolean }>(
    "SELECT assumptions, peers, searched_at, search_status, search_error, search_note, (search_started_at < now() - interval '6 minutes') AS stale FROM equity.valuations WHERE captable_id = $1", [ct])).rows[0]
  const page = (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0]
  const status = v?.search_status === 'running' && v.stale ? 'failed' : v?.search_status ?? 'idle'
  return { ct, assumptions: { ...VAL_DEFAULT, ...(v?.assumptions ?? {}) }, peers: v?.peers ?? [], searched_at: v?.searched_at ?? null,
    search: { status, error: status === 'failed' ? (v?.search_error || 'The search stopped before it finished. Try again.') : null, note: v?.search_note ?? null },
    company: await valuationBasis(), about: [page?.headline, page?.about].filter(Boolean).join(' — ').replace(/<[^>]+>/g, ' ').slice(0, 600), name: (await currentOrg())?.name ?? '' }
})
