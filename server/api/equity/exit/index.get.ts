// The exit plan for a cap table: assumptions, potential buyers (and whether a search is running), the revenue basis
// from Financials and what we know about the company (for the buyer search).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const ct = await capTableId(getQuery(event).ct)
  const p = (await db().query<{ assumptions: Partial<ExitAssumptions>; buyers: Buyer[]; searched_at: string | null; search_status: string; search_error: string | null; search_note: string | null; stale: boolean }>(
    "SELECT assumptions, buyers, searched_at, search_status, search_error, search_note, (search_started_at < now() - interval '6 minutes') AS stale FROM equity.exit_plans WHERE captable_id = $1", [ct])).rows[0]
  const page = (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0]
  const org = await currentOrg()
  const status = p?.search_status === 'running' && p.stale ? 'failed' : p?.search_status ?? 'idle'
  return { ct, assumptions: { ...EXIT_DEFAULT, ...(p?.assumptions ?? {}), multiples: { ...EXIT_DEFAULT.multiples, ...(p?.assumptions?.multiples ?? {}) } }, buyers: p?.buyers ?? [], searched_at: p?.searched_at ?? null,
    search: { status, error: status === 'failed' ? (p?.search_error || 'The search stopped before it finished. Try again.') : null, note: p?.search_note ?? null },
    basis: await revenueBasis(), company: { name: org?.name ?? '', about: [page?.headline, page?.about].filter(Boolean).join(' — ').replace(/<[^>]+>/g, ' ').slice(0, 600), website: page?.website ?? '' } }
})
