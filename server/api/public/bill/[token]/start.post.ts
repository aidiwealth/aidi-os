// Pay a client invoice online: Stripe for USD, Paystack for NGN.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  const id = billIdFromToken(token)
  const b = z.object({ provider: z.enum(['stripe', 'paystack']) }).safeParse(await readBody(event))
  if (!id || !b.success) throw apiError('invalid_link', 'This link is not valid.', 404)
  const org = await asPlatform(() => db().query<{ organization_id: string }>('SELECT organization_id FROM services.invoices WHERE id = $1', [id]))
  if (!org.rows[0]) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(org.rows[0].organization_id)
  const inv = await loadCsInvoice(id)
  if (!inv || inv.status !== 'sent') throw apiError('state', inv?.status === 'paid' ? 'This invoice is already paid.' : 'This invoice cannot be paid online.', 409)
  const o = await currentOrg()
  if (!csProviders(inv.currency, o?.settings.brand).includes(b.data.provider)) throw apiError('unavailable', 'Online payment is not available for this invoice.')
  const reference = 'cs_' + inv.number.replace(/[^A-Za-z0-9]/g, '') + '_' + Date.now().toString(36)
  await db().query('INSERT INTO services.invoice_payments (organization_id, invoice_id, provider, reference, amount, currency) VALUES ($1,$2,$3,$4,$5,$6)', [inv.organization_id, inv.id, b.data.provider, reference, inv.amount, inv.currency])
  try {
    return { url: await providerCheckout(b.data.provider, { amount: inv.amount, currency: inv.currency, email: inv.bill_to.email, name: 'Invoice ' + inv.number + ' · ' + inv.client, reference, returnUrl: (await appUrl()) + '/bill/' + token }) }
  } catch (err) {
    console.error('[bill] checkout failed', err)
    throw apiError('provider', 'Could not open the payment page. Please try again in a moment.', 502)
  }
})
