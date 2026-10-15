// Signing equity documents in Finvry: a SAFE, an option grant or a share purchase (and the board consent approving
// it). Every signer gets a private link; when all have signed, the signed PDF (with a signature certificate) goes to
// Documents and to each signer, and the cap table records the SAFE, grant or shares by itself. A grant or share
// purchase waits for its board consent unless the board approved it outside Finvry.
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { z } from 'zod'

export type EsignKind = 'safe' | 'grant' | 'purchase' | 'consent'
const d8 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const n = (min = 0) => z.coerce.number().min(min)
const holder = { holder_name: z.string().trim().min(1).max(200), holder_email: z.string().trim().email().max(254), holder_kind: z.enum(['founder', 'employee', 'advisor', 'investor', 'other']) }
// What each kind of document puts on the cap table once it is signed (and approved).
export const RecordSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('convertible'), data: z.object({ ...holder, kind: z.enum(['safe', 'note']).default('safe'), amount: n(0.01), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), valuation_cap: n().nullable().default(null), discount_pct: z.coerce.number().min(0).max(99).nullable().default(null), post_money: z.boolean().default(true), mfn: z.boolean().default(false), pro_rata: z.boolean().default(false), issued_on: d8 }) }),
  z.object({ type: z.literal('grant'), data: z.object({ ...holder, plan_id: z.string().uuid(), kind: z.enum(['option', 'rsu', 'restricted']).default('option'), iso: z.boolean().default(true), shares: z.coerce.number().int().positive(), strike: n().nullable().default(null), granted_on: d8, vest_start: d8, vest_months: z.coerce.number().int().min(0).max(120), cliff_months: z.coerce.number().int().min(0).max(60) }) }),
  z.object({ type: z.literal('issuance'), data: z.object({ ...holder, class_id: z.string().uuid(), shares: z.coerce.number().int().positive(), price: n().nullable().default(null), issued_on: d8, vesting: z.string().max(300).default('') }) })])
export type EquityRecord = z.infer<typeof RecordSchema>

const money = (v: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: v < 1 ? 6 : 2 }).format(v)
const longDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const vestText = (m: number, c: number) => (m ? m / 12 + ' years' + (c ? ', with a ' + c + '-month cliff, then monthly' : ', monthly') : 'fully vested on grant')

// The document text for a record: SAFEs from Finvry's SAFE template, grants and purchases drafted by AI.
export async function prepareDoc(rec: EquityRecord, ct: string, signatory: { name: string; title: string }): Promise<{ kind: EsignKind; title: string; body: string; extra: { title: string; md: string }[] }> {
  const co = await docCompany(await companyEntityId())
  if (rec.type === 'convertible') {
    const r = rec.data
    const docs = safeDocs({ company_name: co.name, company_state: co.state || 'Delaware', investor_name: r.holder_name, investor_email: r.holder_email, amount: r.amount, currency: r.currency, valuation_cap: r.valuation_cap, discount: r.discount_pct, mfn: r.mfn, pro_rata: r.pro_rata, signatory_name: signatory.name, signatory_title: signatory.title, safe_date: r.issued_on })
    return { kind: 'safe', title: 'SAFE - ' + r.holder_name, body: docs[0]!.md, extra: docs.slice(1).map((x) => ({ title: x.title, md: x.md })) }
  }
  if (rec.type === 'grant') {
    const r = rec.data
    const plan = (await db().query<{ name: string }>('SELECT name FROM equity.plans WHERE id = $1 AND captable_id = $2', [r.plan_id, ct])).rows[0]
    if (!plan) throw apiError('invalid', 'Choose an option plan on this cap table.')
    const out = await draftDocument('option_grant', { holder: r.holder_name + ' (' + r.holder_email + ')', kind: r.kind === 'option' ? (r.iso ? 'ISO (incentive stock option)' : 'NSO (non-qualified stock option)') : r.kind === 'rsu' ? 'Restricted stock units' : 'Restricted stock award', shares: r.shares.toLocaleString('en-US'), strike: r.strike === null ? '[EXERCISE PRICE]' : money(r.strike), plan: plan.name, grant_date: r.granted_on, vesting: vestText(r.vest_months, r.cliff_months), vest_start: r.vest_start, term: '10 years from the grant date; 3 months after service ends to exercise vested options' }, co)
    return { kind: 'grant', title: out.title || 'Stock option grant - ' + r.holder_name, body: out.body, extra: [] }
  }
  const r = rec.data
  const cls = (await db().query<{ name: string }>('SELECT name FROM equity.classes WHERE id = $1 AND captable_id = $2', [r.class_id, ct])).rows[0]
  if (!cls) throw apiError('invalid', 'Choose a share class on this cap table.')
  const out = await draftDocument('stock_purchase', { purchaser: r.holder_name + ' (' + r.holder_email + ')', shares: r.shares.toLocaleString('en-US'), class: cls.name, price: r.price === null ? '[PRICE PER SHARE]' : money(r.price), date: r.issued_on, vesting: r.vesting || 'Fully vested', payment: r.price ? 'Cash: ' + money(r.price * r.shares) : 'As agreed' }, co)
  return { kind: 'purchase', title: out.title || 'Stock purchase agreement - ' + r.holder_name, body: out.body, extra: [] }
}
// A board consent approving pending grants and share issues (AI-drafted from the list).
export async function prepareConsent(ct: string, docIds: string[], directors: string[], date: string, also: string): Promise<{ title: string; body: string }> {
  const co = await docCompany(await companyEntityId())
  const rows = docIds.length ? (await db().query<{ kind: string; record: EquityRecord }>("SELECT kind, record FROM equity.esign_docs WHERE id = ANY($1::uuid[]) AND captable_id = $2 AND kind IN ('grant', 'purchase', 'safe')", [docIds, ct])).rows : []
  const items = rows.map((x) => { const r = x.record
    if (r.type === 'grant') return '- Grant to ' + r.data.holder_name + ' of ' + (r.data.kind === 'option' ? (r.data.iso ? 'incentive' : 'non-qualified') + ' stock options' : r.data.kind === 'rsu' ? 'restricted stock units' : 'restricted stock') + ' over ' + r.data.shares.toLocaleString('en-US') + ' shares' + (r.data.strike !== null ? ' at an exercise price of ' + money(r.data.strike) + ' per share (not less than fair market value)' : '') + ', vesting ' + vestText(r.data.vest_months, r.data.cliff_months) + ' from ' + r.data.vest_start + '.'
    if (r.type === 'issuance') return '- Issue and sale to ' + r.data.holder_name + ' of ' + r.data.shares.toLocaleString('en-US') + ' shares' + (r.data.price !== null ? ' at ' + money(r.data.price) + ' per share' : '') + (r.data.vesting ? ', ' + r.data.vesting : '') + '.'
    return '- Issue of a SAFE to ' + r.data.holder_name + ' for ' + money(r.data.amount, r.data.currency) + (r.data.valuation_cap ? ' with a ' + money(r.data.valuation_cap, r.data.currency) + ' valuation cap' : '') + '.' })
  const decision = 'Approve the following equity issuances, the related agreements in the form presented, and authorise the officers to sign them and record them in the stock ledger:\n' + items.join('\n') + (also ? '\n' + also : '')
  const out = await draftDocument('board_resolution', { decision, directors: directors.join(', '), date }, co)
  return { title: out.title || 'Action by unanimous written consent of the board', body: out.body }
}

export interface SignerIn { role: 'company' | 'holder' | 'director'; name: string; email: string; title?: string }
const signUrl = (token: string) => brands().finvry.url + '/sign/' + token
// Send a document for signature: one private link per signer, emailed.
export async function sendForSignature(input: { ct: string; kind: EsignKind; title: string; body: string; extra: { title: string; md: string }[]; record: EquityRecord | null; consentId: string | null; consentOutside: boolean; signers: SignerIn[]; by: { id: string; name: string } }) {
  const id = (await one<{ id: string }>('INSERT INTO equity.esign_docs (captable_id, kind, title, body, extra, record, consent_id, consent_outside, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [input.ct, input.kind, input.title, input.body, JSON.stringify(input.extra), input.record ? JSON.stringify(input.record) : null, input.consentId, input.consentOutside, input.by.id])).id
  const company = (await currentOrg())?.name ?? 'the company', links: { email: string; url: string }[] = []
  for (const [i, s] of input.signers.entries()) {
    const token = randomToken()
    await db().query('INSERT INTO equity.esign_signers (doc_id, role, name, email, title, token_hash, sort, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())', [id, s.role, s.name, s.email.toLowerCase(), s.title || null, sha256(token), i])
    links.push({ email: s.email.toLowerCase(), url: signUrl(token) })
    sendSignRequestEmail(s.email, s.name, company, input.title, signUrl(token), input.by.name).catch((e) => console.error('[esign] email', e))
  }
  return { id, links }
}
// A fresh link for a signer (reminder): the old one stops working.
export async function remindSigner(signerId: string, fromName: string): Promise<string> {
  const s = (await db().query<{ name: string; email: string; title: string }>('SELECT s.name, s.email, d.title FROM equity.esign_signers s JOIN equity.esign_docs d ON d.id = s.doc_id WHERE s.id = $1 AND s.signed_at IS NULL AND d.status = \'sent\'', [signerId])).rows[0]
  if (!s) throw apiError('not_found', 'Nothing to remind.', 404)
  const token = randomToken()
  await db().query('UPDATE equity.esign_signers SET token_hash = $2, sent_at = now() WHERE id = $1', [signerId, sha256(token)])
  await sendSignRequestEmail(s.email, s.name, (await currentOrg())?.name ?? '', s.title, signUrl(token), fromName, true)
  return signUrl(token)
}

export async function signerByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null
  return (await asPlatform(() => db().query<{ id: string; organization_id: string; doc_id: string; role: string; name: string; email: string; title: string | null; signed_at: string | null }>(
    'SELECT id, organization_id, doc_id, role, name, email, title, signed_at FROM equity.esign_signers WHERE token_hash = $1', [sha256(token)]))).rows[0] ?? null
}

// The signed PDF: the documents, then one certificate page listing every signer with their signature.
async function signedPdf(company: string, doc: { title: string; body: string; extra: { title: string; md: string }[] }, signers: { name: string; email: string; title: string | null; role: string; signed_at: string; signature_kind: string; signature_png: string | null; ip: string | null; user_agent: string | null }[]) {
  const base = await legalPdf(company, [{ title: doc.title, md: doc.body }, ...doc.extra], { logo: 'finvry' })
  const hash = createHash('sha256').update(base).digest('hex')
  const pdf = await PDFDocument.load(base); pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ink = rgb(0.1, 0.1, 0.12), mute = rgb(0.4, 0.4, 0.45)
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '')
  let p = pdf.addPage([612, 792]), y = 720
  p.drawText('Electronic signature certificate', { x: 64, y, size: 18, font: bold, color: rgb(0.05, 0.1, 0.18) }); y -= 22
  p.drawText(clean(doc.title).slice(0, 90), { x: 64, y, size: 10, font: reg, color: mute }); y -= 14
  p.drawText('Document fingerprint (SHA-256): ' + hash, { x: 64, y, size: 7.5, font: reg, color: mute }); y -= 26
  const ROLE: Record<string, string> = { company: 'For the company', holder: 'Holder', director: 'Director' }
  for (const s of signers) {
    if (y < 190) { p = pdf.addPage([612, 792]); y = 720 }
    p.drawLine({ start: { x: 64, y: y + 8 }, end: { x: 548, y: y + 8 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.9) })
    const rows: [string, string][] = [[ROLE[s.role] ?? s.role, clean(s.name) + (s.title ? ', ' + clean(s.title) : '')], ['Email', clean(s.email)], ['Signed', new Date(s.signed_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'], ['Method', s.signature_kind === 'typed' ? 'Typed name' : s.signature_kind === 'drawn' ? 'Drawn signature' : 'Uploaded signature image'], ['IP address', clean(s.ip ?? '')], ['Device', clean(s.user_agent ?? '').slice(0, 80)]]
    let yy = y - 10
    for (const [k, v] of rows) { p.drawText(k, { x: 64, y: yy, size: 8.5, font: bold, color: ink }); p.drawText(v, { x: 170, y: yy, size: 8.5, font: reg, color: ink }); yy -= 14 }
    const m = s.signature_png ? /^data:image\/png;base64,(.+)$/.exec(s.signature_png) : null
    if (m) { const img = await pdf.embedPng(Buffer.from(m[1]!, 'base64')); const h = Math.min(60, 170 * img.height / img.width), w = h * img.width / img.height; p.drawImage(img, { x: 548 - w, y: y - 10 - h, width: w, height: h }) }
    y = yy - 18
  }
  p.drawText('Each signer agreed to sign electronically under the E-SIGN Act and applicable state law, and that their signature is as binding as a handwritten one.', { x: 64, y: 70, size: 7.5, font: reg, color: mute })
  return { bytes: await pdf.save(), sha256: hash }
}

// After a signature: complete the document when everyone has signed, then put it on the cap table if it is approved.
export async function finishIfDone(docId: string): Promise<void> {
  const d = (await db().query<{ id: string; captable_id: string; kind: EsignKind; title: string; body: string; extra: { title: string; md: string }[]; status: string }>('SELECT id, captable_id, kind, title, body, extra, status FROM equity.esign_docs WHERE id = $1', [docId])).rows[0]
  if (!d || d.status !== 'sent') return
  const signers = (await db().query<{ name: string; email: string; title: string | null; role: string; signed_at: string | null; signature_kind: string; signature_png: string | null; ip: string | null; user_agent: string | null }>('SELECT name, email, title, role, signed_at, signature_kind, signature_png, ip, user_agent FROM equity.esign_signers WHERE doc_id = $1 ORDER BY sort', [docId])).rows
  if (!signers.length || signers.some((s) => !s.signed_at)) return
  const company = (await currentOrg())?.name ?? ''
  const { bytes } = await signedPdf(company, d, signers as (typeof signers[number] & { signed_at: string })[])
  const docRow = randomUUID(), key = 'documents/' + docRow + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6)", [docRow, await companyEntityId(), ('Signed - ' + d.title).replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200), key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  const upd = await db().query("UPDATE equity.esign_docs SET status = 'signed', document_id = $2, completed_at = now() WHERE id = $1 AND status = 'sent'", [docId, docRow])
  if (!upd.rowCount) return
  for (const s of signers) sendSignedCopyEmail(s.email, company, d.title, bytes).catch((e) => console.error('[esign] copy', e))
  await applyIfReady(docId)
  if (d.kind === 'consent') for (const w of (await db().query<{ id: string }>("SELECT id FROM equity.esign_docs WHERE consent_id = $1 AND status = 'signed' AND applied_id IS NULL", [docId])).rows) await applyIfReady(w.id)
}

// Put a signed (and, for grants and share purchases, approved) document's record on the cap table.
export async function applyIfReady(docId: string): Promise<string | null> {
  const d = (await db().query<{ id: string; captable_id: string; kind: EsignKind; record: EquityRecord | null; applied_id: string | null; status: string; consent_id: string | null; consent_outside: boolean; consent_ok: boolean }>(
    "SELECT d.id, d.captable_id, d.kind, d.record, d.applied_id, d.status, d.consent_id, d.consent_outside, coalesce((SELECT c.status = 'signed' FROM equity.esign_docs c WHERE c.id = d.consent_id), false) AS consent_ok FROM equity.esign_docs d WHERE d.id = $1", [docId])).rows[0]
  if (!d || d.status !== 'signed' || !d.record || d.applied_id) return null
  if (d.kind !== 'safe' && !d.consent_outside && !d.consent_ok) return null
  const r = RecordSchema.parse(d.record), ct = d.captable_id
  const h = (await db().query<{ id: string }>('SELECT id FROM equity.holders WHERE captable_id = $1 AND (lower(email) = lower($2) OR lower(name) = lower($3)) ORDER BY (lower(email) = lower($2)) DESC LIMIT 1', [ct, r.data.holder_email, r.data.holder_name])).rows[0]?.id
    ?? (await one<{ id: string }>('INSERT INTO equity.holders (captable_id, name, email, kind) VALUES ($1,$2,$3,$4) RETURNING id', [ct, r.data.holder_name, r.data.holder_email, r.data.holder_kind])).id
  let id: string
  if (r.type === 'convertible') id = (await one<{ id: string }>('INSERT INTO equity.convertibles (captable_id, holder_id, kind, amount, currency, valuation_cap, discount_pct, post_money, mfn, issued_on, esign_doc_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    [ct, h, r.data.kind, r.data.amount, r.data.currency, r.data.valuation_cap, r.data.discount_pct, r.data.post_money, r.data.mfn, r.data.issued_on, d.id])).id
  else if (r.type === 'grant') id = (await one<{ id: string }>('INSERT INTO equity.grants (captable_id, plan_id, holder_id, kind, shares, strike, granted_on, vest_start, vest_months, cliff_months, esign_doc_id, consent_doc_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
    [ct, r.data.plan_id, h, r.data.kind, r.data.shares, r.data.strike, r.data.granted_on, r.data.vest_start, r.data.vest_months, r.data.cliff_months, d.id, d.consent_id])).id
  else {
    id = (await one<{ id: string }>('INSERT INTO equity.issuances (captable_id, holder_id, class_id, shares, price, issued_on, notes, esign_doc_id, consent_doc_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [ct, h, r.data.class_id, r.data.shares, r.data.price, r.data.issued_on, r.data.vesting ? 'Vesting: ' + r.data.vesting : null, d.id, d.consent_id])).id
    await issueCertificate(id).catch((e) => console.error('[esign] certificate', e))
  }
  await db().query('UPDATE equity.esign_docs SET applied_id = $2 WHERE id = $1', [d.id, id])
  await db().query('UPDATE equity.captables SET updated_at = now() WHERE id = $1', [ct])
  return id
}

// An electronic share certificate for an issuance: numbered per class (CS-1, PS-1…), the restrictive legends, and the
// officer's signature (from the signed purchase agreement when there is one).
export async function issueCertificate(issuanceId: string, officer?: { name: string; title: string }): Promise<string> {
  const i = (await db().query<{ id: string; captable_id: string; shares: string; price: string | null; issued_on: string; certificate: string | null; holder: string; class_name: string; class_kind: string; class_id: string; esign_doc_id: string | null; notes: string | null }>(
    "SELECT i.id, i.captable_id, i.shares::text, i.price::text, to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on, i.certificate, h.name AS holder, c.name AS class_name, c.kind AS class_kind, c.id AS class_id, i.esign_doc_id, i.notes FROM equity.issuances i JOIN equity.holders h ON h.id = i.holder_id JOIN equity.classes c ON c.id = i.class_id WHERE i.id = $1", [issuanceId])).rows[0]
  if (!i) throw apiError('not_found', 'Not found', 404)
  let no = i.certificate
  if (!no) {
    const pre = i.class_kind === 'preferred' ? 'PS-' : 'CS-'
    const used = (await db().query<{ certificate: string }>("SELECT certificate FROM equity.issuances WHERE captable_id = $1 AND certificate LIKE $2", [i.captable_id, pre + '%'])).rows.map((x) => Number(x.certificate.slice(3)) || 0)
    no = pre + (Math.max(0, ...used) + 1)
    await db().query('UPDATE equity.issuances SET certificate = $2 WHERE id = $1', [i.id, no])
  }
  const co = await docCompany(await companyEntityId())
  const sig = i.esign_doc_id ? (await db().query<{ name: string; title: string | null; signature_png: string | null }>("SELECT name, title, signature_png FROM equity.esign_signers WHERE doc_id = $1 AND role = 'company' AND signed_at IS NOT NULL ORDER BY sort LIMIT 1", [i.esign_doc_id])).rows[0] : undefined
  const off = sig ? { name: sig.name, title: sig.title || 'Authorized officer', png: sig.signature_png } : { name: officer?.name ?? '', title: officer?.title || 'Authorized officer', png: null as string | null }
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.regular, 'base64'), { subset: true }), bold = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.semibold, 'base64'), { subset: true })
  const W = 792, H = 612, p = pdf.addPage([W, H]), navy = rgb(12 / 255, 26 / 255, 46 / 255), ink = rgb(0.1, 0.1, 0.12), mute = rgb(0.38, 0.4, 0.45)
  const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '')
  p.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: navy, borderWidth: 2.5 })
  p.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: navy, borderWidth: 0.6 })
  const center = (t: string, y: number, size: number, f = reg, c = ink) => p.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color: c })
  p.drawText('Certificate No. ' + no, { x: 56, y: H - 70, size: 11, font: bold, color: navy })
  const sh = Number(i.shares).toLocaleString('en-US') + ' shares'
  p.drawText(sh, { x: W - 56 - bold.widthOfTextAtSize(sh, 11), y: H - 70, size: 11, font: bold, color: navy })
  center(clean(co.name).toUpperCase(), H - 130, 24, bold, navy)
  center('Incorporated under the laws of the State of ' + clean(co.state || 'Delaware'), H - 154, 11, reg, mute)
  center(clean(i.class_name).toUpperCase(), H - 196, 13, bold, ink)
  const text = 'This certifies that ' + clean(i.holder) + ' is the registered holder of ' + Number(i.shares).toLocaleString('en-US') + ' fully paid and non-assessable shares of ' + clean(i.class_name) + ' of ' + clean(co.name) + ', transferable only on the books of the company by the holder in person or by a duly authorized attorney, and subject to the certificate of incorporation, the bylaws and any agreements described below.'
  const words = text.split(' '); let line = '', y = H - 232
  for (const w of words) { const t = line ? line + ' ' + w : w; if (reg.widthOfTextAtSize(t, 12) > W - 160 && line) { center(line, y, 12); y -= 18; line = w } else line = t }
  if (line) { center(line, y, 12); y -= 18 }
  center('Issued electronically on ' + longDate(i.issued_on) + (i.price ? ' at ' + money(Number(i.price)) + ' per share' : ''), y - 8, 10, reg, mute)
  // Signature
  const sx = W - 300, sy = 150
  if (off.png) { const m = /^data:image\/png;base64,(.+)$/.exec(off.png); if (m) { const img = await pdf.embedPng(Buffer.from(m[1]!, 'base64')); const h = Math.min(46, 190 * img.height / img.width); p.drawImage(img, { x: sx, y: sy + 4, width: h * img.width / img.height, height: h }) } }
  else if (off.name) p.drawText('/s/ ' + clean(off.name), { x: sx, y: sy + 10, size: 13, font: reg, color: navy })
  p.drawLine({ start: { x: sx, y: sy }, end: { x: sx + 220, y: sy }, thickness: 0.7, color: ink })
  p.drawText(clean(off.name || 'Authorized officer') + (off.name ? ', ' + clean(off.title) : ''), { x: sx, y: sy - 14, size: 9.5, font: reg, color: ink })
  // Legends
  const legends = ['THE SHARES HAVE NOT BEEN REGISTERED UNDER THE SECURITIES ACT OF 1933 OR ANY STATE SECURITIES LAWS AND MAY NOT BE SOLD, PLEDGED OR TRANSFERRED WITHOUT REGISTRATION OR AN AVAILABLE EXEMPTION.']
  if (/vest|repurchase/i.test(i.notes ?? '')) legends.push('THE SHARES ARE SUBJECT TO VESTING AND A REPURCHASE OPTION IN FAVOR OF THE COMPANY UNDER A STOCK PURCHASE AGREEMENT, A COPY OF WHICH IS ON FILE WITH THE COMPANY.')
  let ly = 96
  for (const lg of legends) { const ws = lg.split(' '); let l = ''; for (const w of ws) { const t = l ? l + ' ' + w : w; if (reg.widthOfTextAtSize(t, 6.8) > W - 130 && l) { p.drawText(l, { x: 56, y: ly, size: 6.8, font: reg, color: mute }); ly -= 9; l = w } else l = t } if (l) { p.drawText(l, { x: 56, y: ly, size: 6.8, font: reg, color: mute }); ly -= 12 } }
  p.drawText('Electronic certificate issued with Finvry', { x: 56, y: 42, size: 7, font: reg, color: mute })
  const bytes = await pdf.save(), id = randomUUID(), key = 'documents/' + id + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6)", [id, await companyEntityId(), ('Share certificate ' + no + ' - ' + i.holder).replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200), key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  await db().query('UPDATE equity.issuances SET certificate_doc_id = $2 WHERE id = $1', [i.id, id])
  return id
}
