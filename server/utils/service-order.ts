// Placing a services order — the same steps for a founder in Finvry and for the team in the services desk:
// a job, an invoice for anything with a price (VAT, free first-year registered agent, monthly/yearly virtual office),
// renewals and compliance deadlines. The team can override prices and record how it was paid.
import { z } from 'zod'
export const SERVICE_FOR_CODE: Record<string, string> = { irs_annual: 'tax_filing', de_franchise: 'annual_compliance', ca_state: 'annual_compliance', registered_agent: 'registered_agent', llc_formation: 'company_formation', inc_formation: 'company_formation', ein: 'company_formation', operating_agreement: 'legal_review' }
// The job's service type follows the most significant item in the order (formation first), not whichever came first.
const RANK = ['company_formation', 'tax_filing', 'annual_compliance', 'registered_agent', 'legal_review']
export function mainService(codes: string[]) { const s = codes.map((c) => SERVICE_FOR_CODE[c]).filter(Boolean) as string[]; return RANK.find((r) => s.includes(r)) ?? 'other' }
export const OrderBody = z.object({ codes: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).min(1).max(15), company_id: z.string().uuid().optional(), notes: z.string().trim().max(2000).default(''),
    formation: z.object({ name: z.string().trim().min(2).max(200), alt_name: z.string().trim().max(200).default(''), country: z.string().trim().min(2).max(100), state: z.string().trim().max(100).default(''), entity_type: z.enum(['llc', 'c_corp']), name_status: z.string().max(20).default('') }).optional(),
    vo_term: z.enum(['monthly', 'annual']).default('monthly'),
    owners: z.array(z.object({ name: z.string().trim().min(2).max(200), email: z.string().trim().max(200).default('').refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Check the owner email.'), ownership_pct: z.number().min(0).max(100).nullable().default(null) })).max(10).default([]),
    virtual_office: z.object({ country: z.string().trim().min(2).max(100), state: z.string().trim().max(100).default('') }).optional(),
    company_place: z.object({ country: z.string().trim().min(2).max(100), state: z.string().trim().max(100).default('') }).optional() })
export type OrderInput = z.infer<typeof OrderBody>
export interface OrderOpts { admin?: boolean; prices?: Record<string, number>; payment?: 'online' | 'invoice' | 'draft' | 'paid' | 'none'; paid_on?: string; extra?: { description: string; quantity: number; unit_amount: number }[]; paid_note?: string; issue_date?: string }
export async function placeServiceOrder(clientId: string, actor: { name: string; email: string }, d: OrderInput, opts: OrderOpts = {}) {
  // A monthly cap on new orders from clients (set in the Finvry console), so the desk is never over-committed.
  // Orders the team logs itself are not counted against it or stopped by it.
  if (!opts.admin) await checkServicesCap()
  const ng = await clientIsNigerian(clientId)
  const items = (await db().query<{ code: string; name: string; price: string | null; price_ngn: string | null; currency: string; billing: string; region: string }>('SELECT code, name, price::text, price_ngn::text, currency, billing, region FROM services.catalog WHERE active AND code = ANY($1)', [d.codes])).rows
    .filter((i) => i.region !== 'ng' || ng).map((i) => { const voNg = i.code === 'virtual_office' && /^nigeria$/i.test(d.virtual_office?.country ?? ''); const p = voNg ? priceFor(i, true) : i.code === 'virtual_office' && d.virtual_office ? priceFor(i, false) : priceFor(i, ng); return { ...i, price: p.price == null ? null : String(p.price), currency: p.currency } })
  if (new Set(items.filter((i) => i.price != null).map((i) => i.currency)).size > 1) throw apiError('mixed_currency', 'A Lagos virtual office is billed in naira. Order it on its own, separately from US services.')
  if (!items.length) throw apiError('invalid', 'Those services are not available.')
  if (d.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [d.company_id, clientId])).rowCount) throw apiError('invalid', 'Choose one of your companies.')
  // Admin price overrides (amount charged now for that service); a quoted service with an override is priced.
  for (const i of items) if (opts.prices && opts.prices[i.code] != null) { i.price = String(opts.prices[i.code]); if (i.billing === 'quoted') i.billing = 'one_time' }
  const priced = items.filter((i) => i.price !== null && i.billing !== 'quoted')
  const forming = !!d.formation || d.codes.some((c) => c === 'llc_formation' || c === 'inc_formation')
  const quoted = items.filter((i) => !priced.includes(i))
  const c = (await db().query<{ name: string; email: string }>('SELECT name, email FROM services.clients WHERE id = $1', [clientId])).rows[0]!
  const title = ('Order: ' + items.map((i) => i.name).join(', ')).slice(0, 200)
  let companyId = d.company_id ?? null
  if (d.formation) {
    const f = d.formation
    companyId = (await one<{ id: string }>("INSERT INTO services.companies (client_id, name, entity_type, jurisdiction, country, status, notes) VALUES ($1,$2,$3,$4,$5,'forming',$6) RETURNING id",
      [clientId, f.name, f.entity_type, f.state || null, f.country, ('Proposed in Finvry.' + (f.alt_name ? ' Backup name: ' + f.alt_name + '.' : '') + (f.name_status ? ' Name check: ' + f.name_status + '.' : '')).slice(0, 3000)])).id
  } else if (companyId && d.company_place) await db().query('UPDATE services.companies SET country = coalesce(country, $2), jurisdiction = coalesce(jurisdiction, nullif($3, \'\')) WHERE id = $1', [companyId, d.company_place.country, d.company_place.state])
  // The owners entered for a new company are the customer's people on that company.
  if (d.formation && companyId) for (const o of d.owners) await db().query("INSERT INTO services.people (client_id, company_id, name, email, role, ownership_pct) VALUES ($1,$2,$3,$4,'owner',$5)", [clientId, companyId, o.name, o.email ? o.email.toLowerCase() : null, o.ownership_pct])
  const ownersText = d.formation && d.owners.length ? 'Owners: ' + d.owners.map((o) => o.name + (o.ownership_pct != null ? ' (' + o.ownership_pct + '%)' : '')).join(', ') : ''
  const voText = d.virtual_office ? 'Virtual office location: ' + (/^nigeria$/i.test(d.virtual_office.country) ? 'Lagos, Nigeria' : (d.virtual_office.state || '') + ', United States') : ''
  const place = d.formation ? 'New company: ' + d.formation.name + ' (' + (d.formation.entity_type === 'llc' ? 'LLC' : 'C-Corp') + ', ' + [d.formation.state, d.formation.country].filter(Boolean).join(', ') + ')' + (d.formation.alt_name ? '; backup name ' + d.formation.alt_name : '') + (d.formation.name_status ? '; name check: ' + d.formation.name_status : '') : ''
  const desc = [(opts.admin ? 'Logged in the services desk by ' : 'Ordered in Finvry by ') + actor.name + ' (' + actor.email + ')', ...(place ? [place] : []), ...(ownersText ? [ownersText] : []), ...(voText ? [voText] : []), ...items.map((i) => '- ' + i.name + (i.price && i.billing !== 'quoted' ? '' : ' (to be quoted)')), d.notes ? '\nNotes: ' + d.notes : ''].join('\n').slice(0, 5000)
  const job = await one<{ id: string }>("INSERT INTO services.jobs (client_id, company_id, service, title, description, status, codes) VALUES ($1,$2,$3,$4,$5,'new',$6) RETURNING id", [clientId, companyId, mainService(items.map((i) => i.code)), title, desc, items.map((i) => i.code)])
  let invoice: string | null = null, invoiceId: string | null = null
  const extra = opts.extra ?? []
  if ((priced.length || extra.length) && opts.payment !== 'none') {
    const settings = await csBilling()
    const currency = priced[0]?.currency ?? items[0]?.currency ?? 'USD', region = currency === 'NGN' ? 'ng' : 'us'
    const sym = currency === 'NGN' ? '₦' : '$'
    const raw = priced.filter((i) => i.currency === currency).map((i) => {
      const unit = Number(i.price)
      // Virtual office: billed monthly (one month now) or yearly (twelve months now); renews automatically either way.
      if (i.code === 'virtual_office') { const yr = d.vo_term === 'annual'; return { code: i.code, interval: yr ? 'year' : 'month', description: i.name + (yr ? ' (first year, billed yearly)' : ' (first month, billed monthly)'), quantity: yr ? 12 : 1, unit_amount: unit, amount: Math.round((yr ? 12 : 1) * unit * 100) / 100 } }
      // Registered agent with a new company: free for the first year, then renews automatically each year.
      if (i.code === 'registered_agent' && forming) return { code: i.code, interval: 'year', free_first_year: true, description: i.name + ' — first year free, then ' + sym + unit.toLocaleString('en-US') + ' / year', quantity: 1, unit_amount: 0, amount: 0 }
      const qty = i.billing === 'monthly' ? 12 : 1
      return { code: i.code, description: i.name + (i.billing === 'monthly' ? ' (first 12 months)' : i.billing === 'annual' ? ' (first year)' : ''), quantity: qty, unit_amount: unit, amount: Math.round(qty * unit * 100) / 100 } })
    // Admin override = the amount charged now for the line (quantity kept, unit price adjusted to match).
    if (opts.prices) for (const l of raw) { const o = opts.prices[l.code]; if (o != null) { l.amount = Math.round(o * 100) / 100; l.unit_amount = Math.round((o / (l.quantity || 1)) * 100) / 100 } }
    // Custom rows the team added (services not on the price list).
    for (const x of extra) (raw as { description: string; quantity: number; unit_amount: number; amount: number }[]).push({ description: x.description, quantity: x.quantity, unit_amount: x.unit_amount, amount: Math.round(x.quantity * x.unit_amount * 100) / 100 })
    const tx = await applyTax(raw, taxCountry({ region, currency }), 'services')
    const lines = tx.lines, amount = tx.amount
    const inv = await one<{ id: string }>(
      `INSERT INTO services.invoices (number, client_id, company_id, job_id, region, currency, due_date, lines, amount, bill_to, issuer, status, sent_at, country, subtotal, tax_label, tax_rate, tax_amount, issue_date)
       VALUES ($1 || '-' || to_char(current_date, 'YYYY') || '-' || lpad(((SELECT coalesce(max(substring(number from '-([0-9]+)$')::int), 0) FROM services.invoices WHERE number LIKE $1 || '-' || to_char(current_date, 'YYYY') || '-%') + 1)::text, 4, '0'),
               $2,$3,$4,$5,$6, coalesce($16::date, current_date) + 7, $7, $8, $9, $10, 'sent', now(), $11, $12, $13, $14, $15, coalesce($16::date, current_date)) RETURNING id`,
      [settings.prefix, clientId, companyId, job.id, region, currency, JSON.stringify(lines), amount, JSON.stringify({ name: c.name, email: c.email }), JSON.stringify({ ...(region === 'ng' ? settings.ng : settings.us), note_top: settings.note_top, note_bottom: settings.note_bottom }), tx.country, tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount, opts.issue_date ?? null])
    if (!tx.amount || opts.payment === 'paid') { // nothing to pay now, or already paid (bank transfer / old order): settled, renewals set up
      await db().query("UPDATE services.invoices SET status = 'paid', paid_at = coalesce($2::date, current_date), paid_via = 'manual', note = coalesce(note, $3) WHERE id = $1", [inv.id, opts.paid_on ?? null, opts.paid_note ?? null])
      await subscriptionsFromInvoice(inv.id).catch((e) => console.error('[order] renewals', e))
    } else {
      invoice = await billUrl(inv.id)
      if (opts.payment === 'invoice') { try { await sendCsInvoice(inv.id) } catch (e) { console.error('[order] invoice email', e) } }
      else if (opts.payment === 'draft') await db().query("UPDATE services.invoices SET status = 'draft', sent_at = NULL WHERE id = $1", [inv.id])
    }
    invoiceId = inv.id
  }
  await filingsOrdered(clientId, items.map((i) => i.code), { vo_term: d.vo_term, ra_free: forming, start: opts.issue_date }).catch((e) => console.error('[order] compliance', e))
  if (!opts.admin) sendJobClientActivity(null, job.id, c.name, title, actor.name + ' placed an order in Finvry', desc).catch((e) => console.error('[order] alert failed', e))
  if (!opts.admin) slack('finvry.job', c.name + ' ordered ' + items.map((i) => i.name).join(', ').slice(0, 150), [['By', actor.name], ...(priced.length ? [['To pay now', priced.map((i) => (i.currency === 'NGN' ? '₦' : '$') + Number(i.price).toLocaleString('en-US')).join(' + ')] as [string, string]] : []), ...(quoted.length ? [['To quote', quoted.map((i) => i.name).join(', ')] as [string, string]] : [])], { label: 'Open the job', path: '/services/' + job.id, brand: 'aidi' })
  return { job_id: job.id, pay_url: invoice, invoice_id: invoiceId, quoted: quoted.map((i) => i.name) }
}

// New client orders this calendar month against the cap (0 = no cap).
export async function checkServicesCap(): Promise<void> {
  const cap = (await accessSettings()).services_month_cap
  if (!cap) return
  const n = (await asPlatform(() => db().query<{ n: number }>("SELECT count(*)::int AS n FROM services.jobs WHERE created_at >= date_trunc('month', now()) AND title LIKE 'Order:%' AND description LIKE 'Ordered in Finvry%'"))).rows[0]!.n
  if (n >= cap) {
    slack('critical.capacity', 'Services cap reached: ' + n + ' client orders this month (cap ' + cap + '); new orders are being turned away')
    const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1, 1)
    throw apiError('services_full', 'Our services team has taken on all the work it can this month. You can order again from ' + next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) + ', or message us if it is urgent.', 409)
  }
}
