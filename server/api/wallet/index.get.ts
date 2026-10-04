// The company's wallet: balance, recent ledger (newest first) and any pending top-ups. ?ref= checks a Paystack return.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const org = (await currentOrg())!
  const ref = String(getQuery(event).ref ?? '')
  if (/^wt_[A-Za-z0-9]{8,40}$/.test(ref)) {
    const t = (await db().query<{ provider: string; status: string }>('SELECT provider, status FROM wallet.topups WHERE reference = $1', [ref])).rows[0]
    if (t && t.status === 'pending' && t.provider === 'paystack') { try { if ((await paystackStatus(ref)) === 'success') await walletTopupSucceeded(ref) } catch (err) { console.error('[wallet] verify failed', err) } }
  }
  const w = await walletOf(org.id)
  const ledger = await db().query("SELECT id, kind, amount_minor::float AS amount_minor, balance_after_minor::float AS balance_after_minor, category, reason, to_char(created_at, 'YYYY-MM-DD') AS date, created_at FROM wallet.ledger ORDER BY created_at DESC LIMIT 300")
  const pending = await one<{ n: number }>("SELECT count(*)::int AS n FROM wallet.topups WHERE status = 'pending' AND created_at > now() - interval '1 day'")
  return { company: org.name, plan: org.plan_code, currency: w.currency, balance_minor: w.balance_minor, min_minor: MIN_TOPUP[w.currency] ?? 1000, ledger: ledger.rows, pending: pending.n, canTopup: providersFor(w.currency).length > 0, provider: w.currency === 'NGN' ? 'Paystack' : 'Stripe', user: user.email }
})
