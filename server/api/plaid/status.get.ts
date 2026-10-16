// Bank feed check for admins: is it configured, which environment, and does a link token come back (and how fast).
// Open /api/plaid/status while signed in to see why connecting a bank fails. No keys are shown.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const c = useRuntimeConfig()
  const out: Record<string, unknown> = { configured: plaidOn(), env: (c.plaidEnv as string) === 'production' ? 'production' : 'sandbox', client_id_set: !!c.plaidClientId, secret_set: !!c.plaidSecret }
  if (!plaidOn()) return { ...out, ok: false, note: 'Set NUXT_PLAID_CLIENT_ID and NUXT_PLAID_SECRET (and NUXT_PLAID_ENV) in DigitalOcean.' }
  const t0 = Date.now()
  try { await plaid('/link/token/create', { client_name: 'Finvry', user: { client_user_id: user.userId }, products: ['transactions'], country_codes: ['US'], language: 'en' }); return { ...out, ok: true, ms: Date.now() - t0 } }
  catch (e) { return { ...out, ok: false, ms: Date.now() - t0, error: (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? String((e as Error).message) } }
})
