// Paystack events: a payment succeeded (and its card authorization, if reusable, is saved for renewals).
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!paystackSignatureOk(raw, getRequestHeader(event, 'x-paystack-signature') ?? '')) throw apiError('forbidden', 'Bad signature', 400)
  const ev = JSON.parse(raw) as { event: string; data: { reference?: string; gateway_response?: string } & Parameters<typeof paystackCard>[0] }
  if (!ev.data.reference) return { ok: true }
  if (ev.data.reference.startsWith('wt_')) { if (ev.event === 'charge.success') await walletTopupSucceeded(ev.data.reference); return { ok: true } }
  if (ev.data.reference.startsWith('cs_')) { if (ev.event === 'charge.success') await csPaymentSucceeded(ev.data.reference); return { ok: true } }
  if (ev.event === 'charge.success') await recordSuccess(ev.data.reference, paystackCard(ev.data))
  else if (ev.event === 'charge.failed') await recordFailure(ev.data.reference, ev.data.gateway_response ?? 'Payment failed')
  return { ok: true }
})
