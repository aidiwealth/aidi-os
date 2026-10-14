// Cap table import: founders drop whatever they have (the lawyer's cap table or pro forma spreadsheet, SAFE and note
// PDFs, share certificates, board consents, option grant letters, term sheets) and AI reads them all together into one
// proposed cap table. Nothing is saved until the founder has checked it.
import { z } from 'zod'

export interface InFile { name: string; data: Buffer }
const MAX_FILES = 10, MAX_PDF = 6, MAX_BYTES = 20 * 1024 * 1024, MAX_TEXT = 45000

async function docxText(buf: Buffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim()
}

// Turn the uploads into message content: PDFs go in as documents (the model reads tables and signatures), sheets and
// Word files as text.
export async function filesToContent(files: InFile[]): Promise<unknown[]> {
  if (!files.length) throw apiError('invalid', 'Add at least one file.')
  if (files.length > MAX_FILES) throw apiError('invalid', 'Up to ' + MAX_FILES + ' files at a time.')
  const out: unknown[] = []; let pdfs = 0, text = 0
  for (const f of files) {
    if (f.data.length > MAX_BYTES) throw apiError('too_large', f.name + ' is over 20 MB.')
    const ext = (f.name.split('.').pop() ?? '').toLowerCase()
    if (ext === 'pdf' || f.data.subarray(0, 5).toString() === '%PDF-') {
      if (++pdfs > MAX_PDF) throw apiError('invalid', 'Up to ' + MAX_PDF + ' PDFs at a time. Add the rest in a second import.')
      out.push({ type: 'text', text: '=== File: ' + f.name + ' (PDF) ===' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data.toString('base64') } })
      continue
    }
    let body = ''
    if (ext === 'xlsx' || ext === 'xlsm') body = await sheetToText(f.data, 'xlsx', 6, 400)
    else if (ext === 'csv') body = await sheetToText(f.data, 'csv', 6, 400)
    else if (ext === 'docx') body = await docxText(f.data)
    else if (ext === 'txt' || ext === 'md') body = f.data.toString('utf8')
    else throw apiError('bad_type', f.name + ': use PDF, Excel (.xlsx), CSV or Word (.docx) files.')
    body = body.slice(0, Math.max(0, MAX_TEXT - text)); text += body.length
    out.push({ type: 'text', text: '=== File: ' + f.name + ' ===\n' + (body || '(empty)') })
  }
  return out
}

const s = (d: string) => ({ type: 'string', description: d }), sn = (d: string) => ({ type: ['string', 'null'], description: d }), nn = (d: string) => ({ type: ['number', 'null'], description: d })
const DATE = 'YYYY-MM-DD, or null if the documents do not say.'
const SRC = s('File name this came from (and sheet or page if useful).')
const KINDS = { type: 'string', enum: ['founder', 'employee', 'advisor', 'investor', 'other'] }
const SCHEMA = { type: 'object', additionalProperties: false, required: ['as_of', 'currency', 'classes', 'holders', 'issuances', 'plans', 'grants', 'convertibles', 'stated', 'notes'],
  properties: {
    as_of: sn('Date the cap table is as of (the latest date in the documents), ' + DATE),
    currency: s('ISO currency of prices and amounts, usually USD.'),
    classes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'kind', 'liq_pref', 'participating', 'seniority', 'issue_price', 'source'], properties: {
      name: s('Class or series name exactly as in the documents, e.g. "Common", "Series Seed Preferred". Do not invent classes.'), kind: { type: 'string', enum: ['common', 'preferred'] },
      liq_pref: { type: 'number', description: 'Liquidation preference multiple (1 for 1x). 0 for common.' }, participating: { type: 'boolean' },
      seniority: { type: 'integer', description: '0 for common; higher = paid earlier. Equal numbers = pari passu.' }, issue_price: nn('Original issue price per share.'), source: SRC } } },
    holders: { type: 'array', description: 'Every person or entity that holds shares, options or a SAFE/note. One entry per holder; merge spelling variants of the same name.', items: { type: 'object', additionalProperties: false, required: ['name', 'email', 'kind'], properties: { name: s('Full legal name as in the documents.'), email: sn('Only if written in the documents.'), kind: KINDS } } },
    issuances: { type: 'array', description: 'Issued and outstanding shares (not options, not unconverted SAFEs). One row per issuance/certificate if known, otherwise one row per holder and class.', items: { type: 'object', additionalProperties: false, required: ['holder', 'class', 'shares', 'price', 'issued_on', 'certificate', 'source'], properties: {
      holder: s('Holder name, exactly as in holders.'), class: s('Class name, exactly as in classes.'), shares: { type: 'integer' }, price: nn('Price paid per share.'), issued_on: sn(DATE), certificate: sn('Certificate number, e.g. CS-1.'), source: SRC } } },
    plans: { type: 'array', description: 'Option / equity incentive pools.', items: { type: 'object', additionalProperties: false, required: ['name', 'reserved', 'source'], properties: { name: s('e.g. "2024 Equity Incentive Plan".'), reserved: { type: 'integer', description: 'Total shares reserved under the plan (granted + available).' }, source: SRC } } },
    grants: { type: 'array', description: 'Options, RSUs or restricted stock granted from a plan.', items: { type: 'object', additionalProperties: false, required: ['plan', 'holder', 'kind', 'shares', 'strike', 'granted_on', 'vest_start', 'vest_months', 'cliff_months', 'exercised', 'source'], properties: {
      plan: s('Plan name, exactly as in plans.'), holder: s('Holder name, exactly as in holders.'), kind: { type: 'string', enum: ['option', 'rsu', 'restricted'] }, shares: { type: 'integer' }, strike: nn('Exercise price per share.'),
      granted_on: sn(DATE), vest_start: sn(DATE), vest_months: { type: ['integer', 'null'], description: 'Total vesting months (48 for 4 years). Null if not stated.' }, cliff_months: { type: ['integer', 'null'], description: '12 for a 1-year cliff, 0 for none. Null if not stated.' },
      exercised: { type: 'integer', description: 'Shares already exercised, 0 if none stated.' }, source: SRC } } },
    convertibles: { type: 'array', description: 'SAFEs and convertible notes not yet converted.', items: { type: 'object', additionalProperties: false, required: ['holder', 'kind', 'amount', 'valuation_cap', 'discount_pct', 'post_money', 'mfn', 'interest_pct', 'issued_on', 'maturity_on', 'source'], properties: {
      holder: s('Investor name, exactly as in holders.'), kind: { type: 'string', enum: ['safe', 'note'] }, amount: { type: 'number', description: 'Purchase amount / principal.' },
      valuation_cap: nn('Valuation cap.'), discount_pct: nn('Discount as a percentage, e.g. 20 (a "discount rate of 80%" means 20).'), post_money: { type: 'boolean', description: 'True for a post-money SAFE (YC standard since 2018), false for pre-money SAFEs and notes.' },
      mfn: { type: 'boolean' }, interest_pct: nn('Note interest rate per year, %.'), issued_on: sn(DATE), maturity_on: sn(DATE), source: SRC } } },
    stated: { type: 'object', additionalProperties: false, required: ['issued', 'fully_diluted', 'pool_available'], description: 'Totals as printed in the documents, to cross-check. Null when not printed.', properties: { issued: nn('Total issued and outstanding shares.'), fully_diluted: nn('Total fully diluted shares.'), pool_available: nn('Options still available to grant.') } },
    notes: { type: 'array', items: { type: 'string' }, description: 'Short plain-English notes for the founder: conflicts between files (which one you followed and why), anything assumed, missing pieces (e.g. "No vesting schedule found for Ade\'s options; assumed none"). Max 10.' } } }

const d8 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null)
const nm = z.string().trim().min(1).max(200), num = z.number().finite().nullable()
const holderKind = z.enum(['founder', 'employee', 'advisor', 'investor', 'other']).catch('other')
const src = z.string().max(200).catch('')
export const ProposalSchema = z.object({
  as_of: d8, currency: z.string().regex(/^[A-Z]{3}$/).catch('USD'),
  classes: z.array(z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(['common', 'preferred']), liq_pref: z.number().min(0).max(10).catch(1), participating: z.boolean().catch(false), seniority: z.number().int().min(0).max(20).catch(0), issue_price: num.catch(null), source: src })).max(30),
  holders: z.array(z.object({ name: nm, email: z.string().max(254).nullable().catch(null), kind: holderKind })).max(1000),
  issuances: z.array(z.object({ holder: nm, class: nm, shares: z.number().int().positive(), price: num.catch(null), issued_on: d8, certificate: z.string().max(60).nullable().catch(null), source: src })).max(2000),
  plans: z.array(z.object({ name: nm, reserved: z.number().int().min(0), source: src })).max(20),
  grants: z.array(z.object({ plan: nm, holder: nm, kind: z.enum(['option', 'rsu', 'restricted']).catch('option'), shares: z.number().int().positive(), strike: num.catch(null), granted_on: d8, vest_start: d8, vest_months: z.number().int().min(0).max(120).nullable().catch(null), cliff_months: z.number().int().min(0).max(60).nullable().catch(null), exercised: z.number().int().min(0).catch(0), source: src })).max(2000),
  convertibles: z.array(z.object({ holder: nm, kind: z.enum(['safe', 'note']), amount: z.number().positive(), valuation_cap: num.catch(null), discount_pct: z.number().min(0).max(99).nullable().catch(null), post_money: z.boolean().catch(true), mfn: z.boolean().catch(false), interest_pct: z.number().min(0).max(100).nullable().catch(null), issued_on: d8, maturity_on: d8, source: src })).max(500),
  stated: z.object({ issued: num, fully_diluted: num, pool_available: num }).catch({ issued: null, fully_diluted: null, pool_available: null }),
  notes: z.array(z.string().max(500)).max(12).catch([]) })
export type Proposal = z.infer<typeof ProposalSchema>

export async function readCapDocs(files: InFile[], company: string, ref: string): Promise<Proposal> {
  const content = await filesToContent(files)
  const { output } = await runAiTool({ task: 'cap_table_import', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'cap-import-v1', inputRef: ref,
    system: 'You are an experienced startup lawyer\'s paralegal building a company\'s cap table from its documents: a lawyer\'s cap table or pro forma spreadsheet, SAFE and convertible note agreements, ' +
      'stock purchase agreements, share certificates, board consents, option grant notices, term sheets. Read every file together and record the CURRENT cap table, before any proposed round. ' +
      'Rules: take numbers only from the documents; never invent holders, classes or amounts. A pro forma\'s "post-closing" or "after round" columns describe a future round: use the "pre" or current columns. ' +
      'When a spreadsheet and a signed agreement disagree, prefer the signed agreement for terms (cap, discount, dates) and the latest-dated spreadsheet for share counts, and say so in notes. ' +
      'Do not count the same shares twice (a certificate and a spreadsheet row for the same issuance are one issuance). SAFEs that have already converted are shares, not SAFEs. ' +
      'Founder shares are common unless the documents say otherwise. Unallocated option pool goes in plans.reserved (granted + available), not as an issuance. Write full numbers (1.5M → 1500000). ' +
      'Use holder, class and plan names consistently so rows match. Notes are short and plain English, addressed to a founder.',
    user: '', userContent: [...content, { type: 'text', text: 'Build the current cap table for ' + company + ' from these files.' }],
    toolName: 'record_cap_table', toolDescription: 'Record the cap table found in the documents.', jsonSchema: SCHEMA, schema: ProposalSchema, maxTokens: 12000 })
  return tidy(output)
}

// Make the proposal consistent: every holder, class and plan a row refers to exists; there is a common class.
export function tidy(p: Proposal): Proposal {
  const key = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ')
  const hs = new Map(p.holders.map((h) => [key(h.name), h]))
  const need = (name: string, kind: Proposal['holders'][number]['kind']) => { if (!hs.has(key(name))) hs.set(key(name), { name, email: null, kind }) ; return hs.get(key(name))!.name }
  const cs = new Map(p.classes.map((c) => [key(c.name), c])), ps = new Map(p.plans.map((x) => [key(x.name), x]))
  const issuances = p.issuances.map((i) => { if (!cs.has(key(i.class))) cs.set(key(i.class), { name: i.class, kind: /pref|series/i.test(i.class) ? 'preferred' : 'common', liq_pref: /pref|series/i.test(i.class) ? 1 : 0, participating: false, seniority: /pref|series/i.test(i.class) ? 1 : 0, issue_price: null, source: i.source }); return { ...i, holder: need(i.holder, 'other'), class: cs.get(key(i.class))!.name } })
  const grants = p.grants.map((g) => { if (!ps.has(key(g.plan))) ps.set(key(g.plan), { name: g.plan, reserved: 0, source: g.source }); return { ...g, holder: need(g.holder, 'employee'), plan: ps.get(key(g.plan))!.name } })
  for (const pl of ps.values()) { const used = grants.filter((g) => key(g.plan) === key(pl.name)).reduce((s, g) => s + g.shares, 0); if (pl.reserved < used) pl.reserved = used }
  const convertibles = p.convertibles.map((c) => ({ ...c, holder: need(c.holder, 'investor') }))
  return { ...p, classes: [...cs.values()], holders: [...hs.values()], plans: [...ps.values()], issuances, grants, convertibles }
}

const MIME: Record<string, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/plain' }
// Keep the source files in the company's Documents so the lawyer's originals sit next to the cap table.
export async function keepFile(f: InFile, entityId: string | null): Promise<string> {
  const { createHash, randomUUID } = await import('node:crypto')
  const ext = (f.name.split('.').pop() ?? 'bin').toLowerCase(), id = randomUUID(), key = 'documents/' + id + '.' + ext, mime = MIME[ext] ?? 'application/octet-stream'
  await putObject({ key, body: f.data, contentType: mime })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,$5,$6,$7)",
    [id, entityId, ('Cap table source - ' + f.name).replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200), key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
  return id
}
