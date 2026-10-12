// Agreements: the Service Level Agreement a client signs for each job, and the Terms of Service and Data Privacy
// Agreement every Finvry sign-up accepts. Nigerian clients get Nigerian-law versions; everyone else gets California and
// US federal law. The services team edits the wording (legal.templates overrides the defaults below); every signature
// keeps the exact text signed, the signature image and a signed PDF with a signature certificate.
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { z } from 'zod'

export const AGREEMENT_CODES = ['sla', 'terms_us', 'terms_ng', 'privacy_us', 'privacy_ng'] as const
export type AgreementCode = typeof AGREEMENT_CODES[number]
export const AGREEMENT_LABEL: Record<AgreementCode, string> = { sla: 'Service Level Agreement (each job)', terms_us: 'Terms of Service — US & global', terms_ng: 'Terms of Service — Nigeria', privacy_us: 'Data Privacy Agreement — US & global', privacy_ng: 'Data Privacy Agreement — Nigeria' }
export const AGREEMENT_FIELDS: Record<AgreementCode, string[]> = {
  sla: ['provider', 'provider_address', 'provider_email', 'client', 'company', 'signer_name', 'signer_email', 'effective_date', 'services', 'total', 'notes', 'governing_law', 'esign_law'],
  terms_us: ['provider', 'provider_address', 'provider_email', 'client', 'signer_name', 'signer_email', 'effective_date'],
  terms_ng: ['provider', 'provider_address', 'provider_email', 'client', 'signer_name', 'signer_email', 'effective_date'],
  privacy_us: ['provider', 'provider_address', 'provider_email', 'client', 'signer_name', 'signer_email', 'effective_date'],
  privacy_ng: ['provider', 'provider_address', 'provider_email', 'client', 'signer_name', 'signer_email', 'effective_date']
}

const US_LAW = 'This Agreement is governed by the laws of the State of California and applicable United States federal law, without regard to conflict-of-laws rules. Any dispute that cannot be resolved informally within thirty (30) days will be heard exclusively in the state or federal courts located in Santa Clara County, California, and each party consents to their jurisdiction. Nothing here limits either party\'s right to seek urgent injunctive relief in any competent court.'
const NG_LAW = 'This Agreement is governed by the laws of the Federal Republic of Nigeria. Any dispute that cannot be resolved amicably within thirty (30) days will be referred to arbitration in Lagos, Nigeria, under the Arbitration and Mediation Act 2023, before a sole arbitrator appointed by agreement or, failing agreement, by the Chairman of the Lagos Court of Arbitration. The award is final and binding. Nothing here limits either party\'s right to seek urgent injunctive relief from a Nigerian court of competent jurisdiction.'
const US_ESIGN = 'the federal Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the California Uniform Electronic Transactions Act'
const NG_ESIGN = 'section 93 of the Evidence Act 2011 and other applicable Nigerian law'
export const lawFor = (ng: boolean) => ({ governing_law: ng ? NG_LAW : US_LAW, esign_law: ng ? NG_ESIGN : US_ESIGN })

const SLA = `# Service Level Agreement

This Service Level Agreement (the **"Agreement"**) is made on **{{effective_date}}** (the **"Effective Date"**) between **{{provider}}**, {{provider_address}} (**"we"**, **"us"** or the **"Provider"**), and **{{client}}** (the **"Client"**), signed by **{{signer_name}}** ({{signer_email}}).

## 1. The services

We will provide the services below (the **"Services"**) for **{{company}}**, as ordered through Finvry:

{{services}}

Total due now: **{{total}}**. Client notes: {{notes}}

## 2. Service levels

- **Acknowledgement:** we confirm every new order within one (1) business day.
- **Start of work:** we start within two (2) business days after the later of payment and receipt of all information and documents we ask for.
- **Updates:** every status change, message and document is posted on the request in Finvry, and we email you when it moves.
- **Messages:** we reply to messages within one (1) business day.
- **Filings with deadlines:** we submit before the official deadline when we receive complete information at least ten (10) business days before it. Information received later is filed as soon as reasonably possible, and we tell you about any late-filing risk.
- **Government and third-party timing:** processing times of government agencies, registered agents, banks and other third parties are outside our control and are not covered by these service levels.

## 3. Your responsibilities

You will (a) give us complete, accurate and timely information and documents; (b) tell us promptly about any change that affects the Services; (c) review drafts and filings we share and raise any correction within five (5) business days; and (d) keep your Finvry account secure. We rely on the information you give us and are not responsible for errors caused by inaccurate or late information.

## 4. Fees, renewals and refunds

Fees are as shown above and on your invoice; taxes apply where required. Recurring services (such as a registered agent or virtual office) renew automatically each period from your Finvry wallet or saved card until you cancel before the renewal date. You may cancel an order for a full refund before work starts, less any government or third-party fees already paid. Once a filing has been submitted, or a third-party fee has been paid, that part of the fee is non-refundable.

## 5. Scope

We provide filing, formation, compliance and administrative services. Unless a legal, tax or accounting review is expressly part of the Services ordered, we do not give legal, tax, accounting or investment advice, and you should consult your own advisers.

## 6. Confidentiality and data

Each party keeps the other's confidential information confidential and uses it only for this Agreement. We handle personal data as set out in the Finvry Data Privacy Agreement, which forms part of this Agreement.

## 7. Liability

Each party's total liability under this Agreement is limited to the fees you paid for the Services in the twelve (12) months before the claim, except for fraud, wilful misconduct, or liability that cannot be limited by law. Neither party is liable for indirect or consequential loss, or loss of profit, revenue or data.

## 8. Term and termination

This Agreement starts on the Effective Date and continues until the Services are complete and any recurring services end. Either party may terminate on written notice if the other materially breaches this Agreement and does not fix the breach within fourteen (14) days. Fees for work already done remain payable.

## 9. Governing law and disputes

{{governing_law}}

## 10. Electronic signature

The parties agree that this Agreement may be signed electronically under {{esign_law}}, and that an electronic signature (typed, drawn or uploaded) is as binding as a handwritten one. This Agreement, the order and the Finvry Terms of Service are the entire agreement on its subject matter.

**For {{provider}}** — accepted on placing this order through Finvry.

**For {{client}}** — {{signer_name}}, signed electronically (see the signature certificate).`

const TERMS = (ng: boolean) => `# Finvry Terms of Service

These Terms of Service (the **"Terms"**) are an agreement made on **{{effective_date}}** between **{{provider}}**, {{provider_address}} (**"Finvry"**, **"we"** or **"us"**), and **{{client}}** (the **"Customer"**), accepted by **{{signer_name}}** ({{signer_email}}), who confirms they are at least eighteen (18) years old and authorised to bind the Customer.

## 1. The service

Finvry is software for companies and founders: financial reporting, investor updates and pages, decks, data rooms, compliance calendars, documents, and optional services (company formation, filings, registered agent, virtual office and managed fundraising) delivered by our team. Some features depend on your plan.

## 2. Your account

You are responsible for the accuracy of your account details, for keeping sign-in codes and devices secure, and for everything done under your account. Tell us at once at {{provider_email}} if you suspect unauthorised use. You may invite team members; you are responsible for their use of Finvry.

## 3. Plans, billing and renewals

Paid plans are billed ${ng ? 'in Nigerian naira' : 'in US dollars'} monthly or yearly in advance and renew automatically until cancelled. Trials convert to the chosen plan unless cancelled before the trial ends. You can cancel any time in Settings; the plan stays active until the end of the paid period, and fees already paid are not refunded except where the law requires. We may change prices with at least thirty (30) days' notice before your next renewal. Services ordered from our team are covered by the Service Level Agreement you sign for each order.

## 4. Your data

You own the data and files you put into Finvry (**"Customer Data"**). You grant us a limited licence to host, process and display Customer Data only to provide and improve the service, as set out in the Data Privacy Agreement. You are responsible for having the right to upload Customer Data and for anything you choose to publish, such as an investor page, deck link or update.

## 5. Acceptable use

You will not use Finvry to break the law; upload malware; infringe others' rights; send spam; mislead investors; probe, scrape or overload the service; or resell it without our written permission. We may suspend accounts that do, after notice where reasonable.

## 6. AI features

Some features use artificial intelligence to draft text, read documents or analyse figures. AI output can be wrong or incomplete; review it before relying on it or sharing it. We do not use your Customer Data to train third-party AI models.

## 7. Third-party services

Payments, email delivery, bank connections and similar functions are provided by third-party processors under their own terms. We are not responsible for their acts or availability, but we choose them with care and require them to protect your data.

## 8. Intellectual property

Finvry, its software, design and content belong to us and our licensors. These Terms give you a right to use the service during your subscription; they do not transfer ownership. Feedback you give us may be used freely.

## 9. Confidentiality

Each party keeps the other's non-public information confidential, uses it only under these Terms, and protects it with at least reasonable care.

## 10. Warranties and disclaimers

We will provide the service with reasonable skill and care. Otherwise, and to the extent the law allows, Finvry is provided "as is" without other warranties. Finvry does not give legal, tax, accounting or investment advice, and nothing in the service is an offer of securities.

## 11. Limitation of liability

To the extent the law allows, our total liability under these Terms is limited to the fees you paid us in the twelve (12) months before the claim, and neither party is liable for indirect or consequential loss, or loss of profit, revenue or data, except for fraud, wilful misconduct, or liability that cannot be limited by law.

## 12. Indemnity

You will indemnify us against third-party claims arising from Customer Data you publish or your breach of these Terms.

## 13. Suspension and termination

You may close your account at any time. We may suspend or end access for material breach, non-payment, or legal requirement, with notice where reasonable. On closure you can export your data for thirty (30) days, after which we delete it as described in the Data Privacy Agreement.

## 14. Changes

We may update these Terms. We will give at least thirty (30) days' notice of material changes by email or in the app; continuing to use Finvry after that means you accept them.

## 15. Governing law and disputes

${ng ? NG_LAW.replace('This Agreement', 'These Terms') : US_LAW.replace('This Agreement', 'These Terms')}

## 16. Electronic acceptance

You agree that accepting these Terms electronically under ${ng ? NG_ESIGN : US_ESIGN} is as binding as a handwritten signature. Notices to us go to {{provider_email}}; notices to you go to the email on your account.`

const PRIVACY_US = `# Finvry Data Privacy Agreement

This Data Privacy Agreement (the **"Privacy Agreement"**) is made on **{{effective_date}}** between **{{provider}}**, {{provider_address}} (**"Finvry"**, **"we"** or **"us"**), and **{{client}}** (the **"Customer"**), accepted by **{{signer_name}}** ({{signer_email}}). It explains how we collect, use, share and protect personal information, and your rights under the California Consumer Privacy Act as amended by the California Privacy Rights Act (**"CCPA"**), other applicable US state privacy laws, and US federal law.

## 1. Information we collect

- **Account and contact details:** names, work emails, phone numbers, job titles and company details.
- **Customer Data:** financial figures, documents, investor lists, compliance records and other content you upload.
- **Service order details:** company formation, ownership, tax and filing information you give us for services you order, which may include government identifiers.
- **Billing details:** plan, invoices and payment status. Card details are handled by our payment processors and never stored by us.
- **Usage and device data:** sign-in times, IP address, browser, pages used and security logs.

## 2. How we use it

To provide and secure Finvry and the services you order; to bill you; to send service, security and account messages; to provide support; to improve the product; and to meet legal obligations. We send marketing email only with your permission and you can unsubscribe at any time.

## 3. Sharing

We share personal information only with (a) service providers that host, process payments, deliver email, connect bank data or provide AI features for us, under written contracts that limit their use to providing services to us; (b) government agencies, registered agents and similar parties when needed to deliver a service you ordered; (c) people you choose to share with, such as investors viewing your page; and (d) authorities when the law requires. **We do not sell or "share" personal information for cross-context behavioural advertising**, and we do not use Customer Data to train third-party AI models.

## 4. Sensitive personal information

We use sensitive personal information (such as government identifiers needed for a filing) only to deliver the service you requested and as the law permits.

## 5. Retention

We keep personal information while your account is open and for as long as needed to provide services, resolve disputes and meet legal, tax and record-keeping obligations (generally up to seven (7) years for financial and filing records). On account closure we delete or de-identify the rest within ninety (90) days.

## 6. Security

We protect information with encryption in transit and at rest, access controls, two-step sign-in options, logging and staff confidentiality obligations. No system is perfectly secure; we will notify you and regulators of a data breach as the law requires.

## 7. Your rights

Depending on where you live, you may ask to know, access, correct, delete or receive a copy of your personal information; to opt out of sale or sharing (we do neither); and to limit the use of sensitive personal information. We will not discriminate against you for using these rights. Send requests to {{provider_email}}; we verify requests and respond within forty-five (45) days. An authorised agent may act for you with your written permission.

## 8. International transfers

We operate in the United States and Nigeria and may process information in either country and wherever our service providers operate, with safeguards appropriate to the information.

## 9. Children

Finvry is for businesses and is not directed to children under sixteen (16). We do not knowingly collect their information.

## 10. Your role as a business customer

For personal information about your investors, employees or contacts that you upload, you are responsible for having a lawful basis to share it with us, and we process it only on your instructions to provide the service.

## 11. Changes and contact

We will give at least thirty (30) days' notice of material changes. Questions or complaints: {{provider_email}}, {{provider_address}}. This Privacy Agreement is governed by the laws of the State of California and applicable US federal law, and forms part of the Finvry Terms of Service. You accept it electronically under ${US_ESIGN}.`

const PRIVACY_NG = `# Finvry Data Privacy Agreement (Nigeria)

This Data Privacy Agreement (the **"Privacy Agreement"**) is made on **{{effective_date}}** between **{{provider}}**, {{provider_address}} (**"Finvry"**, **"we"** or **"us"**), the data controller, and **{{client}}** (the **"Customer"**), accepted by **{{signer_name}}** ({{signer_email}}). It is made under the Nigeria Data Protection Act 2023 (**"NDPA"**) and the regulations and guidance of the Nigeria Data Protection Commission (**"NDPC"**).

## 1. Personal data we process

- **Account and contact data:** names, work emails, phone numbers, job titles and company details.
- **Customer Data:** financial figures, documents, investor lists, compliance records and other content you upload.
- **Service order data:** company, ownership, tax and filing information you give us for services you order, which may include identification numbers.
- **Billing data:** plan, invoices and payment status. Card details are handled by licensed payment processors and never stored by us.
- **Usage and device data:** sign-in times, IP address, browser, pages used and security logs.

## 2. Lawful bases and purposes

We process personal data (a) to perform our contract with you and deliver the services you order; (b) to comply with legal obligations, including tax and record-keeping; (c) for our legitimate interests in securing and improving Finvry, where those interests are not overridden by your rights; and (d) with your consent, for marketing, which you may withdraw at any time without affecting earlier processing.

## 3. Sharing

We share personal data only with (a) processors that host, process payments, deliver email, connect bank data or provide AI features for us, bound by written contracts requiring NDPA-standard protection; (b) government agencies and similar bodies when needed to deliver a service you ordered; (c) people you choose to share with, such as investors viewing your page; and (d) authorities when the law requires. We do not sell personal data, and we do not use Customer Data to train third-party AI models.

## 4. Cross-border transfers

Some processors operate outside Nigeria, including in the United States. We transfer personal data abroad only where the NDPA allows it — for example to a country with adequate protection, under appropriate contractual safeguards, or where necessary to perform our contract with you.

## 5. Retention

We keep personal data only as long as needed for the purposes above and to meet legal, tax and record-keeping obligations (generally up to six (6) years for financial and filing records). On account closure we delete or anonymise the rest within ninety (90) days.

## 6. Security and breach notification

We protect personal data with encryption in transit and at rest, access controls, two-step sign-in options, logging and staff confidentiality obligations. If a breach is likely to risk your rights and freedoms, we will notify the NDPC within seventy-two (72) hours of becoming aware of it and inform you without undue delay where required.

## 7. Your rights

Under the NDPA you may: be informed about our processing; access your personal data; have it corrected or erased; restrict or object to processing; receive it in a portable format; withdraw consent; and not be subject to decisions based solely on automated processing that significantly affect you. Send requests to {{provider_email}}. We respond within the time the NDPA and NDPC guidance require. You may also complain to the Nigeria Data Protection Commission.

## 8. Your role as a business customer

For personal data about your investors, employees or contacts that you upload, you are the data controller and we act as your processor: you are responsible for having a lawful basis to share it with us, and we process it only on your documented instructions, keep it confidential and secure, help you respond to data subject requests, and delete or return it when our services end.

## 9. Children

Finvry is for businesses and is not directed to children. We do not knowingly process children's personal data.

## 10. Changes, law and contact

We will give at least thirty (30) days' notice of material changes. This Privacy Agreement is governed by the laws of the Federal Republic of Nigeria and forms part of the Finvry Terms of Service. Questions or complaints: {{provider_email}}, {{provider_address}}. You accept it electronically under ${NG_ESIGN}.`

export const AGREEMENT_DEFAULTS: Record<AgreementCode, { title: string; body: string }> = {
  sla: { title: 'Service Level Agreement', body: SLA },
  terms_us: { title: 'Finvry Terms of Service', body: TERMS(false) },
  terms_ng: { title: 'Finvry Terms of Service (Nigeria)', body: TERMS(true) },
  privacy_us: { title: 'Finvry Data Privacy Agreement', body: PRIVACY_US },
  privacy_ng: { title: 'Finvry Data Privacy Agreement (Nigeria)', body: PRIVACY_NG }
}

export async function agreementTemplate(code: AgreementCode): Promise<{ code: AgreementCode; title: string; body: string; version: number; custom: boolean; updated_at: string | null }> {
  const r = (await asPlatform(() => db().query<{ title: string; body: string; version: number; updated_at: string }>('SELECT title, body, version, updated_at FROM legal.templates WHERE code = $1', [code]))).rows[0]
  return r ? { code, ...r, custom: true } : { code, ...AGREEMENT_DEFAULTS[code], version: 1, custom: false, updated_at: null }
}
export async function saveAgreementTemplate(code: AgreementCode, title: string, body: string, userId: string): Promise<number> {
  const cur = await agreementTemplate(code)
  const v = cur.version + 1
  await asPlatform(() => db().query('INSERT INTO legal.templates (code, title, body, version, updated_at, updated_by) VALUES ($1,$2,$3,$4,now(),$5) ON CONFLICT (code) DO UPDATE SET title = $2, body = $3, version = $4, updated_at = now(), updated_by = $5', [code, title, body, v, userId]))
  return v
}
export async function resetAgreementTemplate(code: AgreementCode, userId: string): Promise<void> { await saveAgreementTemplate(code, AGREEMENT_DEFAULTS[code].title, AGREEMENT_DEFAULTS[code].body, userId) }

export const fillAgreement = (text: string, vars: Record<string, string>): string => text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k]! : m))

// Who provides the service: the issuer on the services team's invoices (US or Nigeria).
export async function agreementProvider(ng: boolean): Promise<{ provider: string; provider_address: string; provider_email: string }> {
  const op = await operatorOrgId()
  const s = (await asPlatform(() => db().query<{ name: string; b: Record<string, { issuer?: string; address?: string; email?: string }> | null }>("SELECT name, settings->'cs_billing' AS b FROM core.organizations WHERE id = $1", [op]))).rows[0]
  const r = (ng ? s?.b?.ng : s?.b?.us) ?? {}
  return { provider: r.issuer || 'Aidi Ventures LLC (Finvry)', provider_address: (r.address || 'San Jose, California, United States').replace(/\s*\n\s*/g, ', '), provider_email: r.email || 'hello@finvry.com' }
}

const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// The SLA text for a client's order (or an existing job): services with prices from the price list, governed by the
// client's law. Rendered on the server so what is signed is always our own wording.
export async function slaText(input: { clientId: string; codes: string[]; company?: string | null; notes?: string; effective?: string; signer: { name: string; email: string }; voTerm?: 'monthly' | 'annual'; scope?: string }): Promise<{ title: string; md: string; version: number; ng: boolean }> {
  const ng = await clientIsNigerian(input.clientId)
  const t = await agreementTemplate('sla')
  const c = (await db().query<{ name: string }>('SELECT name FROM services.clients WHERE id = $1', [input.clientId])).rows[0]
  const items = input.codes.length ? (await db().query<{ code: string; name: string; price: string | null; price_ngn: string | null; currency: string; billing: string }>('SELECT code, name, price::text, price_ngn::text, currency, billing FROM services.catalog WHERE code = ANY($1)', [input.codes])).rows : []
  const sym = (cur: string) => (cur === 'NGN' ? 'NGN ' : cur === 'USD' ? '$' : cur + ' ')
  let total = 0, cur = 'USD'
  const rows = items.map((i) => {
    const p = priceFor(i, ng); cur = p.currency
    if (p.price == null || i.billing === 'quoted') return '| ' + i.name + ' | Quoted after review | — |'
    const now = i.code === 'virtual_office' ? (input.voTerm === 'annual' ? 12 : 1) * p.price : (i.billing === 'monthly' ? 12 : 1) * p.price
    total += now
    return '| ' + i.name + ' | ' + sym(p.currency) + p.price.toLocaleString('en-US') + ' | ' + (i.billing === 'monthly' ? 'Monthly, renews automatically' : i.billing === 'annual' ? 'Yearly, renews automatically' : 'One-off') + ' |'
  })
  const services = (rows.length ? ['| Service | Price | Billing |', '|---|---|---|', ...rows].join('\n') : '') + (input.scope ? (rows.length ? '\n\n' : '') + input.scope : '')
  const vars = { ...(await agreementProvider(ng)), ...lawFor(ng), client: c?.name ?? 'the Client', company: input.company || c?.name || 'the Client', signer_name: input.signer.name, signer_email: input.signer.email,
    effective_date: fmtDay(input.effective ?? new Date().toISOString().slice(0, 10)), services: services || 'As described in the order.', total: total ? sym(cur) + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' (plus tax where it applies; quoted items invoiced separately)' : 'Quoted after review', notes: input.notes?.trim() || 'None.' }
  return { title: t.title, md: fillAgreement(t.body, vars), version: t.version, ng }
}

// Terms of Service and Data Privacy Agreement for a sign-up, by country.
export async function signupAgreements(input: { ng: boolean; company: string; signer: { name: string; email: string } }): Promise<{ code: AgreementCode; title: string; md: string; version: number }[]> {
  const vars = { ...(await agreementProvider(input.ng)), client: input.company, signer_name: input.signer.name, signer_email: input.signer.email, effective_date: fmtDay(new Date().toISOString().slice(0, 10)) }
  const out = []
  for (const code of (input.ng ? ['terms_ng', 'privacy_ng'] : ['terms_us', 'privacy_us']) as AgreementCode[]) { const t = await agreementTemplate(code); out.push({ code, title: t.title, md: fillAgreement(t.body, vars), version: t.version }) }
  return out
}

// A typed name becomes a signature image on the client; drawn and uploaded signatures arrive as PNG too.
export function checkSignaturePng(png: string | null | undefined, required: boolean): string | null {
  if (!png) { if (required) throw apiError('invalid', 'Add your signature: type, draw or upload it.'); return null }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(png)
  if (!m || m[1]!.length > 600_000) throw apiError('invalid', 'The signature image could not be read. Try drawing or typing it instead.')
  return png
}

// The signed PDF: the agreement, then a signature certificate (who, when, how, IP, device, fingerprint).
export async function signedAgreementPdf(input: { title: string; md: string; company: string; signer: { name: string; email: string }; kind: string; png: string | null; signedAt: Date; effective: string; ip: string; ua: string; extra?: { title: string; md: string }[] }): Promise<{ bytes: Uint8Array; sha256: string }> {
  const base = await legalPdf(input.company, [{ title: input.title, md: input.md }, ...(input.extra ?? [])])
  const hash = createHash('sha256').update(base).digest('hex')
  const pdf = await PDFDocument.load(base), reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const p = pdf.addPage([612, 792]), ink = rgb(0.1, 0.1, 0.12), clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '')
  p.drawText('Electronic signature certificate', { x: 72, y: 700, size: 18, font: bold, color: rgb(0.05, 0.1, 0.18) })
  const rows: [string, string][] = [['Document', clean(input.title).slice(0, 70)], ['Effective date', input.effective], ['Signed by', clean(input.signer.name)], ['Email', clean(input.signer.email)], ['Signature method', input.kind === 'typed' ? 'Typed name' : input.kind === 'drawn' ? 'Drawn signature' : input.kind === 'uploaded' ? 'Uploaded signature image' : 'Accepted electronically'], ['Signed at', input.signedAt.toUTCString()], ['IP address', clean(input.ip)], ['Device', clean(input.ua).slice(0, 80)], ['Document fingerprint (SHA-256)', hash.slice(0, 32)], ['', hash.slice(32)]]
  let y = 660; for (const [k, v] of rows) { if (k) p.drawText(k, { x: 72, y, size: 9, font: bold, color: ink }); p.drawText(v, { x: 250, y, size: 9, font: reg, color: ink }); y -= 18 }
  if (input.png) {
    const m = /^data:image\/png;base64,(.+)$/.exec(input.png)
    if (m) { const sig = await pdf.embedPng(Buffer.from(m[1]!, 'base64')); const h = Math.min(90, 220 * (sig.height / sig.width)), w = h * (sig.width / sig.height); p.drawText('Signature', { x: 72, y: y - 20, size: 9, font: bold, color: ink }); p.drawImage(sig, { x: 250, y: y - 20 - h + 10, width: w, height: h }) }
  }
  p.drawText('The signer agreed to sign this document electronically and that this signature is as binding as a handwritten one.', { x: 72, y: 120, size: 8, font: reg, color: rgb(0.4, 0.4, 0.4) })
  return { bytes: await pdf.save(), sha256: hash }
}

// Store a signed agreement: the PDF, a document (on the job for an SLA, in the workspace's Documents for sign-up
// agreements), and the signature row (new, or completing a pending one sent by the team).
export async function storeSignedAgreement(input: { id?: string; code: string; version: number; title: string; md: string; company: string; effective: string; signer: { name: string; email: string }; kind: 'typed' | 'drawn' | 'uploaded' | 'accepted'; png: string | null; ip: string; ua: string; orgId?: string | null; userId?: string | null; clientId?: string | null; jobId?: string | null; createdBy?: string | null; extra?: { title: string; md: string }[]; filename: string }): Promise<{ id: string; pdf: Uint8Array; document_id: string }> {
  const signedAt = new Date()
  const { bytes, sha256 } = await signedAgreementPdf({ title: input.title, md: input.md, company: input.company, signer: input.signer, kind: input.kind, png: input.png, signedAt, effective: input.effective, ip: input.ip, ua: input.ua, extra: input.extra })
  const id = input.id ?? randomUUID(), key = 'agreements/' + id + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  const docId = randomUUID(), title = input.filename.replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200)
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  if (input.jobId) {
    // Job agreements live with the services desk (the job page, and the client's Documents under Finvry services).
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, area) VALUES ($1,$2,'other','normal',$3,'application/pdf',$4,$5,'services')", [docId, title, key, bytes.length, fileHash])
    await db().query("INSERT INTO services.job_events (job_id, kind, body, document_id, visible_to_client) VALUES ($1, 'document', $2, $3, true)", [input.jobId, input.title + ' signed by ' + input.signer.name + '.', docId])
  } else if (input.orgId) {
    const prev = currentOrgId(); setOrgContext(input.orgId)
    try { await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,'application/pdf',$4,$5)", [docId, title, key, bytes.length, fileHash]) } finally { setOrgContext(prev) }
  }
  const vals = [input.code, input.version, input.title, input.md, input.effective, input.orgId ?? null, input.userId ?? null, input.clientId ?? null, input.jobId ?? null, input.signer.name, input.signer.email, input.kind, input.png, signedAt.toISOString(), input.ip.slice(0, 100), input.ua.slice(0, 300), sha256, key, docId, input.createdBy ?? null]
  if (input.id) await asPlatform(() => db().query("UPDATE legal.signatures SET code = $2, version = $3, title = $4, body = $5, effective_date = $6, organization_id = coalesce($7, organization_id), user_id = coalesce($8, user_id), client_id = coalesce($9, client_id), job_id = coalesce($10, job_id), signer_name = $11, signer_email = $12, signature_kind = $13, signature_png = $14, signed_at = $15, ip = $16, user_agent = $17, sha256 = $18, pdf_key = $19, document_id = $20, status = 'signed' WHERE id = $1", [id, ...vals.slice(0, 19)]))
  else await asPlatform(() => db().query("INSERT INTO legal.signatures (id, code, version, title, body, effective_date, organization_id, user_id, client_id, job_id, signer_name, signer_email, signature_kind, signature_png, signed_at, ip, user_agent, sha256, pdf_key, document_id, created_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'signed')", [id, ...vals]))
  return { id, pdf: bytes, document_id: docId }
}

// Email the signed copy to the signer and to the services team.
export async function emailSignedCopy(input: { to: string; title: string; who: string; company: string; files: { filename: string; content: Uint8Array }[]; link?: string; teamLink?: string }): Promise<void> {
  try { await sendAgreementCopy({ to: input.to, title: input.title, who: input.who, company: input.company, files: input.files, link: input.link, team: false }) } catch (e) { console.error('[agreements] client copy', e) }
  try {
    const prev = currentOrgId(); setOrgContext(await operatorOrgId())
    try { for (const a of await orgNotifyEmails()) await sendAgreementCopy({ to: a, title: input.title, who: input.who, company: input.company, files: input.files, link: input.teamLink, team: true }) } finally { setOrgContext(prev) }
  } catch (e) { console.error('[agreements] team copy', e) }
}

export const SignBody = z.object({ name: z.string().trim().min(2).max(200), kind: z.enum(['typed', 'drawn', 'uploaded']), png: z.string().max(700000), agree: z.literal(true) })
export type SignInput = z.infer<typeof SignBody>
const fname = (title: string, who: string, day: string) => title + ' - ' + who + ' - ' + day + '.pdf'

// Sign a job's SLA: either a pending one the team sent (its stored text is what is signed) or a new one for an order.
export async function signJobAgreement(input: { clientId: string; jobId: string; pendingId?: string; codes?: string[]; company?: string | null; notes?: string; voTerm?: 'monthly' | 'annual'; signer: { name: string; email: string }; sig: SignInput; ip: string; ua: string; userId?: string | null; portalLink?: string }): Promise<string> {
  const png = checkSignaturePng(input.sig.png, true)
  let doc: { title: string; md: string; version: number; effective: string; code: string }
  if (input.pendingId) {
    const r = (await asPlatform(() => db().query<{ title: string; body: string; version: number; effective: string; code: string; status: string }>("SELECT title, body, version, to_char(effective_date, 'YYYY-MM-DD') AS effective, code, status FROM legal.signatures WHERE id = $1 AND client_id = $2 AND job_id = $3", [input.pendingId, input.clientId, input.jobId]))).rows[0]
    if (!r) throw apiError('not_found', 'Agreement not found.', 404)
    if (r.status !== 'pending') throw apiError('state', 'This agreement is already signed.', 409)
    // The signer's name as signed goes into the text (the team sent it addressed to the contact).
    doc = { title: r.title, md: fillAgreement(r.body, { signer_name: input.sig.name, signer_email: input.signer.email }), version: r.version, effective: r.effective, code: r.code }
  } else {
    const t = await slaText({ clientId: input.clientId, codes: input.codes ?? [], company: input.company, notes: input.notes, voTerm: input.voTerm, signer: { name: input.sig.name, email: input.signer.email } })
    doc = { title: t.title, md: t.md, version: t.version, effective: new Date().toISOString().slice(0, 10), code: 'sla' }
  }
  const c = (await db().query<{ name: string; email: string }>('SELECT name, email FROM services.clients WHERE id = $1', [input.clientId])).rows[0]!
  const filename = fname(doc.title, c.name, doc.effective)
  const r = await storeSignedAgreement({ id: input.pendingId, code: doc.code, version: doc.version, title: doc.title, md: doc.md, company: c.name, effective: doc.effective, signer: { name: input.sig.name, email: input.signer.email }, kind: input.sig.kind, png, ip: input.ip, ua: input.ua, clientId: input.clientId, jobId: input.jobId, userId: input.userId ?? null, filename })
  await emailSignedCopy({ to: input.signer.email, title: doc.title, who: input.sig.name, company: c.name, files: [{ filename, content: r.pdf }], link: input.portalLink, teamLink: brands().aidi.url + '/services/' + input.jobId })
  return r.id
}

// Sign-up: Terms of Service and Data Privacy Agreement, signed together; copies in the workspace's Documents.
export async function signSignupAgreements(input: { orgId: string; userId?: string | null; ng: boolean; company: string; signer: { name: string; email: string }; sig: SignInput; ip: string; ua: string }): Promise<void> {
  const png = checkSignaturePng(input.sig.png, true)
  const docs = await signupAgreements({ ng: input.ng, company: input.company, signer: input.signer })
  const day = new Date().toISOString().slice(0, 10), files: { filename: string; content: Uint8Array }[] = []
  for (const d of docs) {
    const filename = fname(d.title, input.company, day)
    const r = await storeSignedAgreement({ code: d.code, version: d.version, title: d.title, md: d.md, company: input.company, effective: day, signer: input.signer, kind: input.sig.kind, png, ip: input.ip, ua: input.ua, orgId: input.orgId, userId: input.userId ?? null, filename })
    files.push({ filename, content: r.pdf })
  }
  await emailSignedCopy({ to: input.signer.email, title: 'Terms of Service and Data Privacy Agreement', who: input.signer.name, company: input.company, files, link: brands().finvry.url + '/documents', teamLink: brands().aidi.url + '/platform/customers/' + input.orgId })
}
