// The company's chart of accounts: its own categories, the standard line each rolls into, and the standard lines.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const accounts = await listAccounts()
  const used = (await db().query<{ k: string; n: number }>("SELECT k, count(*)::int AS n FROM financials.statements, jsonb_object_keys(detail) AS k GROUP BY k").catch(() => ({ rows: [] }))).rows
  const n = new Map(used.map((u) => [u.k, u.n]))
  return { accounts: accounts.map((a) => ({ ...a, periods: n.get(a.parent + '|' + a.name) ?? 0 })), lines: LINES }
})
