// A formation order: creates the client (as a lead), the company (forming), its owners, a formation job and the invoice,
// then returns the card payment page (or the invoice link for bank transfer). The client becomes active once paid.
import { z } from 'zod'
const s = (n: number) => z.string().trim().max(n)
const Body = z.object({
  website: z.string().max(0).optional(),
  state: z.string().trim().min(2).max(60), entity_type: z.enum(['llc', 'c_corp']),
  names: z.array(s(150)).min(1).max(3), purpose: s(500).optional(),
  address: z.object({ line1: s(200), line2: s(200).optional(), city: s(100), region: s(100), postal: s(20), country: s(100) }).optional(),
  management: z.enum(['member', 'manager', 'board']).default('member'),
  agent: z.enum(['ours', 'theirs']).default('ours'), agent_details: s(500).optional(),
  members: z.array(z.object({ name: s(200).min(1), email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)), ownership: z.coerce.number().min(0).max(100), address: s(500).optional(), country: s(100).optional() })).min(1).max(10),
  addons: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).max(15).default([]),
  contact: z.object({ name: s(200).min(1), email: z.string().trim().email().max(254), phone: s(40).optional(), country: s(100).optional() })
})
export default defineEventHandler(async (event) => {
  rateLimit('formation', clientIp(event), 6, 60 * 60 * 1000)
  await orgBySlug(String(getRouterParam(event, 'slug') ?? ''))
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Please check the form: a company name, at least one owner with ownership, and your name and email.')
  const d = b.data
  if (d.website) throw apiError('invalid', 'Please try again.')
  const names = d.names.map((n) => n.trim()).filter(Boolean)
  if (!names.length) throw apiError('invalid', 'Add the company name you want.')
  const total = d.members.reduce((t, m) => t + m.ownership, 0)
  if (Math.abs(total - 100) > 0.01) throw apiError('invalid', 'Ownership must add up to 100%. It adds up to ' + total + '%.')
  const cat = await formationCatalog()
  const pkg = d.entity_type === 'llc' ? cat.llc : cat.inc
  if (!pkg) throw apiError('unavailable', 'Online formation is not available yet. Please contact us.')
  const picked = cat.addons.filter((i) => d.addons.includes(i.code))
  const raw = [{ description: pkg.name + ' (' + d.state + ')', quantity: 1, unit_amount: Number(pkg.price) }, ...picked.map((i) => ({ description: i.name + (i.billing === 'monthly' ? ' (first 12 months)' : i.billing === 'annual' ? ' (first year)' : ''), quantity: addonQty(i), unit_amount: Number(i.price) }))]
    .map((l) => ({ ...l, amount: Math.round(l.quantity * l.unit_amount * 100) / 100 }))
  const tx = await applyTax(raw, 'US', 'services')
  const lines = tx.lines, amount = tx.amount
  const settings = await csBilling()
  const email = d.contact.email.toLowerCase()
  const virtual = picked.some((i) => i.code === 'virtual_office' || i.code === 'de_mailbox')
  const addr = d.address ? [d.address.line1, d.address.line2, [d.address.city, d.address.region, d.address.postal].filter(Boolean).join(' '), d.address.country].filter(Boolean).join('\n') : null
  const summary = ['Formation order', 'State: ' + d.state, 'Type: ' + (d.entity_type === 'llc' ? 'LLC' : 'C-Corp (Inc)'), 'Names in order of preference: ' + names.join(' / '),
    'Management: ' + d.management, 'Registered agent: ' + (d.agent === 'ours' ? 'provided by us' : 'their own — ' + (d.agent_details ?? '')), 'Purpose: ' + (d.purpose || '—'),
    'Address: ' + (addr ? addr.replaceAll('\n', ', ') : virtual ? 'virtual office' : '—'), 'Owners: ' + d.members.map((m) => m.name + ' ' + m.ownership + '%').join(', '), 'Add-ons: ' + (picked.map((i) => i.name).join(', ') || 'none')].join('\n')
  const client = await db().connect()
  let ids: { client: string; company: string; job: string; invoice: string; number: string }
  try {
    await client.query('BEGIN')
    const existing = await client.query<{ id: string }>('SELECT id FROM services.clients WHERE lower(email) = $1 ORDER BY created_at LIMIT 1', [email])
    const clientId = existing.rows[0]?.id ?? (await client.query<{ id: string }>("INSERT INTO services.clients (name, kind, contact_name, email, phone, country, status) VALUES ($1,'individual',$2,$3,$4,$5,'lead') RETURNING id",
      [d.contact.name, d.contact.name, email, d.contact.phone || null, d.contact.country || null])).rows[0]!.id
    const co = await client.query<{ id: string }>("INSERT INTO services.companies (client_id, name, entity_type, jurisdiction, country, address, registered_agent, virtual_office, mailbox, status, notes) VALUES ($1,$2,$3,$4,'United States',$5,$6,$7,$8,'forming',$9) RETURNING id",
      [clientId, names[0], d.entity_type, d.state, addr, d.agent, picked.some((i) => i.code === 'virtual_office'), picked.some((i) => i.code === 'de_mailbox'), 'Alternative names: ' + (names.slice(1).join(' / ') || '—') + (d.purpose ? '\nPurpose: ' + d.purpose : '')])
    for (const m of d.members) await client.query("INSERT INTO services.people (client_id, company_id, name, email, role, ownership_pct, address, nationality) VALUES ($1,$2,$3,$4,'owner',$5,$6,$7)", [clientId, co.rows[0]!.id, m.name, m.email?.toLowerCase() ?? null, m.ownership, m.address || null, m.country || null])
    const job = await client.query<{ id: string }>("INSERT INTO services.jobs (client_id, company_id, service, title, description, status) VALUES ($1,$2,'company_formation',$3,$4,'new') RETURNING id", [clientId, co.rows[0]!.id, 'Form ' + names[0] + ' (' + d.state + ')', summary])
    const inv = await client.query<{ id: string; number: string }>(
      `INSERT INTO services.invoices (number, client_id, company_id, job_id, region, currency, due_date, lines, amount, bill_to, issuer, status, sent_at, country, subtotal, tax_label, tax_rate, tax_amount)
       VALUES ($1 || '-' || to_char(current_date, 'YYYY') || '-' || lpad(((SELECT count(*) FROM services.invoices WHERE issue_date >= date_trunc('year', current_date)) + 1)::text, 4, '0'),
               $2,$3,$4,'us','USD', current_date + 7, $5, $6, $7, $8, 'sent', now(), 'US', $9, $10, $11, $12) RETURNING id, number`,
      [settings.prefix, clientId, co.rows[0]!.id, job.rows[0]!.id, JSON.stringify(lines), amount, JSON.stringify({ name: d.contact.name, email }), JSON.stringify({ ...settings.us, note_top: settings.note_top, note_bottom: settings.note_bottom }), tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount])
    await client.query('COMMIT')
    ids = { client: clientId, company: co.rows[0]!.id, job: job.rows[0]!.id, invoice: inv.rows[0]!.id, number: inv.rows[0]!.number }
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  await audit({ event, actorUserId: null, action: 'services.formation_order', objectType: 'job', objectId: ids.job, detail: { company: names[0], state: d.state, amount } })
  sendJobClientActivity(null, ids.job, d.contact.name, 'Form ' + names[0], 'placed a formation order for ' + names[0] + ' (' + d.state + ')', '').catch((e) => console.error('[formation] alert failed', e))
  try { const op = currentOrgId(); const ws = await workspaceForClient(event, ids.client); setOrgContext(ws.orgId); try { await sendInviteEmail(email, d.contact.name, 'the Aidi team') } finally { setOrgContext(op) } }
  catch (err) { console.error('[formation] finvry account failed', err) }
  const link = await billUrl(ids.invoice)
  const o = await currentOrg()
  const providers = csProviders('USD', o?.settings.brand)
  if (providers.length) {
    const reference = 'cs_' + ids.number.replace(/[^A-Za-z0-9]/g, '') + '_' + Date.now().toString(36)
    await db().query('INSERT INTO services.invoice_payments (organization_id, invoice_id, provider, reference, amount, currency) VALUES (core.current_org(),$1,$2,$3,$4,$5)', [ids.invoice, providers[0], reference, amount, 'USD'])
    try { return { ok: true, url: await providerCheckout(providers[0]!, { amount, currency: 'USD', email, name: 'Formation: ' + names[0], reference, returnUrl: link }) } }
    catch (err) { console.error('[formation] checkout failed', err) }
  }
  try { await sendCsInvoice(ids.invoice) } catch (err) { console.error('[formation] invoice email failed', err) }
  return { ok: true, url: link }
})
