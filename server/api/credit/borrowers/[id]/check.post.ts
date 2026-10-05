// Run a credit check on a borrower. Nigeria: CreditChek by BVN (individual) or RC number (business). Other countries:
// manual review until a US bureau is connected. The ID is stored encrypted (last 4 shown) only if monitoring is on.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('credit_check', user.userId, 30, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ kind: z.enum(['individual', 'business']), identifier: z.string().trim().max(30).default(''), monitor: z.boolean().default(false), manual: z.object({ score: z.number().int().min(300).max(850).nullable(), note: z.string().max(3000) }).optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the details.')
  const br = (await db().query<{ id: string; country: string | null; identifier_enc: string | null }>('SELECT id, country, identifier_enc FROM credit.borrowers WHERE id = $1', [id.data])).rows[0]
  if (!br) throw apiError('not_found', 'Borrower not found', 404)
  const d = b.data, ng = /^\s*nigeria\s*$/i.test(br.country ?? '')
  const save = async (provider: string, status: string, score: number | null, band: string | null, summary: unknown, note: string | null) =>
    (await one<{ id: string }>('INSERT INTO credit.checks (borrower_id, provider, kind, status, score, band, summary, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [br.id, provider, d.kind, status, score, band, JSON.stringify(summary ?? {}), note, user.userId])).id
  if (d.manual) {
    const band = d.manual.score === null ? null : d.manual.score >= 750 ? 'Excellent' : d.manual.score >= 680 ? 'Good' : d.manual.score >= 600 ? 'Fair' : 'Poor'
    const cid = await save('manual', 'manual', d.manual.score, band, {}, d.manual.note || 'Manual review')
    await audit({ event, actorUserId: user.userId, action: 'credit.manual_review', objectType: 'borrower', objectId: br.id })
    return { ok: true, id: cid, status: 'manual', score: d.manual.score, band }
  }
  if (!ng) {
    if (!usBureauOn()) { const cid = await save('manual', 'manual', null, null, {}, 'Automatic bureau checks are not available for ' + (br.country || 'this country') + ' yet. Review this borrower manually.'); return { ok: true, id: cid, status: 'manual' } }
    throw apiError('us_bureau', 'The US bureau connector is switched on but no bureau is configured.', 503)
  }
  const ident = d.identifier.replace(/\s+/g, '').toUpperCase()
  const stored = br.identifier_enc ? decryptText(br.identifier_enc) : ''
  const use = ident || stored
  if (d.kind === 'individual' ? !/^\d{11}$/.test(use) : !/^(RC|BN|IT)?\d{4,9}$/.test(use)) throw apiError('invalid', d.kind === 'individual' ? 'Enter the borrower\'s 11-digit BVN.' : 'Enter the business RC number, e.g. RC123456.')
  const r = await creditchek(d.kind, use)
  const sc = r.summary ? scoreOf(r.summary) : null
  const cid = await save('creditchek', r.status, sc?.score ?? null, sc?.band ?? null, r.summary ?? {}, r.status === 'no_data' ? 'No credit history found at the bureaus.' : null)
  await db().query('UPDATE credit.borrowers SET kind = $2, monitor = $3, identifier_enc = CASE WHEN $3 THEN $4 ELSE NULL END, identifier_last4 = $5 WHERE id = $1', [br.id, d.kind, d.monitor, encryptText(use), use.slice(-4)])
  await audit({ event, actorUserId: user.userId, action: 'credit.check', objectType: 'borrower', objectId: br.id, detail: { status: r.status } })
  return { ok: true, id: cid, status: r.status, score: sc?.score ?? null, band: sc?.band ?? null }
})
