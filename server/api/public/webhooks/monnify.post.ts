// Monnify: a transfer reached a company's reserved account. Verified by HMAC-SHA512 of the raw body; credited once.
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const s = await walletSettings()
  if (!s.monnify_secret_key || !monnifySignatureOk(s.monnify_secret_key, raw, getRequestHeader(event, 'monnify-signature') ?? '')) throw apiError('forbidden', 'Bad signature', 401)
  const body = JSON.parse(raw) as { eventType?: string; eventData?: { paymentStatus?: string; amountPaid?: number | string; transactionReference?: string; paymentReference?: string; product?: { reference?: string }; destinationAccountInformation?: { accountReference?: string } } }
  const d = body.eventData ?? {}
  if (body.eventType !== 'SUCCESSFUL_TRANSACTION' && d.paymentStatus !== 'PAID') return { ok: true }
  const ref = d.product?.reference ?? d.destinationAccountInformation?.accountReference
  const va = ref ? (await asPlatform(() => db().query<{ organization_id: string }>('SELECT organization_id FROM wallet.virtual_accounts WHERE account_reference = $1', [ref]))).rows[0] : undefined
  const naira = Number(d.amountPaid ?? 0), tx = d.transactionReference ?? d.paymentReference
  if (!va || !naira || !tx) return { ok: true }
  try { await postLedger(va.organization_id, 'credit', Math.round(naira * 100), 'topup', 'Bank transfer', { reference: 'monnify:' + tx }) }
  catch (err) { if (!String((err as Error).message).includes('duplicate')) throw err }
  return { ok: true }
})
