// Bank connection providers the Finvry team has switched on: Mono, for Nigerian banks (Plaid covers US banks).
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return { mono: await monoOn(), plaid: plaidOn() }
})
