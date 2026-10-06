export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const s = ((await currentOrg())?.settings ?? {}) as Record<string, unknown>
  return { config: await loanSettings(), creditchek: { env: !!useRuntimeConfig().creditchekSecretKey, stored: !!s.creditchek_key_enc }, us_bureau: usBureauOn() }
})
