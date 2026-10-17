// Each portfolio company's position in one go (cost, recorded value, value on the latest round), for the list.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ids = (await db().query<{ id: string }>('SELECT id FROM portfolio.companies WHERE active ORDER BY name')).rows.map((r) => r.id)
  const out: Record<string, { cost: number; recorded: number | null; implied: number | null; latest: string | null; currency: string }> = {}
  for (const id of ids) { try { const p = await positionOf(id); if (p.holdings.length) out[id] = { cost: p.cost, recorded: p.recorded, implied: p.implied, latest: p.latest?.label ?? (p.finvry ? 'Their cap table' : null), currency: p.currency } } catch (e) { console.error('[positions]', (e as Error).message) } }
  return out
})
