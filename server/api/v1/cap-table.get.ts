// GET /api/v1/cap-table — a cap table (the main one, or ?name=): fully diluted shares, holders, option pool, SAFEs and notes,
// signatures still pending and certificates not yet issued. Optional round (pre_money, new_money, pool_target_pct) or exit.
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'read')
  const q = getQuery(event), n = (v: unknown) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))
  const args: Record<string, unknown> = { name: q.name ? String(q.name).slice(0, 80) : undefined, pre_money: n(q.pre_money), new_money: n(q.new_money), pool_target_pct: n(q.pool_target_pct), exit: n(q.exit) }
  return { data: await finvryData(event, k.kind, 'cap_table', args) }
})
