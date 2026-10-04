// Pay a service invoice from the company's wallet (same currency only).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const inv = (await db().query<{ id: string; number: string; currency: string; amount: string; status: string; workspace_id: string | null }>(
    'SELECT i.id, i.number, i.currency, i.amount::text, i.status, c.workspace_id FROM services.invoices i JOIN services.clients c ON c.id = i.client_id WHERE i.id = $1 AND i.client_id = $2', [id.data, u.clientId])).rows[0]
  if (!inv) throw apiError('not_found', 'Not found', 404)
  if (inv.status !== 'sent') throw apiError('state', 'This invoice is not open for payment.')
  if (!inv.workspace_id) throw apiError('state', 'No wallet for this account.')
  const w = await walletOf(inv.workspace_id)
  if (w.currency !== inv.currency) throw apiError('currency', 'Your wallet is in ' + w.currency + ' and this invoice is in ' + inv.currency + '. Pay it by card or transfer instead.')
  await postLedger(inv.workspace_id, 'debit', Math.round(Number(inv.amount) * 100), 'service', 'Invoice ' + inv.number, { reference: 'invoice:' + inv.id, userId: u.userId ?? null })
  await db().query("UPDATE services.invoices SET status = 'paid', paid_at = current_date, paid_via = 'wallet' WHERE id = $1 AND status = 'sent'", [inv.id])
  await db().query("UPDATE services.clients SET status = 'active' WHERE status = 'lead' AND id = $1", [u.clientId])
  await subscriptionsFromInvoice(inv.id).catch((e) => console.error('[wallet] renewals failed', e))
  await audit({ event, actorUserId: u.userId ?? null, action: 'services.invoice_paid_wallet', objectType: 'invoice', objectId: inv.id })
  const full = await loadCsInvoice(inv.id); if (full) sendClientReceiptEmail(full).catch((e) => console.error('[wallet] receipt failed', e))
  return { ok: true }
})
