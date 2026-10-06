// This workspace's storage: used, limit, add-ons and the price of more.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const org = (await currentOrg())!
  const s = await storageOf(org.id)
  const ngn = (org.settings as Record<string, unknown>).currency === 'NGN'
  return { ...s, pack: { gb: STORAGE_PACK.gb, price: ngn ? STORAGE_PACK.ngn : STORAGE_PACK.usd, currency: ngn ? 'NGN' : 'USD' }, can_buy: org.kind === 'company' }
})
