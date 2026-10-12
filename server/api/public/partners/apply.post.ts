// A VC, incubator, accelerator or community applies to offer its startups a Finvry discount. The team reviews it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  rateLimit('partner_apply', clientIp(event), 5, 60 * 60 * 1000)
  const b = z.object({ name: z.string().trim().min(2).max(200), kind: z.enum(['vc', 'incubator', 'accelerator', 'startup', 'community', 'university', 'other']), website: z.string().trim().max(300).default(''), contact_name: z.string().trim().min(2).max(200), contact_email: z.string().trim().email().max(254), note: z.string().trim().max(2000).default(''), website2: z.string().max(0).optional() }).safeParse(await (async () => { const raw = await readBody(event); if (typeof raw !== 'string') return raw; try { return JSON.parse(raw) } catch { return {} } })()) // finvry.com posts JSON as text/plain (no CORS preflight)
  if (!b.success) throw apiError('invalid', 'Add your organisation, a contact name and a work email.')
  if (b.data.website2) return { ok: true }
  const d = b.data
  await asPlatform(() => db().query("INSERT INTO platform.partners (name, kind, website, contact_name, contact_email, note, status) VALUES ($1,$2,$3,$4,$5,$6,'pending')", [d.name, d.kind, d.website ? (/^https?:\/\//i.test(d.website) ? d.website : 'https://' + d.website) : null, d.contact_name, d.contact_email.toLowerCase(), d.note || null]))
  try { const prev = currentOrgId(); setOrgContext(await operatorOrgId()); try { for (const a of await orgNotifyEmails()) await sendEmail({ to: a, subject: 'New partner application: ' + d.name, text: d.name + ' (' + (PARTNER_KINDS[d.kind] ?? d.kind) + ') applied to offer its startups a Finvry discount.\n\nContact: ' + d.contact_name + ' <' + d.contact_email + '>\n' + (d.website ? d.website + '\n' : '') + (d.note ? '\n' + d.note : '') + '\n\nReview it in the Console under Partners & discounts.', html: '<p><b>' + d.name.replace(/</g, '&lt;') + '</b> applied to offer its startups a Finvry discount.</p><p>Contact: ' + d.contact_name.replace(/</g, '&lt;') + ' &lt;' + d.contact_email.replace(/</g, '&lt;') + '&gt;</p><p>Review it in the Console under Partners &amp; discounts.</p>', brand: 'finvry' }) } finally { setOrgContext(prev) } } catch (e) { console.error('[partners] apply alert', e) }
  return { ok: true }
})
