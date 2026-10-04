// The annual US filing questionnaire sent to clients. {Y} is the tax year chosen on the request.
export interface Q { id: string; label: string; type: 'text' | 'textarea' | 'select' | 'yesno' | 'money' | 'file' | 'shareholders' | 'accounts'; section: string; help?: string; required?: boolean; options?: string[]; detail?: string; detailWhen?: 'yes' | 'no' }
export const TAX_QUESTIONS: Q[] = [
  { section: 'Company', id: 'company_name', label: 'US company registered name', type: 'text', required: true },
  { section: 'Company', id: 'entity_type', label: 'Type of company', type: 'select', options: ['C-Corp (Inc)', 'LLC with one owner', 'LLC with several owners', 'S-Corp'], required: true },
  { section: 'Company', id: 'state_date', label: 'State and date of incorporation', type: 'text', help: 'e.g. Delaware, 14 March 2022' },
  { section: 'Company', id: 'fiscal_year_end', label: 'Fiscal year end', type: 'text', help: 'Usually 31 December' },
  { section: 'Company', id: 'address', label: 'US company official address', type: 'textarea', required: true },
  { section: 'Company', id: 'ein', label: 'Company EIN', type: 'text', required: true, help: 'Nine digits, e.g. 12-3456789' },
  { section: 'Company', id: 'business_activity', label: 'What the company does', type: 'textarea' },
  { section: 'Company', id: 'foreign_subsidiary', label: 'Does the company have a foreign subsidiary?', type: 'yesno', required: true, detail: 'Name and country of each subsidiary', detailWhen: 'yes' },
  { section: 'Ownership', id: 'shareholders', label: 'Major shareholders (25% or more)', type: 'shareholders', required: true, help: 'Name, official address, contact, country of citizenship and tax residence, ownership %, and foreign tax ID if not a US person' },
  { section: 'Financials', id: 'prior_returns', label: 'Previous year tax returns', type: 'file' },
  { section: 'Financials', id: 'financials', label: 'Profit and loss statement and balance sheet for {Y}', type: 'file', required: true },
  { section: 'Financials', id: 'bank_statements', label: 'Bank statements for {Y}', type: 'file' },
  { section: 'Financials', id: 'bank_accounts', label: 'Company bank accounts and highest balance in {Y}', type: 'accounts', required: true },
  { section: 'Financials', id: 'gross_receipts', label: 'Total revenue (gross receipts) in {Y}', type: 'money' },
  { section: 'Financials', id: 'ga_breakdown', label: 'Breakdown of general and administrative expenses', type: 'textarea', help: 'e.g. salaries, rent, software and subscriptions, legal and professional fees, travel, marketing, bank fees. You can upload a breakdown below instead.' },
  { section: 'Financials', id: 'ga_file', label: 'G&A breakdown (optional upload)', type: 'file' },
  { section: 'Financials', id: 'software_dev', label: 'Software development costs in {Y}', type: 'money', help: 'Salaries and contractors building your software. Relevant to section 174 and the R&D credit.' },
  { section: 'Financials', id: 'fixed_assets', label: 'Fixed assets bought in {Y}', type: 'textarea', help: 'Equipment, computers and similar, with cost and date' },
  { section: 'Financials', id: 'contractors', label: 'Contractors paid $600 or more in {Y}', type: 'textarea', help: 'Name, amount and whether US or foreign (US contractors need a 1099-NEC)' },
  { section: 'Financials', id: 'payroll', label: 'Did the company run payroll in {Y}?', type: 'yesno', detail: 'Number of employees and the states they work in', detailWhen: 'yes' },
  { section: 'Related parties', id: 'foreign_payments', label: 'In {Y}, were there payments between a foreign shareholder owning 25% or more (or any non-US affiliate of that shareholder) and the US company?', type: 'yesno', required: true, detail: 'For each: who, what for, and the amount', detailWhen: 'yes' },
  { section: 'Related parties', id: 'capital_loans', label: 'Capital contributions and shareholder loans in {Y}', type: 'textarea', help: 'Amounts and dates of money put into the company or lent to or by shareholders' },
  { section: 'Related parties', id: 'nigeria_fx', label: 'Exchange rate used for {Y} (NGN per USD), if the company has a Nigerian subsidiary', type: 'text' },
  { section: 'Related parties', id: 'nigeria_confirm', label: 'Confirm that in {Y} there were no loans, service payments, royalty or licence payments between the US corporation and its Nigerian LLC or directors', type: 'yesno', detail: 'Please describe those payments', detailWhen: 'no', help: 'Answer Yes to confirm there were none. Not applicable? Answer Yes.' },
  { section: 'Other', id: 'states', label: 'Other US states where the company operates, has employees or sells', type: 'textarea' },
  { section: 'Other', id: 'foreign_accounts', label: 'Did the company hold bank accounts outside the US with a combined balance over $10,000 at any time in {Y}?', type: 'yesno', detail: 'Bank, country and highest balance', detailWhen: 'yes' },
  { section: 'Other', id: 'estimated_tax', label: 'Estimated tax payments made for {Y}', type: 'money' },
  { section: 'Other', id: 'losses', label: 'Losses carried forward from earlier years, if known', type: 'textarea' },
  { section: 'Other', id: 'rd_credit', label: 'Would you like us to look at the R&D tax credit?', type: 'yesno' },
  { section: 'Other', id: 'signer', label: 'Signing officer: name and title', type: 'text', required: true },
  { section: 'Other', id: 'contact', label: 'Best contact for questions (name, email, phone)', type: 'text' },
  { section: 'Other', id: 'other', label: 'Anything else we should know', type: 'textarea' },
  { section: 'Other', id: 'other_files', label: 'Other documents', type: 'file' }
]
export const taxQuestions = (year: number) => TAX_QUESTIONS.map((q) => ({ ...q, label: q.label.replaceAll('{Y}', String(year)), help: q.help?.replaceAll('{Y}', String(year)) }))
export const FILE_FIELDS = TAX_QUESTIONS.filter((q) => q.type === 'file').map((q) => q.id)

export async function issueInfoLink(requestId: string): Promise<string> {
  const token = randomToken()
  await db().query("UPDATE services.info_requests SET token_hash = $2, expires_at = now() + interval '120 days' WHERE id = $1", [requestId, sha256(token)])
  return (await appUrl()) + '/info/' + token
}
export interface InfoReq { id: string; organization_id: string; client_id: string; company_id: string | null; job_id: string | null; tax_year: number; status: string; answers: Record<string, unknown>; client: string; company: string | null; expired: boolean; created_by: string | null }
export async function infoFromToken(token: string | undefined): Promise<InfoReq> {
  if (!token || !/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw apiError('invalid_link', 'This link is not valid.', 404)
  const r = await asPlatform(() => db().query<InfoReq>(
    `SELECT r.id, r.organization_id, r.client_id, r.company_id, r.job_id, r.tax_year, r.status, r.answers, c.name AS client, co.name AS company, (r.expires_at < now()) AS expired, r.created_by
       FROM services.info_requests r JOIN services.clients c ON c.id = r.client_id LEFT JOIN services.companies co ON co.id = r.company_id WHERE r.token_hash = $1`, [sha256(token)]))
  const row = r.rows[0]
  if (!row || row.status === 'cancelled') throw apiError('invalid_link', 'This link is not valid.', 404)
  if (row.expired) throw apiError('expired', 'This link has expired. Ask us for a new one.', 410)
  setOrgContext(row.organization_id)
  if (!(await enabledModules()).has('services')) throw apiError('invalid_link', 'This link is not valid.', 404)
  return row
}

// Copy what the client told us onto the company and its people.
export async function syncTaxAnswers(req: InfoReq): Promise<void> {
  const a = req.answers as Record<string, any>
  if (req.company_id) {
    const ein = typeof a.ein === 'string' && /^[0-9]{2}-?[0-9]{7}$/.test(a.ein.trim()) ? a.ein.trim() : null
    await db().query(`UPDATE services.companies SET name = coalesce(nullif($2, ''), name), address = coalesce(nullif($3, ''), address), ein = coalesce($4, ein), fiscal_year_end = coalesce(nullif($5, ''), fiscal_year_end) WHERE id = $1`,
      [req.company_id, String(a.company_name ?? '').slice(0, 200), String(a.address ?? '').slice(0, 500), ein, String(a.fiscal_year_end ?? '').slice(0, 10)])
  }
  for (const s of (Array.isArray(a.shareholders) ? a.shareholders : []).slice(0, 20)) {
    const name = String(s?.name ?? '').trim().slice(0, 200)
    if (!name) continue
    const pct = Number(s.ownership); const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.contact ?? '').trim()) ? String(s.contact).trim().toLowerCase() : null
    const exists = await db().query('SELECT id FROM services.people WHERE client_id = $1 AND lower(name) = lower($2)', [req.client_id, name])
    if (exists.rows[0]) await db().query('UPDATE services.people SET role = $2, ownership_pct = $3, address = coalesce(nullif($4, \'\'), address), nationality = coalesce(nullif($5, \'\'), nationality) WHERE id = $1', [(exists.rows[0] as { id: string }).id, 'owner', pct >= 0 && pct <= 100 ? pct : null, String(s.address ?? '').slice(0, 500), String(s.country ?? '').slice(0, 100)])
    else await db().query('INSERT INTO services.people (client_id, company_id, name, email, role, ownership_pct, address, nationality) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [req.client_id, req.company_id, name, email, 'owner', pct >= 0 && pct <= 100 ? pct : null, String(s.address ?? '').slice(0, 500) || null, String(s.country ?? '').slice(0, 100) || null])
  }
}
