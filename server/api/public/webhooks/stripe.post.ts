// Stripe events: a checkout or renewal charge succeeded or failed.
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!stripeSignatureOk(raw, getRequestHeader(event, 'stripe-signature') ?? '')) throw apiError('forbidden', 'Bad signature', 400)
  const ev = JSON.parse(raw) as { type: string; data: { object: { metadata?: { reference?: string }; payment_intent?: string; payment_status?: string; last_payment_error?: { message?: string } } } }
  const o = ev.data.object, ref = o.metadata?.reference
  if (!ref) return { ok: true }
  if (ref.startsWith('cs_')) { if (ev.type === 'checkout.session.completed' || ev.type === 'payment_intent.succeeded') await csPaymentSucceeded(ref); return { ok: true } }
  if (ev.type === 'checkout.session.completed' && o.payment_status === 'paid') await recordSuccess(ref, o.payment_intent ? await stripeCard(o.payment_intent) : {})
  else if (ev.type === 'payment_intent.succeeded') await recordSuccess(ref)
  else if (ev.type === 'payment_intent.payment_failed') await recordFailure(ref, o.last_payment_error?.message ?? 'Payment failed')
  return { ok: true }
})
