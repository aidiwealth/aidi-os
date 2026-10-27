// Size trades for this account now (the scheduled run does this every evening for company and plan accounts).
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const a = await marketAccount(String(getRouterParam(event, 'id')))
  const n = await proposeFor(a, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'markets.proposals_requested', objectType: 'markets.account', objectId: a.id, detail: { created: n } })
  return { created: n }
})
