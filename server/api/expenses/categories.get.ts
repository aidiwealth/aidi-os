// Payment categories: built-in and added ones, each with its statement line and how much has been paid under it.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const cats = await expenseCategories(true)
  const used = (await db().query<{ category: string; n: number; currency: string; total: number }>('SELECT category, count(*)::int AS n, currency, sum(amount)::float AS total FROM finance.expenses GROUP BY 1, 3')).rows
  return { categories: cats.map((c) => ({ ...c, payments: used.filter((u) => u.category === c.name).reduce((s, u) => s + u.n, 0), totals: Object.fromEntries(used.filter((u) => u.category === c.name).map((u) => [u.currency, u.total])) })), lines: STATEMENT_LINES }
})
