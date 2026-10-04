// Company wallets. Every change is one atomic statement that moves the balance and writes the ledger line together;
// a debit never takes the balance below zero. Amounts are in minor units (cents, kobo).
export interface Wallet { organization_id: string; currency: string; balance_minor: number }
export async function walletOf(orgId: string): Promise<Wallet> {
  return asPlatform(async () => {
    await db().query("INSERT INTO wallet.wallets (organization_id, currency) SELECT $1, CASE WHEN settings->>'currency' = 'NGN' THEN 'NGN' ELSE 'USD' END FROM core.organizations WHERE id = $1 ON CONFLICT (organization_id) DO NOTHING", [orgId])
    return (await db().query<Wallet>('SELECT organization_id, currency, balance_minor::float AS balance_minor FROM wallet.wallets WHERE organization_id = $1', [orgId])).rows[0]!
  })
}
export async function postLedger(orgId: string, kind: 'credit' | 'debit', amountMinor: number, category: string, reason: string, opts: { reference?: string; userId?: string | null } = {}): Promise<{ id: string; balance: number } | null> {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw apiError('invalid', 'Enter an amount.')
  await walletOf(orgId)
  const r = await asPlatform(() => db().query<{ id: string; balance: string }>(
    `WITH u AS (UPDATE wallet.wallets SET balance_minor = balance_minor ${kind === 'credit' ? '+' : '-'} $2, updated_at = now() WHERE organization_id = $1 ${kind === 'debit' ? 'AND balance_minor >= $2' : ''} RETURNING balance_minor, currency)
     INSERT INTO wallet.ledger (organization_id, kind, amount_minor, balance_after_minor, currency, category, reason, reference, created_by)
     SELECT $1, $3, $2, u.balance_minor, u.currency, $4, $5, $6, $7 FROM u RETURNING id, balance_after_minor::text AS balance`,
    [orgId, amountMinor, kind, category, reason.slice(0, 300), opts.reference ?? null, opts.userId ?? null]))
  if (!r.rows[0]) { if (kind === 'debit') throw apiError('insufficient', 'Not enough in the wallet. Top up first.', 402); return null }
  return { id: r.rows[0].id, balance: Number(r.rows[0].balance) }
}
// A card top-up was paid (webhook or return check). Idempotent: the reference is unique on the ledger.
export async function walletTopupSucceeded(reference: string): Promise<void> {
  const t = (await asPlatform(() => db().query<{ organization_id: string; amount_minor: string; provider: string }>("UPDATE wallet.topups SET status = 'succeeded', completed_at = now() WHERE reference = $1 AND status <> 'succeeded' RETURNING organization_id, amount_minor::text, provider", [reference]))).rows[0]
  if (!t) return
  try { await postLedger(t.organization_id, 'credit', Number(t.amount_minor), 'topup', 'Top-up by ' + (t.provider === 'paystack' ? 'Paystack' : 'card'), { reference: 'topup:' + reference }) }
  catch (err) { console.error('[wallet] topup credit failed', reference, err) }
}
export const MIN_TOPUP: Record<string, number> = { USD: 1000, NGN: 500000 }
