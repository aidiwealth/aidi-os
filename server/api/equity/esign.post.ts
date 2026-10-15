// E-signing on the cap table: draft a document (SAFE from the template; grant, share purchase and board consent drafted
// by AI), send it for signature, remind a signer, void it, or link a board consent.
import { z } from 'zod'
const Signer = z.object({ role: z.enum(['company', 'holder', 'director']), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), title: z.string().trim().max(120).optional() })
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), ct: z.string().uuid().optional(), record: RecordSchema, signatory: z.object({ name: z.string().trim().min(1).max(200), title: z.string().trim().max(120).default('Chief Executive Officer') }) }),
  z.object({ action: z.literal('prepare_consent'), ct: z.string().uuid().optional(), doc_ids: z.array(z.string().uuid()).max(50).default([]), directors: z.array(z.string().trim().min(1).max(200)).min(1).max(15), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), also: z.string().max(3000).default('') }),
  z.object({ action: z.literal('send'), ct: z.string().uuid().optional(), kind: z.enum(['safe', 'grant', 'purchase', 'consent']), title: z.string().trim().min(1).max(200), body: z.string().min(20).max(120000), extra: z.array(z.object({ title: z.string().max(200), md: z.string().max(60000) })).max(5).default([]),
    record: RecordSchema.nullable().default(null), consent_id: z.string().uuid().nullable().default(null), consent_outside: z.boolean().default(false), consent_for: z.array(z.string().uuid()).max(50).default([]), signers: z.array(Signer).min(1).max(15) }),
  z.object({ action: z.literal('remind'), signer_id: z.string().uuid() }),
  z.object({ action: z.literal('void'), id: z.string().uuid() }),
  z.object({ action: z.literal('approve'), id: z.string().uuid(), consent_id: z.string().uuid().nullable().default(null), outside: z.boolean().default(false) })])
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const p = Body.safeParse(await readBody(event))
  if (!p.success) throw apiError('invalid', 'Check ' + (p.error.issues[0]?.path.join('.') || 'the details') + '.')
  const b = p.data
  const me = (await db().query<{ name: string | null; email: string }>('SELECT p.full_name AS name, u.email FROM core.users u LEFT JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]
  const by = { id: user.userId, name: me?.name || me?.email || 'The company' }
  if (b.action === 'prepare') {
    try { return await prepareDoc(b.record, await capTableId(b.ct), b.signatory) } catch (e) { if ((e as { statusCode?: number }).statusCode) throw e; console.error('[esign] draft', e); throw apiError('ai_failed', 'Could not draft the document just now. Try again.', 502) }
  }
  if (b.action === 'prepare_consent') {
    try { return await prepareConsent(await capTableId(b.ct), b.doc_ids, b.directors, b.date, b.also) } catch (e) { if ((e as { statusCode?: number }).statusCode) throw e; console.error('[esign] consent', e); throw apiError('ai_failed', 'Could not draft the consent just now. Try again.', 502) }
  }
  if (b.action === 'send') {
    const ct = await capTableId(b.ct)
    if (b.kind !== 'consent' && !b.record) throw apiError('invalid', 'Nothing to record on the cap table.')
    if (b.kind === 'consent' && !b.signers.some((s) => s.role === 'director')) throw apiError('invalid', 'Add the directors who sign the consent.')
    if (b.kind !== 'consent' && (!b.signers.some((s) => s.role === 'company') || !b.signers.some((s) => s.role === 'holder'))) throw apiError('invalid', 'Add someone signing for the company and the holder.')
    if (b.consent_id && !(await db().query("SELECT 1 FROM equity.esign_docs WHERE id = $1 AND kind = 'consent' AND captable_id = $2 AND status <> 'void'", [b.consent_id, ct])).rowCount) throw apiError('invalid', 'Choose a board consent on this cap table.')
    const r = await sendForSignature({ ct, kind: b.kind, title: b.title, body: b.body, extra: b.extra, record: b.record, consentId: b.consent_id, consentOutside: b.consent_outside, signers: b.signers, by })
    if (b.kind === 'consent' && b.consent_for.length) await db().query("UPDATE equity.esign_docs SET consent_id = $1 WHERE id = ANY($2::uuid[]) AND captable_id = $3 AND kind IN ('grant', 'purchase') AND applied_id IS NULL", [r.id, b.consent_for, ct])
    await audit({ event, actorUserId: user.userId, action: 'equity.esign_sent', objectType: 'equity_esign', objectId: r.id, detail: { kind: b.kind, signers: b.signers.length } })
    // The person sending can sign straight away when they are a signer.
    return { ok: true, id: r.id, my_link: r.links.find((l) => l.email === me?.email.toLowerCase())?.url ?? null }
  }
  if (b.action === 'remind') { await remindSigner(b.signer_id, by.name); return { ok: true } }
  if (b.action === 'void') {
    const r = await db().query("UPDATE equity.esign_docs SET status = 'void', voided_at = now() WHERE id = $1 AND status = 'sent'", [b.id])
    if (!r.rowCount) throw apiError('invalid', 'Only documents still waiting for signatures can be voided.')
    await audit({ event, actorUserId: user.userId, action: 'equity.esign_void', objectType: 'equity_esign', objectId: b.id }); return { ok: true }
  }
  await db().query("UPDATE equity.esign_docs SET consent_id = $2, consent_outside = $3 WHERE id = $1 AND kind IN ('grant', 'purchase') AND applied_id IS NULL", [b.id, b.consent_id, b.outside])
  const applied = await applyIfReady(b.id)
  await audit({ event, actorUserId: user.userId, action: 'equity.esign_approval', objectType: 'equity_esign', objectId: b.id, detail: { outside: b.outside } })
  return { ok: true, applied: !!applied }
})
