// Live bank transactions kept up to date incrementally: each connection keeps a cursor, and /transactions/sync returns
// what was added, changed or removed since. Run when the bank sends a notice (webhook), when "Refresh bank feed" is
// pressed, and every six hours as a fallback. Pending transactions wait until they post. Cards come in (purchases are
// spend; paying the card bill is a transfer); loans do not.
import { createHash, createPublicKey, verify } from 'node:crypto'
import { isCard, isDebt, CARD_PAY } from '~/shared/bank'
interface STxn { transaction_id: string; account_id: string; amount: number; date: string; pending: boolean; name: string; merchant_name?: string | null; iso_currency_code: string | null; unofficial_currency_code: string | null; personal_finance_category?: { primary?: string } | null }
interface SyncPage { added: STxn[]; modified: STxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }
export interface PItem { id: string; access_token_enc: string; institution: string | null; entity_id: string | null; tx_cursor: string | null }
const ITEM_COLS = 'id, access_token_enc, institution, entity_id, tx_cursor'

export async function syncPlaidItem(it: PItem): Promise<{ added: number; modified: number; removed: number }> {
  const accts = new Map((await db().query<{ account_id: string; name: string; mask: string | null; type: string | null; subtype: string | null }>('SELECT account_id, name, mask, type, subtype FROM banking.plaid_accounts WHERE item_id = $1', [it.id])).rows.map((a) => [a.account_id, a]))
  const cardKeys = await cardIssuerKeys(), token = decryptText(it.access_token_enc)
  const pages = async (start: string | null) => {
    const out: SyncPage = { added: [], modified: [], removed: [], next_cursor: start ?? '', has_more: true }
    let cursor = start ?? undefined
    for (let n = 0; n < 60 && out.has_more; n++) {
      const j = await plaid<SyncPage>('/transactions/sync', { access_token: token, cursor, count: 500, options: { include_personal_finance_category: true } })
      out.added.push(...j.added); out.modified.push(...j.modified); out.removed.push(...j.removed); out.next_cursor = j.next_cursor; out.has_more = j.has_more; cursor = j.next_cursor
    }
    return out
  }
  // Changes during paging mean starting again from the same cursor (Plaid's rule).
  let p: SyncPage
  try { p = await pages(it.tx_cursor) } catch (e) { if (!/MUTATION_DURING_PAGINATION/.test(String((e as Error).message))) throw e; p = await pages(it.tx_cursor) }
  const toRail = (t: STxn): RailTxn | null => {
    const a = accts.get(t.account_id)
    if (t.pending || !a || (isDebt(a) && !isCard(a))) return null
    const card = isCard(a), cardPay = card ? t.amount < 0 && CARD_PAY.test(t.name) : t.amount > 0 && cardKeys.some((k) => vendorKey(t.name, t.merchant_name).key.startsWith(k)) && (CARD_PAY.test(t.name) || ['LOAN_PAYMENTS', 'TRANSFER_OUT'].includes(t.personal_finance_category?.primary ?? ''))
    // The bank reports money out as a positive amount.
    return { entity: it.entity_id, ref: t.transaction_id, date: t.date, description: t.name, vendor: t.merchant_name ?? null, amount: -t.amount, currency: t.iso_currency_code || t.unofficial_currency_code || 'USD', account: (it.institution ?? 'Bank') + ' · ' + a.name + (a.mask ? ' ··' + a.mask : ''), bank_category: t.personal_finance_category?.primary ?? null, category: cardPay ? 'transfer' : card && t.amount < 0 ? 'other_income' : undefined }
  }
  const added = await addToLedger('bank_feed', p.added.map(toRail).filter((x): x is RailTxn => !!x), it.entity_id ?? await companyEntityId())
  let modified = 0
  for (const t of p.modified) {
    const r = toRail(t); if (!r) continue
    const dir = r.amount < 0 ? 'out' : 'in', amt = Math.abs(r.amount)
    // Amounts in the company's currency and dollars keep their ratio to the new amount.
    const u = await db().query("UPDATE banking.ledger SET txn_date = $2, description = $3, direction = $4, amount_base = CASE WHEN amount = 0 THEN amount_base ELSE round(amount_base * $5 / amount, 2) END, amount_usd = CASE WHEN amount = 0 OR amount_usd IS NULL THEN amount_usd ELSE round(amount_usd * $5 / amount, 2) END, amount = $5 WHERE source = 'bank_feed' AND source_ref = $1", [r.ref, r.date, r.description.slice(0, 500), dir, amt])
    if (!u.rowCount) modified += await addToLedger('bank_feed', [r], it.entity_id ?? await companyEntityId()); else modified++
  }
  const gone = p.removed.map((x) => x.transaction_id)
  const removed = gone.length ? (await db().query("DELETE FROM banking.ledger WHERE source = 'bank_feed' AND source_ref = ANY($1::text[])", [gone])).rowCount ?? 0 : 0
  await db().query('UPDATE banking.plaid_items SET tx_cursor = $2, synced_at = now(), needs_sync = false WHERE id = $1', [it.id, p.next_cursor])
  return { added, modified, removed }
}

// Every live connection in this workspace that is due: the bank sent a notice, it was never synced, it is over six
// hours old, or a refresh was asked for.
export async function syncPlaidItems(force = false): Promise<number> {
  if (!plaidOn()) return 0
  const items = (await db().query<PItem>(`SELECT ${ITEM_COLS} FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL AND ($1 OR needs_sync OR synced_at IS NULL OR synced_at < now() - interval '6 hours') ORDER BY synced_at NULLS FIRST`, [force])).rows
  let n = 0
  for (const it of items) { try { n += (await syncPlaidItem(it)).added } catch (e) { const m = String((e as Error).message); await db().query('UPDATE banking.plaid_items SET error = $2 WHERE id = $1', [it.id, m.slice(0, 300)]); console.error('[plaid sync]', it.id, m) } }
  return n
}

// Point a connection's notices at this site (new connections get it when they are made).
export async function ensureWebhook(webhook: string) {
  if (!plaidOn()) return 0
  const items = (await db().query<{ id: string; access_token_enc: string }>('SELECT id, access_token_enc FROM banking.plaid_items WHERE wm_client_id IS NULL AND webhook_url IS DISTINCT FROM $1', [webhook])).rows
  for (const it of items) { try { await plaid('/item/webhook/update', { access_token: decryptText(it.access_token_enc), webhook }); await db().query('UPDATE banking.plaid_items SET webhook_url = $2 WHERE id = $1', [it.id, webhook]) } catch (e) { console.error('[plaid webhook]', it.id, (e as Error).message) } }
  return items.length
}

// A Plaid notice is genuine when its JWT (ES256, signed with a key Plaid serves by id) is valid, at most five minutes
// old, and covers this exact body.
const KEYS = new Map<string, JsonWebKey>()
export async function plaidWebhookVerified(raw: string, jwt: string, keyById: (kid: string) => Promise<JsonWebKey | null>, now = Date.now()): Promise<boolean> {
  const [h, p, s] = jwt.split('.'); if (!h || !p || !s) return false
  const head = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: string; kid?: string }
  if (head.alg !== 'ES256' || !head.kid) return false
  let jwk = KEYS.get(head.kid)
  if (!jwk) { const k = await keyById(head.kid); if (!k) return false; jwk = k; KEYS.set(head.kid, k) }
  const ok = verify('sha256', Buffer.from(h + '.' + p), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
  if (!ok) return false
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { iat?: number; request_body_sha256?: string }
  if (!claims.iat || Math.abs(now / 1000 - claims.iat) > 300) return false
  return claims.request_body_sha256 === createHash('sha256').update(raw).digest('hex')
}
