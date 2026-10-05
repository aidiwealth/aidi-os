// Start connecting a bank: a short-lived Plaid Link token for this person.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const org = (await currentOrg())!
  const r = await plaid<{ link_token: string }>('/link/token/create', { client_name: org.kind === 'company' ? 'Finvry' : 'Aidi', user: { client_user_id: user.userId }, products: ['transactions'], country_codes: ['US'], language: 'en' })
  return { link_token: r.link_token }
})
