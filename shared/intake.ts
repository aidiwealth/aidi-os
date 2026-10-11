// Filing information forms (from the incorporation and tax/business filing questionnaires).
export interface IntakeField { key: string; label: string; type: 'text' | 'textarea' | 'choice' | 'multi' | 'file' | 'files' | 'secret'; options?: string[]; required?: boolean; help?: string; showIf?: [string, string]; hideIf?: [string, string] }
// Tax years a client can file for: last year first, then earlier years (catch-up filings) and the current year.
const Y = new Date().getUTCFullYear()
export const TAX_YEARS = [Y - 1, Y - 2, Y - 3, Y - 4, Y - 5, Y].map(String)
export const NO_TRANSACTIONS = 'No transactions in that year'
// Whether a question applies, given the answers so far.
export function fieldVisible(f: IntakeField, a: Record<string, unknown>): boolean {
  if (f.showIf && a[f.showIf[0]] !== f.showIf[1]) return false
  if (f.hideIf && a[f.hideIf[0]] === f.hideIf[1]) return false
  return true
}
export const INTAKE_FORMS: Record<'incorporation' | 'filing', { title: string; intro: string; fields: IntakeField[] }> = {
  incorporation: { title: 'Company formation details', intro: 'We need these details and documents to register your company.', fields: [
    { key: 'entity_type', label: 'What would you like to register?', type: 'choice', options: ['Limited Liability Company (LLC)', 'Corporation (C-Corp)', 'Other'], required: true },
    { key: 'entity_other', label: 'Tell us what you need', type: 'text', showIf: ['entity_type', 'Other'] },
    { key: 'us_person', label: 'Are you and your partners US citizens or tax-paying residents?', type: 'choice', options: ['Yes', 'No', 'Some of us'], required: true },
    { key: 'us_person_note', label: 'Which partners are US persons?', type: 'text', showIf: ['us_person', 'Some of us'] },
    { key: 'ssn', label: 'Social Security Number (SSN)', type: 'secret', help: 'Only if you answered Yes. Stored encrypted and seen only by the filing team.', showIf: ['us_person', 'Yes'] },
    { key: 'owners', label: 'Names, roles and ownership of the owners', type: 'textarea', required: true, help: 'e.g. Ada Obi (CEO, 60%), Tunde Bello (CTO, 40%)' },
    { key: 'legal_name', label: 'Preferred legal name of your company', type: 'text', required: true },
    { key: 'contact', label: 'Preferred email address and phone number', type: 'text', required: true },
    { key: 'ids', label: "Government-issued ID for each owner", type: 'files', required: true, help: 'Passport or driver\'s licence. PDF or image.' },
    { key: 'address', label: 'Your most recent official address', type: 'textarea', required: true }] },
  filing: { title: 'Filing details', intro: 'We need these details and documents to prepare your filings.', fields: [
    { key: 'services', label: 'What do you need?', type: 'multi', options: ['Incorporate and flip to a US LLC or Corp', 'File annual state franchise tax', 'File annual IRS federal company income tax'], required: true },
    { key: 'name', label: 'Your name and the legal name of your company', type: 'text', required: true },
    { key: 'contact', label: 'Preferred email address and phone number', type: 'text', required: true },
    { key: 'website', label: 'Company website', type: 'text' },
    { key: 'equity', label: 'Most recent equity information for all founders', type: 'textarea', required: true, help: 'e.g. Ada Obi (CEO) 50%, Tunde Bello (CTO) 50%' },
    { key: 'tax_year', label: 'Which tax year are you filing for?', type: 'choice', options: TAX_YEARS, required: true },
    { key: 'no_transactions', label: 'Did the company have any transactions in that year?', type: 'choice', options: ['Yes, it had transactions', NO_TRANSACTIONS], required: true, help: 'No income and no expenses all year? Choose "No transactions" — we file a no-activity return, and no P&L or balance sheet is needed.' },
    { key: 'pnl', label: 'Profit and loss (P&L) statement', type: 'file', required: true, hideIf: ['no_transactions', NO_TRANSACTIONS] },
    { key: 'balance_sheet', label: 'Balance sheet', type: 'file', required: true, hideIf: ['no_transactions', NO_TRANSACTIONS] },
    { key: 'tax_returns', label: 'Previously filed tax returns', type: 'files', help: 'If you have filed before.' },
    { key: 'address', label: 'Most recent official address of each founder', type: 'textarea', required: true }] } }
// Which form a job needs, from the services ordered.
export function intakeKindFor(codes: string[], service?: string | null): 'incorporation' | 'filing' | null {
  if (codes.some((c) => ['irs_annual', 'de_franchise', 'ca_state', 'boi_report', 'annual_report'].includes(c))) return 'filing'
  if (codes.some((c) => c === 'llc_formation' || c === 'inc_formation') || service === 'company_formation') return 'incorporation'
  if (['annual_compliance', 'tax_filing'].includes(service ?? '')) return 'filing'
  return null
}
