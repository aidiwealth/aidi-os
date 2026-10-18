// Whether a company's cash flow statement is worked out from its P&L and balance sheet (null: not asked yet).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const subject = String(getQuery(event).subject ?? '')
  if (!/^(entity|company):[0-9a-f-]{36}$/.test(subject)) return { on: null }
  return { on: await cashFlowPolicy(subject) }
})
