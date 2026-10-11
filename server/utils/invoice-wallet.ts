// Pay a services invoice from the client's Finvry wallet — by the client in Finvry, or charged by the services team.
// The invoice is claimed first (so it can only be paid once), then the wallet is debited; if the debit fails the claim is undone.
export async function payInvoiceFromWallet(invoiceId: string, o: { clientId?: string; userId?: string | null; team?: boolean }): Promise<{ balance_minor: number; currency: string }> {
  const inv = (await db().query<{ id: string; number: string; currency: string; amount: string; status: string; client_id: string; workspace_id: string | null }>(
    'SELECT i.id, i.number, i.currency, i.amount::text, i.status, i.client_id, c.workspace_id FROM services.invoices i JOIN services.clients c ON c.id = i.client_id WHERE i.id = $1', [invoiceId])).rows[0]
  if (!inv || (o.clientId && inv.client_id !== o.clientId)) throw apiError('not_found', 'Not found', 404)
  const open = o.team ? ['sent', 'draft'] : ['sent']
  if (!open.includes(inv.status)) throw apiError('state', inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice is not open for payment.')
  if (!inv.workspace_id) throw apiError('state', o.team ? 'This client has no Finvry account, so there is no wallet to charge.' : 'No wallet for this account.')
  const minor = Math.round(Number(inv.amount) * 100)
  if (minor <= 0) throw apiError('state', 'Nothing to pay on this invoice.')
  const w = await walletOf(inv.workspace_id)
  if (w.currency !== inv.currency) throw apiError('currency', (o.team ? 'The client wallet is in ' : 'Your wallet is in ') + w.currency + ' and this invoice is in ' + inv.currency + '.' + (o.team ? '' : ' Pay it by card or transfer instead.'))
  if (w.balance_minor < minor) {
    const bal = new Intl.NumberFormat('en-US', { style: 'currency', currency: w.currency }).format(w.balance_minor / 100)
    throw apiError('insufficient', (o.team ? 'The client wallet has ' : 'Your wallet has ') + bal + ', not enough for this invoice.' + (o.team ? '' : ' Top up first.'), 402)
  }
  const claim = await db().query("UPDATE services.invoices SET status = 'paid', paid_at = current_date, paid_via = 'wallet', sent_at = coalesce(sent_at, now()) WHERE id = $1 AND status = $2", [inv.id, inv.status])
  if (claim.rowCount !== 1) throw apiError('state', 'This invoice changed. Refresh and try again.')
  let after: { balance: number } | null
  try { after = await postLedger(inv.workspace_id, 'debit', minor, 'service', 'Invoice ' + inv.number, { reference: 'invoice:' + inv.id, userId: o.userId ?? null }) }
  catch (e) { await db().query("UPDATE services.invoices SET status = $2, paid_at = NULL, paid_via = NULL WHERE id = $1", [inv.id, inv.status]); throw e }
  await db().query("UPDATE services.clients SET status = 'active' WHERE status = 'lead' AND id = $1", [inv.client_id])
  await subscriptionsFromInvoice(inv.id).catch((e) => console.error('[wallet] renewals failed', e))
  const full = await loadCsInvoice(inv.id); if (full) sendClientReceiptEmail(full).catch((e) => console.error('[wallet] receipt failed', e))
  return { balance_minor: after?.balance ?? 0, currency: w.currency }
}
