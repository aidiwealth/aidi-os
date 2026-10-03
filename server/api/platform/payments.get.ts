// Which providers are switched on, and the webhook addresses to register with them.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const base = useRuntimeConfig().public.appBaseUrl
  return { stripe: stripeOn(), stripeWebhook: !!useRuntimeConfig().stripeWebhookSecret, paystack: paystackOn(),
    stripeWebhookUrl: base + '/api/public/webhooks/stripe', paystackWebhookUrl: base + '/api/public/webhooks/paystack' }
})
