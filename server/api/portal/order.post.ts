// A founder orders services: a job on the services desk, and an invoice for anything with a listed price (paid online
// or by transfer). Quoted services are priced by the team and invoiced after.
import { z } from 'zod'
const SERVICE: Record<string, string> = { irs_annual: 'tax_filing', de_franchise: 'annual_compliance', ca_state: 'annual_compliance', registered_agent: 'registered_agent', llc_formation: 'company_formation', inc_formation: 'company_formation', ein: 'company_formation', operating_agreement: 'legal_review' }
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_order', u.userId ?? u.clientId, 10, 60 * 60 * 1000)
  const b = z.object({ codes: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).min(1).max(15), company_id: z.string().uuid().optional(), notes: z.string().trim().max(2000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose at least one service.')
  const items = (await db().query<{ code: string; name: string; price: string | null; currency: string; billing: string }>('SELECT code, name, price::text, currency, billing FROM services.catalog WHERE active AND code = ANY($1)', [b.data.codes])).rows
  if (!items.length) throw apiError('invalid', 'Those services are not available.')
  if (b.data.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [b.data.company_id, u.clientId])).rowCount) throw apiError('invalid', 'Choose one of your companies.')
  const priced = items.filter((i) => i.price !== null && i.billing !== 'quoted')
  const quoted = items.filter((i) => !priced.includes(i))
  const c = (await db().query<{ name: string; email: string }>('SELECT name, email FROM services.clients WHERE id = $1', [u.clientId])).rows[0]!
  const title = ('Order: ' + items.map((i) => i.name).join(', ')).slice(0, 200)
  const desc = ['Ordered in Finvry by ' + u.name + ' (' + u.email + ')', ...items.map((i) => '- ' + i.name + (i.price && i.billing !== 'quoted' ? '' : ' (to be quoted)')), b.data.notes ? '\nNotes: ' + b.data.notes : ''].join('\n').slice(0, 5000)
  const job = await one<{ id: string }>("INSERT INTO services.jobs (client_id, company_id, service, title, description, status, codes) VALUES ($1,$2,$3,$4,$5,'new',$6) RETURNING id", [u.clientId, b.data.company_id ?? null, SERVICE[items[0]!.code] ?? 'other', title, desc, items.map((i) => i.code)])
  let invoice: string | null = null, invoiceId: string | null = null
  if (priced.length) {
    const settings = await csBilling()
    const currency = priced[0]!.currency, region = currency === 'NGN' ? 'ng' : 'us'
    const lines = priced.filter((i) => i.currency === currency).map((i) => { const qty = i.billing === 'monthly' ? 12 : 1, unit = Number(i.price); return { code: i.code, description: i.name + (i.billing === 'monthly' ? ' (first 12 months)' : i.billing === 'annual' ? ' (first year)' : ''), quantity: qty, unit_amount: unit, amount: Math.round(qty * unit * 100) / 100 } })
    const amount = Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100
    const inv = await one<{ id: string }>(
      `INSERT INTO services.invoices (number, client_id, company_id, job_id, region, currency, due_date, lines, amount, bill_to, issuer, status, sent_at)
       VALUES ($1 || '-' || to_char(current_date, 'YYYY') || '-' || lpad(((SELECT count(*) FROM services.invoices WHERE issue_date >= date_trunc('year', current_date)) + 1)::text, 4, '0'),
               $2,$3,$4,$5,$6, current_date + 7, $7, $8, $9, $10, 'sent', now()) RETURNING id`,
      [settings.prefix, u.clientId, b.data.company_id ?? null, job.id, region, currency, JSON.stringify(lines), amount, JSON.stringify({ name: c.name, email: c.email }), JSON.stringify({ ...(region === 'ng' ? settings.ng : settings.us), note_top: settings.note_top, note_bottom: settings.note_bottom })])
    invoice = await billUrl(inv.id); invoiceId = inv.id
  }
  await filingsOrdered(u.clientId, items.map((i) => i.code)).catch((e) => console.error('[order] compliance', e))
  sendJobClientActivity(null, job.id, c.name, title, u.name + ' placed an order in Finvry', desc).catch((e) => console.error('[order] alert failed', e))
  return { ok: true, job_id: job.id, pay_url: invoice, invoice_id: invoiceId, quoted: quoted.map((i) => i.name) }
})
