// Sign a company's NDA before viewing its investor page, data room or updates. Keeps the exact text signed.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('nda_sign', clientIp(event), 20, 60 * 60 * 1000)
  const b = z.object({ kind: z.enum(['page', 'room', 'update']), ref: z.string().min(2).max(120), name: z.string().trim().min(2).max(200), email: z.string().trim().toLowerCase().email().max(254), company: z.string().trim().max(200).default(''), signature: z.string().trim().min(2).max(200), agree: z.literal(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Fill in your name, email and signature, and tick to agree.')
  const d = b.data
  if (d.signature.toLowerCase().replace(/\s+/g, ' ') !== d.name.toLowerCase().replace(/\s+/g, ' ')) throw apiError('invalid', 'Type your full name exactly as above to sign.')
  let orgId: string | null = null
  if (d.kind === 'room') orgId = (await findRoomLink(d.ref))?.organization_id ?? null
  else if (d.kind === 'page') orgId = (await asPlatform(() => db().query<{ organization_id: string }>('SELECT organization_id FROM financials.public_pages WHERE slug = $1', [d.ref.toLowerCase()]))).rows[0]?.organization_id ?? null
  else orgId = d.ref.length >= 30 ? (await asPlatform(() => db().query<{ organization_id: string }>('SELECT organization_id FROM financials.update_sends WHERE token_hash = $1', [sha256(d.ref)]))).rows[0]?.organization_id ?? null
    : (await asPlatform(() => db().query<{ organization_id: string }>('SELECT organization_id FROM financials.public_pages WHERE slug = $1', [d.ref.toLowerCase()]))).rows[0]?.organization_id ?? null
  if (!orgId) throw apiError('not_found', 'Not found', 404)
  const br = await brandingOf(orgId)
  if (!br.nda_enabled) throw apiError('invalid', 'No NDA is required here.')
  const r = await asPlatform(() => db().query<{ id: string }>('INSERT INTO fundraise.nda_signatures (organization_id, scope, name, email, company, signature, nda_text, ip_hash, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [orgId, d.kind, d.name, d.email, d.company || null, d.signature, br.nda_text, sha256(clientIp(event) + ':nda'), (getRequestHeader(event, 'user-agent') ?? '').slice(0, 300)]))
  await crmContact(orgId, d.email, d.name)
  setOrgContext(orgId); for (const e of await orgNotifyEmails()) sendShareViewedEmail(e, 'NDA signed by ' + d.name + (d.company ? ' (' + d.company + ')' : ''), brands().finvry.url + '/fundraising?t=nda').catch(() => {})
  return { ok: true, id: r.rows[0]!.id }
})
