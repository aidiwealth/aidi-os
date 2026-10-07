// Wealth client: their documents; sign one electronically (typed name + drawn signature) or decline.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'GET') return (await db().query("SELECT id, kind, title, status, requires_signature, signed_doc_id IS NOT NULL AS has_signed, signed_at, created_at FROM wm.client_docs WHERE client_id = $1 ORDER BY (status = 'sent') DESC, created_at DESC", [id])).rows
  const b = z.object({ action: z.enum(['sign', 'decline']), doc_id: z.string().uuid(), name: z.string().trim().max(200).optional(), signature: z.string().max(800000).optional(), agree: z.boolean().optional(), reason: z.string().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.action === 'decline') { await db().query("UPDATE wm.client_docs SET status = 'declined', decline_reason = $3 WHERE id = $1 AND client_id = $2 AND status = 'sent'", [d.doc_id, id, d.reason || null]); return { ok: true } }
  if (!d.agree || !d.name || d.name.length < 3 || !d.signature) throw apiError('invalid', 'Type your full name, draw your signature and agree to sign electronically.')
  await signClientDoc(d.doc_id, id, d.name, d.signature, getRequestIP(event, { xForwardedFor: true }) ?? 'unknown', getRequestHeader(event, 'user-agent') ?? '')
  const staff = (await db().query<{ email: string | null; title: string; client: string }>('SELECT u.email, cd.title, c.name AS client FROM wm.client_docs cd JOIN wm.clients c ON c.id = cd.client_id LEFT JOIN core.users u ON u.id = cd.created_by WHERE cd.id = $1', [d.doc_id])).rows[0]
  if (staff?.email) { try { await sendEmail({ to: staff.email, subject: staff.client + ' signed ' + staff.title, text: staff.client + ' signed "' + staff.title + '" electronically. The signed copy is on their client page in Wealth management.', html: '<p>' + staff.client.replace(/</g, '&lt;') + ' signed <b>' + staff.title.replace(/</g, '&lt;') + '</b> electronically. The signed copy is on their client page in Wealth management.</p>' }) } catch { /* ignore */ } }
  await audit({ event, actorUserId: user.userId, action: 'wm.doc_signed', objectType: 'wm_client_doc', objectId: d.doc_id })
  return { ok: true }
})
