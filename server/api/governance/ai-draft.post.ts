// AI drafts a trust or company resolution, minutes, written consent or distribution from the entity's register and a
// short brief. It uses only the names, roles, amounts and dates given; anything missing becomes a [placeholder].
// The draft fills the form; nothing is saved or circulated until a person saves it.
import { z } from 'zod'
const KIND: Record<string, string> = {
  resolution: 'a formal resolution of the trustees (for a trust) or directors/members (for a company): a heading, WHEREAS recitals giving the background, then numbered RESOLVED clauses, an effective date, and a signature block with one line per signatory (name, role, signature, date)',
  minutes: 'minutes of a meeting of the trustees (for a trust) or directors/members (for a company): heading with the meeting date, time [time] and place [place or video call]; present (the signatories) and in attendance; chair; quorum confirmed; numbered agenda items each with a short discussion summary and any decision ("IT WAS RESOLVED that…"); any other business; close of meeting; signature line for the chair',
  consent: 'a unanimous written consent in lieu of a meeting: heading, a statement that the undersigned, being all the trustees/directors, consent to the following actions without a meeting, numbered RESOLVED clauses, a counterparts clause, and a signature block for every signatory',
  distribution: 'a trustees\' resolution approving a distribution to a beneficiary: heading, WHEREAS recitals (the trust, the trust deed\'s power to distribute, the beneficiary\'s interest), RESOLVED clauses approving the exact amount and currency to the named beneficiary, the purpose, the source account [account], the payment date [date], a statement that the distribution is made in the trustees\' discretion under the trust deed and that records will be kept, a note that tax treatment should be confirmed with the trust\'s tax adviser, and a signature block for the trustees',
}
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  const b = z.object({ entity_id: z.string().uuid(), kind: z.enum(['resolution', 'minutes', 'distribution', 'consent']), title: z.string().trim().max(200).default(''), brief: z.string().trim().max(4000).default(''),
    current: z.string().max(20000).default(''), meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
    amount: z.coerce.number().positive().max(1e12).optional().or(z.literal('').transform(() => undefined)), currency: z.string().regex(/^[A-Z]{3}$/).optional(), beneficiary_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Say briefly what this should cover.')
  const d = b.data
  if (!d.brief && !d.current.trim() && !d.title) throw apiError('invalid', 'Say briefly what this should cover.')
  const e = (await db().query<{ name: string; legal_name: string | null; kind: string; jurisdiction: string | null }>('SELECT name, legal_name, kind, jurisdiction FROM core.entities WHERE id = $1', [d.entity_id])).rows[0]
  if (!e) throw apiError('not_found', 'Not found', 404)
  const parties = (await db().query<{ name: string; role: string; share_pct: string | null }>("SELECT name, role, share_pct::text FROM governance.parties WHERE entity_id = $1 AND (end_date IS NULL OR end_date >= current_date) ORDER BY role, name", [d.entity_id])).rows
  const ben = d.beneficiary_id ? (await db().query<{ name: string }>('SELECT name FROM governance.parties WHERE id = $1 AND entity_id = $2', [d.beneficiary_id, d.entity_id])).rows[0] : undefined
  const recent = (await db().query<{ kind: string; title: string; status: string; at: string }>("SELECT kind, title, status, to_char(created_at, 'YYYY-MM-DD') AS at FROM governance.resolutions WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 6", [d.entity_id])).rows
  const signers = await signatories(d.entity_id)
  const trust = e.kind === 'trust'
  const facts = [
    'Entity: ' + (e.legal_name || e.name) + (e.legal_name && e.legal_name !== e.name ? ' ("' + e.name + '")' : '') + ' · type: ' + e.kind + (e.jurisdiction ? ' · jurisdiction: ' + e.jurisdiction : ''),
    'Today: ' + new Date().toISOString().slice(0, 10),
    parties.length ? 'Register (current): ' + parties.map((p) => p.name + ' — ' + p.role.replace(/_/g, ' ') + (p.share_pct ? ' (' + p.share_pct + '%)' : '')).join('; ') : 'Register: none recorded',
    'Signatories who approve: ' + (signers.map((s) => s.name).join(', ') || 'none recorded'),
    d.meeting_date ? 'Meeting date: ' + d.meeting_date : '',
    d.kind === 'distribution' ? 'Distribution: ' + (d.amount ? d.currency + ' ' + d.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '[amount]') + ' to ' + (ben?.name ?? '[beneficiary]') : '',
    recent.length ? 'Earlier papers for this entity: ' + recent.map((r) => r.at + ' ' + r.kind + ' "' + r.title + '" (' + r.status + ')').join('; ') : '',
  ].filter(Boolean).join('\n')
  const { output } = await runAiTool({ task: 'governance_draft_' + d.kind, model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'governance-draft-v1', inputRef: 'entity:' + d.entity_id,
    system: 'You draft governance papers for a family office: trust and company resolutions, board/trustee minutes, written consents and trust distributions. Write in formal, plain legal English as used in US and Nigerian practice, ' +
      'with numbered clauses and no flourishes. Use only the facts given: never invent names, amounts, dates, account numbers, clause numbers of a trust deed, or decisions. Where something needed is missing, write a short placeholder in square brackets, e.g. [date], [account], [clause of the trust deed]. ' +
      'Refer to the entity by its legal name. For a trust, the decision-makers are the trustees; for a company, the directors or members. Plain text only: no Markdown, no asterisks or #; use CAPITALS for the heading and line breaks between sections. ' +
      'Do not give legal or tax advice beyond a one-line note to confirm with the adviser where relevant.',
    user: 'Draft ' + KIND[d.kind] + '.\n\nFacts:\n' + facts + (d.title ? '\n\nTitle given: ' + d.title : '') + (d.brief ? '\n\nWhat it should cover (from the ' + (trust ? 'trustee' : 'director') + '):\n' + d.brief : '') +
      (d.current.trim() ? '\n\nCurrent draft (improve it; keep every fact and decision in it):\n' + d.current.slice(0, 12000) : ''),
    toolName: 'write_paper', toolDescription: 'Return the drafted paper.', jsonSchema: { type: 'object', required: ['title', 'body'], properties: { title: { type: 'string', description: 'A short title for the register, e.g. "Approval of 2026 distribution to Jane Doe". Under 120 characters.' }, body: { type: 'string', description: 'The full text of the paper, plain text with line breaks.' } } },
    schema: z.object({ title: z.string().min(1).max(200), body: z.string().min(20).max(20000) }), maxTokens: 3000 })
  await audit({ event, actorUserId: user.userId, action: 'governance.ai_draft', objectType: 'entity', objectId: d.entity_id, entityId: d.entity_id, detail: { kind: d.kind } })
  return { title: output.title.trim(), body: output.body.trim() }
})
