// Aidi Wealth identity checks, step by step. US: the client's details, the brokerage partner's identity check (or a
// government ID when there is no investing account yet) and a proof of address. Nigeria: details, BVN, a government
// ID and a proof of address. Clients upload from their portal; the AI reads each document against what we hold and
// the team accepts, asks for another or fails the check. The client always sees what is left to do and why.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

export const KYC_DOC_TYPES: Record<string, { kind: 'id_document' | 'proof_of_address'; label: string; note: string }> = {
  passport: { kind: 'id_document', label: 'Passport', note: 'The photo page' },
  drivers_license: { kind: 'id_document', label: 'Driver\'s licence', note: 'Front and back' },
  national_id: { kind: 'id_document', label: 'National ID card', note: 'Front and back (NIN slip in Nigeria)' },
  utility_bill: { kind: 'proof_of_address', label: 'Utility bill', note: 'Power, water, gas or internet' },
  bank_statement: { kind: 'proof_of_address', label: 'Bank statement', note: 'Showing your address' },
  lease: { kind: 'proof_of_address', label: 'Lease or mortgage', note: 'Signed and current' },
  tax_letter: { kind: 'proof_of_address', label: 'Tax letter', note: 'From the tax office this year' }
}
type State = 'done' | 'review' | 'now' | 'todo' | 'failed'
interface Step { key: string; label: string; state: State; detail: string; upload?: 'id_document' | 'proof_of_address' }
const day = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export async function identityView(clientId: string, staff: boolean) {
  const c = (await db().query<{ name: string; contact_name: string | null; email: string | null; phone: string | null; country: 'US' | 'NG'; kyc_status: string; kyc_detail: Record<string, any>; kyc_provider: string | null; bvn_last4: string | null; kyc_checked_at: string | null; accredited: boolean; accredited_at: string | null }>(
    'SELECT name, contact_name, email, phone, country, kyc_status, kyc_detail, kyc_provider, bvn_last4, kyc_checked_at, accredited, accredited_at FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const items = (await db().query<{ id: string; kind: string; doc_type: string | null; document_id: string; status: string; ai: Record<string, any> | null; note: string | null; added_by: string; created_at: string; reviewed_at: string | null; mime: string; title: string }>(
    'SELECT k.id, k.kind, k.doc_type, k.document_id, k.status, k.ai, k.note, k.added_by, k.created_at, k.reviewed_at, d.mime_type AS mime, d.title FROM wm.kyc_items k JOIN core.documents d ON d.id = k.document_id WHERE k.client_id = $1 ORDER BY k.created_at DESC', [clientId])).rows
  const events = (await db().query<{ text: string; actor: string; created_at: string }>('SELECT text, actor, created_at FROM wm.kyc_events WHERE client_id = $1 ORDER BY created_at DESC LIMIT 40', [clientId])).rows
  const prov = await providerRow(clientId, 'alpaca').catch(() => null)
  const onb = (await db().query<{ status: string; answers: Record<string, any> }>('SELECT status, answers FROM wm.onboarding WHERE client_id = $1', [clientId])).rows[0]
  const verified = c.kyc_status === 'verified'
  const docStep = (kind: 'id_document' | 'proof_of_address', label: string, todo: string): Step => {
    const mine = items.filter((i) => i.kind === kind), last = mine[0]
    if (verified || mine.some((i) => i.status === 'accepted')) return { key: kind, label, state: 'done', detail: 'Accepted' + (mine.find((i) => i.status === 'accepted')?.reviewed_at ? ' on ' + day(mine.find((i) => i.status === 'accepted')!.reviewed_at!) : '') }
    if (last?.status === 'to_review') return { key: kind, label, state: 'review', detail: (KYC_DOC_TYPES[last.doc_type ?? '']?.label ?? 'Document') + ' uploaded ' + day(last.created_at) + ' · being checked' }
    if (last?.status === 'rejected') return { key: kind, label, state: 'now', detail: 'Please add another: ' + (last.note || 'the last one could not be accepted'), upload: kind }
    return { key: kind, label, state: 'now', detail: todo, upload: kind }
  }
  const steps: Step[] = [{ key: 'details', label: 'Your details', state: c.contact_name && c.email ? 'done' : 'now', detail: onb?.status === 'done' || onb?.status === 'submitted' ? 'Name, date of birth and address from your account set-up' : 'Name and contact details on file' }]
  if (c.country === 'US') {
    if (prov?.external_id) {
      const s = String(prov.status ?? '').toUpperCase()
      steps.push({ key: 'brokerage', label: staff ? 'Brokerage identity check' : 'Identity check by our brokerage partner', state: ['APPROVED', 'ACTIVE'].includes(s) ? 'done' : s === 'REJECTED' ? 'failed' : s === 'ACTION_REQUIRED' ? 'now' : 'review',
        detail: ['APPROVED', 'ACTIVE'].includes(s) ? 'Passed' : s === 'REJECTED' ? 'Not approved · your adviser will be in touch' : s === 'ACTION_REQUIRED' ? 'More information is needed · your adviser will contact you' : 'Submitted · usually minutes' })
    } else steps.push(docStep('id_document', 'Government ID', 'A passport, driver\'s licence or state ID'))
    steps.push(docStep('proof_of_address', 'Proof of address', 'A utility bill or bank statement from the last 3 months'))
  } else {
    const bvnOk = !!c.kyc_detail?.name || (c.kyc_provider === 'prembly' && verified)
    steps.push({ key: 'bvn', label: 'BVN', state: bvnOk || verified ? 'done' : c.bvn_last4 ? 'review' : 'now', detail: bvnOk ? 'Verified' + (c.kyc_detail?.name && staff ? ': ' + c.kyc_detail.name : '') : c.bvn_last4 ? 'Ending ' + c.bvn_last4 + ' · being checked' : 'Your Bank Verification Number' })
    steps.push(docStep('id_document', 'Government ID', 'NIN slip, international passport, driver\'s licence or voter\'s card'))
    steps.push(docStep('proof_of_address', 'Proof of address', 'A utility bill or bank statement from the last 3 months'))
  }
  if (verified) for (const s of steps) if (s.state !== 'failed') s.state = 'done'
  if (c.kyc_status === 'failed') for (const s of steps) if (s.state !== 'done') s.state = 'failed'
  const done = steps.filter((s) => s.state === 'done').length
  const expected = { name: c.contact_name || c.name, address: onb?.answers?.address ? [onb.answers.address.street, onb.answers.address.city, onb.answers.address.state, onb.answers.address.postal_code].filter(Boolean).join(', ') : (onb?.answers?.household?.location ?? null), dob: onb?.answers?.identity?.date_of_birth ?? null }
  return { country: c.country, status: c.kyc_status, checked_at: c.kyc_checked_at, steps, done, total: steps.length, todo: steps.filter((s) => s.state === 'now').length,
    items: items.map((i) => ({ id: i.id, kind: i.kind, doc_type: i.doc_type, doc_label: KYC_DOC_TYPES[i.doc_type ?? '']?.label ?? (i.kind === 'id_document' ? 'ID document' : 'Document'), document_id: i.document_id, status: i.status, note: i.note, added_by: i.added_by, created_at: i.created_at, reviewed_at: i.reviewed_at, image: i.mime.startsWith('image/'), ...(staff ? { ai: i.ai } : {}) })),
    events: events.map((e) => ({ ...e, actor: staff ? e.actor : undefined })), ...(staff ? { accredited: c.accredited, accredited_at: c.accredited_at, expected, provider: prov ? { status: prov.status, account: prov.detail?.account_number ?? null } : null, bvn_last4: c.bvn_last4, bvn_name: c.kyc_detail?.name ?? null } : {}),
    doc_types: Object.entries(KYC_DOC_TYPES).map(([k, v]) => ({ key: k, ...v })) }
}

export async function kycEvent(clientId: string, text: string, actor: 'client' | 'staff' | 'automatic') { await db().query('INSERT INTO wm.kyc_events (client_id, text, actor) VALUES ($1,$2,$3)', [clientId, text.slice(0, 500), actor]) }

// A document for the check, from the client's portal or the team. The AI reads it straight away (best effort).
export async function identityUpload(clientId: string, parts: { name?: string; filename?: string; type?: string; data: Buffer }[], by: 'client' | 'staff') {
  const f = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  const docType = parts.find((p) => p.name === 'doc_type' && !p.filename)?.data.toString('utf8') ?? ''
  const t = KYC_DOC_TYPES[docType]
  if (!t) throw apiError('invalid', 'Choose what kind of document it is.')
  if (!f) throw apiError('invalid', 'Choose a file or take a photo.')
  const mime = f.type || 'application/octet-stream'
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'Upload a PDF or a photo (PNG, JPEG or WebP).')
  if (f.data.length > 20 * 1024 * 1024) throw apiError('too_big', 'The file is over 20 MB.')
  const doc = randomUUID(), key = 'documents/' + doc + '.' + (mime === 'application/pdf' ? 'pdf' : mime.split('/')[1])
  await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [doc, 'Identity — ' + t.label + ' — ' + (f.filename ?? 'document').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 120), key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
  const item = (await db().query<{ id: string }>('INSERT INTO wm.kyc_items (client_id, kind, doc_type, document_id, added_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [clientId, t.kind, docType, doc, by])).rows[0]!
  await db().query("UPDATE wm.clients SET kyc_status = CASE WHEN kyc_status IN ('verified') THEN kyc_status ELSE 'pending' END, kyc_provider = coalesce(kyc_provider, 'document'), updated_at = now() WHERE id = $1", [clientId])
  await kycEvent(clientId, t.label + ' uploaded', by)
  try { await readDocument(item.id, clientId, f.data, mime, t.kind, t.label) } catch (e) { console.error('[identity] ai read', (e as Error).message) }
  if (by === 'client') wmAlert(clientId, 'uploaded a ' + t.label.toLowerCase() + ' for their identity check')
  return item.id
}

// The AI reads the document and checks it against what we hold. A guide for the reviewer; a person decides.
async function readDocument(itemId: string, clientId: string, data: Buffer, mime: string, kind: string, label: string) {
  const v = await identityView(clientId, true) as { expected?: { name: string; address: string | null; dob: string | null } }
  const ex = v.expected ?? { name: '', address: null, dob: null }
  const block = mime === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } } : { type: 'image', source: { type: 'base64', media_type: mime, data: data.toString('base64') } }
  const Out = z.object({ doc_type: z.string().max(80), name_on_doc: z.string().max(200).nullable(), address_on_doc: z.string().max(300).nullable(), date_on_doc: z.string().max(40).nullable(), expiry: z.string().max(40).nullable(),
    checks: z.array(z.object({ name: z.string().max(60), result: z.enum(['match', 'check', 'mismatch']), detail: z.string().max(200) })).max(8), summary: z.string().max(400) })
  const { output } = await runAiTool({ task: 'wm_identity_read', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'wm-identity-v1', inputRef: 'wm_kyc_item:' + itemId, maxTokens: 900,
    system: 'You help a compliance reviewer check an identity document for a wealth-management client. Read the document and compare it with what we hold. Be factual and brief. Never decide: give each check as match, check (unclear, look yourself) or mismatch. Today is ' + new Date().toISOString().slice(0, 10) + '.',
    userContent: [block, { type: 'text', text: 'This should be a ' + (kind === 'id_document' ? 'government ID (' + label + ')' : 'proof of address (' + label + ')') + '. We hold: name "' + ex.name + '"' + (ex.address ? ', address "' + ex.address + '"' : '') + (ex.dob ? ', date of birth ' + ex.dob : '') + '. Checks to give: Name; ' + (kind === 'id_document' ? 'Date of birth (if we hold it); Not expired; ' : 'Address; Dated in the last 3 months; ') + 'Document type; Looks edited or cropped.' }],
    user: '', toolName: 'record_identity_read', toolDescription: 'What the document shows and how it compares with what we hold.',
    jsonSchema: { type: 'object', properties: { doc_type: { type: 'string' }, name_on_doc: { type: ['string', 'null'] }, address_on_doc: { type: ['string', 'null'] }, date_on_doc: { type: ['string', 'null'] }, expiry: { type: ['string', 'null'] }, checks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, result: { type: 'string', enum: ['match', 'check', 'mismatch'] }, detail: { type: 'string' } }, required: ['name', 'result', 'detail'] } }, summary: { type: 'string' } }, required: ['doc_type', 'checks', 'summary'] },
    schema: Out })
  await db().query('UPDATE wm.kyc_items SET ai = $2 WHERE id = $1', [itemId, JSON.stringify({ ...output, read_at: new Date().toISOString() })])
}

// The team's decisions. Each one is logged for the client and the team, and the client is emailed when they need to act.
export async function identityAct(clientId: string, userId: string, a: { action: string; item_id?: string; note?: string; kind?: string }) {
  const c = (await db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const first = (c.contact_name || c.name).split(/\s+/)[0] ?? ''
  const mail = async (what: string) => { if (c.email) { try { await sendWealthIdentity(c.email, first, what) } catch (e) { console.error('[identity] email', e) } } }
  const note = (a.note ?? '').trim().slice(0, 500)
  const item = a.item_id ? (await db().query<{ id: string; kind: string; doc_type: string | null }>('SELECT id, kind, doc_type FROM wm.kyc_items WHERE id = $1 AND client_id = $2', [a.item_id, clientId])).rows[0] : null
  const lbl = (i: { doc_type: string | null; kind: string }) => KYC_DOC_TYPES[i.doc_type ?? '']?.label ?? (i.kind === 'id_document' ? 'ID document' : 'Proof of address')
  if (a.action === 'accept' || a.action === 'accept_verify') {
    if (!item) throw apiError('not_found', 'Not found', 404)
    await db().query("UPDATE wm.kyc_items SET status = 'accepted', note = NULL, reviewed_by = $2, reviewed_at = now() WHERE id = $1", [item.id, userId])
    await kycEvent(clientId, lbl(item) + ' accepted', 'staff')
    if (a.action === 'accept_verify') { await db().query("UPDATE wm.clients SET kyc_status = 'verified', kyc_checked_at = now(), updated_at = now() WHERE id = $1", [clientId]); await kycEvent(clientId, 'Identity check complete', 'staff') }
  } else if (a.action === 'reject') {
    if (!item) throw apiError('not_found', 'Not found', 404)
    if (!note) throw apiError('invalid', 'Say why, in a line the client will see.')
    await db().query("UPDATE wm.kyc_items SET status = 'rejected', note = $3, reviewed_by = $2, reviewed_at = now() WHERE id = $1", [item.id, userId, note])
    await kycEvent(clientId, lbl(item) + ' not accepted: ' + note, 'staff')
    await mail('We couldn\'t accept your ' + lbl(item).toLowerCase() + ': ' + note + ' Please add another in your portal, under Identity.')
  } else if (a.action === 'ask') {
    const what = a.kind === 'id_document' ? 'a government ID' : 'a proof of address (a utility bill or bank statement from the last 3 months)'
    await kycEvent(clientId, 'Asked for ' + what + (note ? ': ' + note : ''), 'staff')
    await mail('To finish your identity check, please add ' + what + (note ? '. ' + note : '.') + ' You can do it in your portal, under Identity.')
  } else if (a.action === 'verify') {
    await db().query("UPDATE wm.clients SET kyc_status = 'verified', kyc_provider = coalesce(kyc_provider, 'manual'), kyc_checked_at = now(), updated_at = now() WHERE id = $1", [clientId])
    await db().query("UPDATE wm.kyc_items SET status = 'accepted', reviewed_by = $2, reviewed_at = now() WHERE client_id = $1 AND status = 'to_review'", [clientId, userId])
    await kycEvent(clientId, 'Identity check complete', 'staff')
  } else if (a.action === 'fail') {
    if (!note) throw apiError('invalid', 'Say why, in a line the client will see.')
    await db().query("UPDATE wm.clients SET kyc_status = 'failed', kyc_checked_at = now(), updated_at = now() WHERE id = $1", [clientId])
    await kycEvent(clientId, 'Identity check not passed: ' + note, 'staff')
    await mail('We were not able to complete your identity check: ' + note + ' Your adviser will be in touch.')
  } else if (a.action === 'accredited' || a.action === 'not_accredited') {
    const on = a.action === 'accredited'
    await db().query('UPDATE wm.clients SET accredited = $2, accredited_at = CASE WHEN $2 THEN now() ELSE NULL END, accredited_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END, updated_at = now() WHERE id = $1', [clientId, on, userId])
    await kycEvent(clientId, on ? 'Confirmed as an accredited investor' + (note ? ': ' + note : '') : 'Accredited investor status removed', 'staff')
  } else if (a.action === 'reopen') {
    await db().query("UPDATE wm.clients SET kyc_status = 'pending', updated_at = now() WHERE id = $1", [clientId])
    await kycEvent(clientId, 'Identity check reopened', 'staff')
  } else throw apiError('invalid', 'Unknown action.')
}
