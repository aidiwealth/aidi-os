// Fincra events: virtual account approved / issued / declined / closed, and money received (collection.successful),
// which is credited to the client's wallet ledger once (by reference). Signed with HMAC-SHA512 (webhook secret).
import { createHmac, timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  let body: { event?: string; data?: Record<string, any> } = {}
  try { body = JSON.parse(raw) } catch { throw apiError('invalid', 'Bad payload', 400) }
  const secret = (useRuntimeConfig() as unknown as Record<string, string>).fincraWebhookSecret, sig = getRequestHeader(event, 'signature') ?? ''
  const ok = (s: string) => { if (!secret || !sig) return false; const h = createHmac('sha512', secret).update(s).digest('hex'); return h.length === sig.length && timingSafeEqual(Buffer.from(h), Buffer.from(sig)) }
  const verified = ok(JSON.stringify({ event: body.event, data: body.data })) || ok(JSON.stringify(body)) || ok(raw)
  await asPlatform(() => db().query('INSERT INTO wm.provider_events (provider, event, reference, payload, verified) VALUES ($1,$2,$3,$4,$5)', ['fincra', body.event ?? null, body.data?.reference ?? body.data?.id ?? null, raw.slice(0, 20000), verified]))
  if (!verified) throw apiError('forbidden', 'Bad signature', 401)
  const d = body.data ?? {}
  if (String(body.event).startsWith('virtualaccount.')) {
    const st = body.event === 'virtualaccount.declined' ? 'declined' : body.event === 'virtualaccount.closed' ? 'closed' : body.event === 'virtualaccount.issued' ? 'issued' : 'approved'
    await asPlatform(() => db().query("UPDATE wm.virtual_accounts SET status = $2, account = CASE WHEN $3::jsonb = '{}'::jsonb THEN account ELSE $3::jsonb END, reason = $4, updated_at = now() WHERE fincra_id = $1", [d.id ?? d._id, st, JSON.stringify(d.accountInformation ?? {}), d.reason ?? null]))
  } else if (body.event === 'collection.successful' && d.virtualAccount) {
    const va = (await asPlatform(() => db().query<{ client_id: string; organization_id: string; currency: string }>('SELECT client_id, organization_id, currency FROM wm.virtual_accounts WHERE fincra_id = $1', [d.virtualAccount]))).rows[0]
    if (va && Number(d.amountReceived) > 0) await asPlatform(() => db().query("INSERT INTO wm.wallet_txns (organization_id, client_id, currency, kind, amount, status, reference, source, detail) VALUES ($1,$2,$3,'deposit',$4,'confirmed',$5,'fincra',$6) ON CONFLICT (reference) DO NOTHING",
      [va.organization_id, va.client_id, d.destinationCurrency ?? va.currency, Number(d.amountReceived), 'fincra:' + d.reference, JSON.stringify({ sender: d.senderAccountName ?? d.customerName ?? null, bank: d.senderBankName ?? null, fee: d.fee ?? 0 })]))
  }
  return { ok: true }
})
