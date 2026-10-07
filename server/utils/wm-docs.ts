// Client documents (advisory agreement, investment confirmation, product details) as typeset PDFs, and electronic
// signatures: the signed copy adds a signature certificate page (name, drawn signature, time, IP, document hash).
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
const money = (v: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
export async function docContext(clientId: string, entityId?: string | null) {
  const c = (await db().query<{ id: string; name: string; kind: string; country: string; contact_name: string | null; email: string | null; phone: string | null; risk_profile: string | null; entity: string | null; entity_address: string | null }>(
    'SELECT c.id, c.name, c.kind, c.country, c.contact_name, c.email, c.phone, c.risk_profile, e.name AS entity, e.address AS entity_address FROM wm.clients c LEFT JOIN core.entities e ON e.id = c.entity_id WHERE c.id = $1', [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  if (entityId) { const e = (await db().query<{ name: string; address: string | null }>('SELECT name, address FROM core.entities WHERE id = $1', [entityId])).rows[0]; if (e) { c.entity = e.name; c.entity_address = e.address } }
  const members = (await db().query<{ name: string; relationship: string | null; email: string | null }>('SELECT name, relationship, email FROM wm.members WHERE client_id = $1', [clientId])).rows
  const firms = (await db().query<{ name: string; kind: string; country: string | null; website: string | null; notes: string | null }>('SELECT f.name, f.kind, f.country, f.website, f.notes FROM wm.client_firms cf JOIN wm.firms f ON f.id = cf.firm_id WHERE cf.client_id = $1', [clientId])).rows
  const profile = (await db().query<{ data: Record<string, any> }>('SELECT data FROM wm.profiles WHERE client_id = $1', [clientId])).rows[0]?.data ?? {}
  return { c, members, firms, profile, entity: c.entity ?? (c.country === 'NG' ? 'Aidi Finance Limited' : 'Aidi Wealth LLC'), cfg: await wmSettings() }
}
export async function templateMd(kind: string, clientId: string, holdingId?: string | null, entityId?: string | null): Promise<{ title: string; md: string; requires_signature: boolean }> {
  const x = await docContext(clientId, entityId), today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  if (kind === 'iaa') {
    const tiers = x.cfg.advisory_tiers.map((t, i, a) => '| ' + (i === 0 ? 'First ' : 'Next ') + (t.upto ? money(t.upto - (i ? a[i - 1]!.upto ?? 0 : 0)) : 'balance above ' + money(a[i - 1]?.upto ?? 0)) + ' | ' + t.pct + '% a year |').join('\n')
    return { title: 'Investment Advisory Agreement', requires_signature: true, md: [
      'On this date **' + today + '**, by and between **' + x.entity + '** ("Aidi") and **' + x.c.name + '** ("Client").', '', '**Witnesseth**', '',
      'WHEREAS, the undersigned Client, being duly authorized, has funds available (the "Account"). In consideration of the premises and mutual covenants contained herein, and intending to be legally bound, the parties agree to the following terms and conditions:', '',
      '## (A) Appointment and Acceptance', 'The Client appoints Aidi as an investment partner for the Account. Aidi shall supervise and coordinate the investments of the Account, subject to the objectives, limitations and restrictions in the Client\'s Investment Policy Statement (Schedule A). Where the Client invests through a licensed asset manager, adviser, exchange or dealer identified in Schedule C ("Asset Manager"), Aidi acts as solicitor for that Asset Manager, facilitating the Client\'s investments on its platform.', '',
      '## (B) Duties of Aidi', 'Aidi accepts this appointment and a duty of utmost good faith to act in the best interests of the Client, including (1) charging no more than reasonable compensation for services provided, and (2) making no misleading statements regarding investments, compensation and conflicts of interest. In collaboration with the Asset Manager, Aidi will manage investment processes on the Asset Manager\'s platform in line with applicable laws and regulations, and provide transparency regarding all fees and charges. Aidi will render to the Client, at least quarterly, a written statement of the investments of the Account, which may come directly from Aidi or the Asset Manager.', '',
      '## (C) Duties of Client', 'The Client agrees to notify Aidi of any change in life status (including employment, retirement, marital status or household), to promptly notify Aidi in writing of any changes to its investment policy or restrictions and of any changes to persons authorized to receive information about the Account, and to execute any agreements reasonably necessary for Aidi to perform its services.', '',
      '## (D) Partnership with Asset Managers', 'Investments facilitated through an Asset Manager are executed on the Asset Manager\'s platform, held with its custodial services, and governed by its policies and the regulatory framework under which it operates. Aidi does not take custody of Client assets.', '',
      '## (E) Services to Other Clients', 'Aidi performs services for other clients and may give advice or take action for them that differs from the advice given or action taken for the Account, allocating opportunities fairly and equitably over time. Aidi shall not be responsible for any loss caused by an independent act or omission of a broker or Asset Manager.', '',
      '## (F) Fees', 'Fees are set out in Schedule D. Fees for the use of an Asset Manager\'s platform will be disclosed to the Client. The Client acknowledges that Aidi or its representatives may receive referral compensation from an Asset Manager, separate from the fees charged under this Agreement, and that this will be disclosed.', '',
      '## (G) Duration and Termination', 'This Agreement takes effect on the date above and continues until terminated by either party on thirty (30) days\' written notice. The Client may terminate within five (5) business days of signing with no obligation and without penalty.', '',
      '## (H) Conflicts of Interest', 'Aidi will disclose any potential conflicts of interest arising from its relationships with Asset Managers, including any financial incentive to recommend a particular platform, and will put the Client\'s interests first.', '',
      '## (I) Title to Assets', 'Unless the Client notifies Aidi otherwise in writing, the Client represents that assets in the Account belong to the Client free and clear of any liens or encumbrances.', '',
      '## (J) Market Conditions', 'Past performance cannot guarantee future results. Investments can rise or fall in value. Aidi does not guarantee that its services will result in a profit on non-fixed investments.', '',
      '## (K) Notices', 'Notices shall be given to Aidi at: ' + (x.c.entity_address ?? x.entity) + ', and to the Client at the email address on record, or such other address as either party specifies in writing.', '',
      '## (L) Governing Law and Disputes', 'This Agreement is governed by the laws of ' + (x.c.country === 'NG' ? 'the Federal Republic of Nigeria' : 'the State of California') + '. Any controversy or claim arising out of this Agreement shall be settled by arbitration, without waiving any rights the Client has under applicable securities laws.', '',
      '## (M) Confidentiality and Electronic Delivery', 'All Client information is confidential and will be disclosed only as required by law or authorized by the Client. The Client agrees to receive statements, notices and documents electronically through the Aidi Wealth portal and at the email address on record.', '',
      '## (N) Entire Agreement', 'This Agreement, including its Schedules, is the entire agreement between the parties on its subject matter and may be amended only in writing signed by both parties.', '',
      '## Schedule A: Client\'s Investment Policy', '| Item | |', '|---|---|', '| Owner of account | ' + x.c.name + ' |', '| Type of account | ' + (x.c.kind === 'business' ? 'Business' : x.c.kind === 'family' ? 'Family' : 'Individual') + ' |', '| Risk tolerance | ' + (x.c.risk_profile ?? 'To be agreed') + ' |', '| Investment objective | ' + ((x.profile.goals as { name: string }[] | undefined)?.map((g) => g.name).join('; ') || 'Asset growth and preservation') + ' |', '',
      '## Schedule B: Additional Authorized Persons', x.members.length ? '| Name | Relationship | Email |\n|---|---|---|\n' + x.members.map((m) => '| ' + m.name + ' | ' + (m.relationship ?? '') + ' | ' + (m.email ?? '') + ' |').join('\n') : 'None.', '',
      '## Schedule C: Asset Managers', x.firms.length ? '| Name | Type | Country |\n|---|---|---|\n' + x.firms.map((f) => '| ' + f.name + ' | ' + f.kind + ' | ' + (f.country ?? '') + ' |').join('\n') : 'To be confirmed for each investment.', '',
      '## Schedule D: Schedule of Fees', 'Advisory fee on assets under management (managed accounts), charged on each slice at its rate:', '', '| Assets | Rate |', '|---|---|', tiers, '', 'Subscription (self-directed): ' + money(x.cfg[x.c.country as 'US' | 'NG'].subscription, x.cfg[x.c.country as 'US' | 'NG'].currency) + ' a month. The Client will receive thirty (30) days\' written notice of any fee increase.', '',
      'IN WITNESS WHEREOF, the parties have executed this Agreement as of the date above.', '', '**For ' + x.entity + '**', '', 'Name: ______________________   Date: __________', '', '**Client: ' + x.c.name + '**', '', 'Signed electronically through the Aidi Wealth portal (see the signature certificate).'].join('\n') }
  }
  const h = holdingId ? (await db().query<{ name: string; category: string; platform: string | null; currency: string; cost: string | null; current_value: string | null; as_of: string | null; notes: string | null; meta: Record<string, any> }>("SELECT name, category, platform, currency, cost::text, current_value::text, to_char(as_of, 'Mon DD, YYYY') AS as_of, notes, meta FROM wealth.holdings WHERE id = $1 AND wm_client_id = $2", [holdingId, clientId])).rows[0] : undefined
  if (kind === 'investment_confirmation') {
    if (!h) throw apiError('invalid', 'Choose the holding this confirmation is for.')
    const m = h.meta ?? {}, cost = Number(h.cost ?? 0), mv = Number(m.market_value ?? h.current_value ?? cost), prem = Math.max(0, cost - mv)
    const rows = [['Investment in', h.name], ['Total invested', money(cost, h.currency)], ...(m.metal ? [['Market value', money(mv, h.currency)], ['Premium (insurance, storage & fees)', money(prem, h.currency)]] : []), ['Transaction date', h.as_of ?? today], ...(m.duration ? [['Duration', String(m.duration)]] : []), ...(m.maturity ? [['Maturity date', String(m.maturity)]] : []), ...(m.product ? [['Brand / product', String(m.product)]] : []), ...(m.ounces ? [['Troy ounces (oz)', m.ounces + ' oz' + (m.quantity ? ' (' + m.quantity + ' qty)' : '')]] : []), ...(m.units ? [['Units', String(m.units)]] : []), ...(h.platform ? [['Held with', h.platform]] : []), ...(m.vault ? [['Storage', String(m.vault)]] : [])]
    return { title: 'Investment Confirmation', requires_signature: false, md: ['**' + x.entity + '**' + (x.c.entity_address ? '  \n' + x.c.entity_address : ''), '', 'Date: **' + today + '**  ', 'Client: **' + x.c.name + '**', '', '| Detail | |', '|---|---|', ...rows.map((r) => '| ' + r[0] + ' | ' + r[1] + ' |'), '', 'Should you have any questions, please contact us through your Aidi Wealth portal. Thank you for your confidence in us; we look forward to meeting your investment objectives.', '', 'For ' + x.entity].join('\n') }
  }
  if (kind === 'product_details') {
    if (!h) throw apiError('invalid', 'Choose the holding.')
    const m = h.meta ?? {}
    return { title: 'Product Details', requires_signature: false, md: ['| Detail | |', '|---|---|', '| Product | ' + h.name + ' |', ...(m.vault ? ['| Storage location | ' + m.vault + ' |'] : []), ...(m.certificate ? ['| Account / certificate number | ' + m.certificate + ' |'] : []), ...(m.ounces ? ['| Weight | ' + m.ounces + ' troy oz |'] : []), ...(h.platform ? ['| Dealer / platform | ' + h.platform + ' |'] : []), '',
      '## Product Overview', h.notes || (m.metal ? 'Investment-grade ' + m.metal + ' from a recognised mint, sealed with its assay certificate showing a unique serial number, weight and purity.' : 'Details of this holding as recorded on your account.'), '',
      ...(m.vault ? ['## Storage & Security', 'Your ' + (m.metal ?? 'asset') + ' is stored at ' + m.vault + ', in insured, high-security vaults, protected against theft, damage and loss.', ''] : []),
      '## Important', 'This sheet describes the product you hold. It is not a recommendation to buy or sell. The value of investments can go down as well as up.'].join('\n') }
  }
  return { title: 'Document', requires_signature: false, md: '' }
}
export async function issueClientDoc(clientId: string, kind: string, title: string, md: string, requiresSignature: boolean, userId: string | null, holdingId: string | null = null, email = true, entityId: string | null = null) {
  const x = await docContext(clientId, entityId)
  const bytes = await legalPdf(x.entity, [{ title, md }])
  const doc = await storePdf(bytes, title + ' - ' + x.c.name + '.pdf', null)
  const row = await one<{ id: string }>('INSERT INTO wm.client_docs (client_id, kind, title, body_md, doc_id, requires_signature, status, holding_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [clientId, kind, title, md, doc, requiresSignature, requiresSignature ? 'sent' : 'info', holdingId, userId])
  if (email && x.c.email) { try { await sendEmail({ to: x.c.email, subject: (requiresSignature ? 'Please sign: ' : 'New document: ') + title, text: 'A new document, ' + title + ', is in your Aidi Wealth portal' + (requiresSignature ? ' and is ready for your electronic signature.' : '.') + '\n\n' + brands().aidi.url + '/w', html: '<p>A new document, <b>' + title + '</b>, is in your Aidi Wealth portal' + (requiresSignature ? ' and is ready for your electronic signature.' : '.') + '</p><p><a href="' + brands().aidi.url + '/w" style="color:#1c4f9c">Open your portal</a></p>' }) } catch { /* ignore */ } }
  return row.id
}
export async function signClientDoc(docRowId: string, clientId: string, name: string, signaturePng: string, ip: string, ua: string) {
  const d = (await db().query<{ title: string; status: string; storage_key: string }>('SELECT cd.title, cd.status, doc.storage_key FROM wm.client_docs cd JOIN core.documents doc ON doc.id = cd.doc_id WHERE cd.id = $1 AND cd.client_id = $2', [docRowId, clientId])).rows[0]
  if (!d) throw apiError('not_found', 'Not found', 404)
  if (d.status !== 'sent') throw apiError('state', 'This document is not waiting for a signature.', 409)
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(signaturePng)
  if (!m || m[1]!.length > 600_000) throw apiError('invalid', 'Please draw your signature.')
  const orig = await getObject(d.storage_key), hash = createHash('sha256').update(orig).digest('hex')
  const pdf = await PDFDocument.load(orig), reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const sig = await pdf.embedPng(Buffer.from(m[1]!, 'base64'))
  const p = pdf.addPage([612, 792]), ink = rgb(0.1, 0.1, 0.12), now = new Date()
  p.drawText('Electronic signature certificate', { x: 72, y: 700, size: 18, font: bold, color: rgb(0.11, 0.31, 0.61) })
  const rows: [string, string][] = [['Document', d.title], ['Signed by', name], ['Signed at', now.toUTCString()], ['IP address', ip], ['Device', ua.slice(0, 90)], ['Document fingerprint (SHA-256)', hash.slice(0, 32)], ['', hash.slice(32)]]
  let y = 660; for (const [k, v] of rows) { if (k) p.drawText(k, { x: 72, y, size: 9, font: bold, color: ink }); p.drawText(v.replace(/[^\x20-\x7E]/g, ''), { x: 250, y, size: 9, font: reg, color: ink }); y -= 18 }
  const sw = 220, sh = sw * (sig.height / sig.width); p.drawText('Signature', { x: 72, y: y - 20, size: 9, font: bold, color: ink }); p.drawImage(sig, { x: 250, y: y - 20 - Math.min(sh, 90), width: Math.min(sw, 90 * (sig.width / sig.height)), height: Math.min(sh, 90) })
  p.drawText('The signer agreed to sign this document electronically and that this signature is as binding as a handwritten one.', { x: 72, y: 120, size: 8, font: reg, color: rgb(0.4, 0.4, 0.4) })
  const bytes = await pdf.save()
  const signed = await storePdf(bytes, 'Signed - ' + d.title + '.pdf', null)
  await db().query("UPDATE wm.client_docs SET status = 'signed', signed_at = now(), signer_name = $3, signer_ip = $4, signer_ua = $5, signed_doc_id = $6 WHERE id = $1 AND client_id = $2", [docRowId, clientId, name, ip, ua.slice(0, 300), signed])
  return signed
}
export const TAX_FORMS = ['Schedule K-1 (Form 1065)', 'Schedules K-2 / K-3', 'Form 1099-DIV', 'Form 1099-INT', 'Form 1099-B', 'Form 1099-MISC', 'Form 1099-NEC', 'Form 1099-R', 'Form 1099-K', 'Form 1042-S', 'Form 5498', 'Form W-9 (copy)', 'Form W-8BEN (copy)', 'Nigeria WHT credit note', 'Nigeria tax clearance certificate', 'Capital gains statement', 'Other']
