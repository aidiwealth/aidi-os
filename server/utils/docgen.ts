// Company documents drafted by AI from a short form and the company's details. Not legal advice.
export interface DocField { key: string; label: string; type?: 'text' | 'textarea' | 'date' | 'number' | 'select'; options?: string[]; placeholder?: string; required?: boolean }
export const DOC_TYPES: Record<string, { name: string; blurb: string; group: string; fields: DocField[] }> = {
  board_resolution: { name: 'Board resolution', blurb: 'A written consent of the board approving a decision.', group: 'Corporate', fields: [
    { key: 'decision', label: 'What is being approved?', type: 'textarea', placeholder: 'e.g. Issue of SAFEs up to $1,000,000 at an $8M post-money cap', required: true },
    { key: 'directors', label: 'Directors signing', placeholder: 'Full names, comma separated', required: true }, { key: 'date', label: 'Effective date', type: 'date', required: true }] },
  board_minutes: { name: 'Board meeting minutes', blurb: 'Minutes of a board meeting, from your notes.', group: 'Corporate', fields: [
    { key: 'date', label: 'Meeting date', type: 'date', required: true }, { key: 'attendees', label: 'Attendees', placeholder: 'Names and roles', required: true },
    { key: 'notes', label: 'Your notes', type: 'textarea', placeholder: 'Agenda items, discussion, decisions, action items', required: true }] },
  offer_letter: { name: 'Offer letter', blurb: 'Employment offer with role, pay and start date.', group: 'People', fields: [
    { key: 'candidate', label: 'Candidate name', required: true }, { key: 'role', label: 'Role', required: true }, { key: 'salary', label: 'Salary (with currency and period)', placeholder: 'e.g. ₦1,200,000 per month', required: true },
    { key: 'equity', label: 'Equity (optional)', placeholder: 'e.g. 0.5% options, 4-year vesting, 1-year cliff' }, { key: 'start', label: 'Start date', type: 'date', required: true },
    { key: 'location', label: 'Work location', placeholder: 'e.g. Remote / Lagos' }, { key: 'manager', label: 'Reports to' }] },
  mutual_nda: { name: 'Mutual NDA', blurb: 'Confidentiality agreement with another company or person.', group: 'Commercial', fields: [
    { key: 'party', label: 'Other party (name and address)', type: 'textarea', required: true }, { key: 'purpose', label: 'Purpose', placeholder: 'e.g. Evaluating a partnership', required: true },
    { key: 'term', label: 'Term', type: 'select', options: ['1 year', '2 years', '3 years', '5 years'] }] },
  consulting: { name: 'Consulting agreement', blurb: 'For consultants: scope, fees, IP and confidentiality.', group: 'People', fields: [
    { key: 'consultant', label: 'Consultant (name and address)', type: 'textarea', required: true }, { key: 'scope', label: 'Scope of work', type: 'textarea', required: true },
    { key: 'fees', label: 'Fees and payment terms', placeholder: 'e.g. $3,000 per month, paid monthly in arrears', required: true }, { key: 'start', label: 'Start date', type: 'date' }, { key: 'term', label: 'Length', placeholder: 'e.g. 6 months, then month to month' }] },
  advisor: { name: 'Advisor agreement', blurb: 'For startup advisors, with equity and time commitment.', group: 'People', fields: [
    { key: 'advisor', label: 'Advisor name', required: true }, { key: 'services', label: 'How they will help', type: 'textarea', required: true },
    { key: 'equity', label: 'Equity', placeholder: 'e.g. 0.25% options vesting monthly over 2 years', required: true }, { key: 'commitment', label: 'Time commitment', placeholder: 'e.g. One call a month' }] },
  contractor: { name: 'Independent contractor agreement', blurb: 'For freelancers and agencies.', group: 'People', fields: [
    { key: 'contractor', label: 'Contractor (name and address)', type: 'textarea', required: true }, { key: 'services', label: 'Services', type: 'textarea', required: true },
    { key: 'payment', label: 'Payment', placeholder: 'e.g. $40/hour, invoiced monthly', required: true }] },
  ip_assignment: { name: 'IP assignment (founder or employee)', blurb: 'Assigns inventions and IP to the company.', group: 'Corporate', fields: [
    { key: 'person', label: 'Person assigning', required: true }, { key: 'role', label: 'Role', type: 'select', options: ['Founder', 'Employee', 'Contractor'] },
    { key: 'prior', label: 'Prior inventions to exclude (optional)', type: 'textarea' }] } }
export async function draftDocument(type: string, answers: Record<string, string>, company: { name: string; form: string; state: string; country: string; ref: string }) {
  const t = DOC_TYPES[type]!
  const { z } = await import('zod')
  const forms: Record<string, string> = { us_llc: 'a US limited liability company', us_corp: 'a Delaware-style US corporation', ng_ltd: 'a Nigerian private limited company', other: 'a company' }
  const lines = t.fields.map((f) => f.label + ': ' + (answers[f.key] || '(not given)')).join('\n')
  const { output } = await runAiTool({ task: 'docgen_' + type, model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'docgen-v1', inputRef: company.ref,
    system: 'You draft clear, practical company documents for startups. Write the complete ' + t.name + ' in plain English using standard, balanced terms appropriate to the governing law given. ' +
      'Use only the facts provided; where a needed detail is missing, insert a bracketed placeholder like [ADDRESS]. Do not invent names, numbers or dates. Include signature blocks with lines (a line of underscores) for each signing party, with name, title and date. ' +
      'Format in simple Markdown: # title, ## numbered section headings, short paragraphs, - bullets, no tables. Do not add commentary before or after the document.',
    user: 'Company: ' + company.name + ', ' + (forms[company.form] ?? 'a company') + (company.state ? ' (' + company.state + ')' : '') + ', based in ' + (company.country || 'not stated') + '.\nGoverning law: ' + (company.form === 'ng_ltd' ? 'Federal Republic of Nigeria' : company.state && company.state !== 'Other US state' ? 'State of ' + company.state + ', USA' : company.country || 'as appropriate') + '.\nDocument: ' + t.name + '\n' + lines,
    toolName: 'write_document', toolDescription: 'Return the document.', jsonSchema: { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' } } },
    schema: z.object({ title: z.string().max(200), body: z.string().max(60000) }), maxTokens: 4000 })
  return output
}
