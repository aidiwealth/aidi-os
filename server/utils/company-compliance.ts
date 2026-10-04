// Standard filing reminders for a company, by legal form and state. Dates are the usual statutory deadlines for a
// calendar-year company; founders can edit or remove any of them on the Compliance page.
export const ENTITY_TYPES = { us_llc: 'LLC (United States)', us_corp: 'C-Corp / Inc (United States)', ng_ltd: 'Limited company (Nigeria)', other: 'Other / not formed yet' } as const
export const US_STATES = ['Delaware', 'Wyoming', 'Other US state'] as const
type Item = { title: string; category: string; jurisdiction: string; recurrence: 'annual' | 'monthly'; month?: number; day: number; notes: string }

function next(month: number | undefined, day: number): string {
  const now = new Date(); const y = now.getUTCFullYear()
  if (month === undefined) { const d = new Date(Date.UTC(y, now.getUTCMonth() + (now.getUTCDate() >= day ? 1 : 0), day)); return d.toISOString().slice(0, 10) }
  let d = new Date(Date.UTC(y, month - 1, day)); if (d <= now) d = new Date(Date.UTC(y + 1, month - 1, day)); return d.toISOString().slice(0, 10)
}
export function standardFilings(type: string, state: string): Item[] {
  const out: Item[] = []
  if (type === 'us_llc' || type === 'us_corp') {
    if (type === 'us_corp') out.push({ title: 'Federal corporate tax return (Form 1120)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', month: 4, day: 15, notes: 'Attach Form 5472 if a foreign person owns 25% or more. Extension (Form 7004) moves it to 15 October.' })
    else out.push({ title: 'Federal tax return (Form 1065, or Form 5472 with pro forma 1120 if foreign-owned)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', month: 4, day: 15, notes: 'Multi-member LLCs file Form 1065 by 15 March. A single-member LLC owned by a foreign person files Form 5472 with a pro forma 1120 by 15 April.' })
    out.push({ title: 'Form 1099-NEC to US contractors paid $600 or more', category: 'tax', jurisdiction: 'US', recurrence: 'annual', month: 1, day: 31, notes: 'Send to contractors and file with the IRS.' })
    if (state === 'Delaware') out.push(type === 'us_corp'
      ? { title: 'Delaware franchise tax and annual report', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', month: 3, day: 1, notes: 'Use the assumed par value capital method to keep the tax low.' }
      : { title: 'Delaware LLC annual tax ($300)', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', month: 6, day: 1, notes: 'Flat $300 per year; no annual report needed.' })
    else if (state === 'Wyoming') out.push({ title: 'Wyoming annual report and licence tax', category: 'annual_return', jurisdiction: 'US-WY', recurrence: 'annual', month: new Date().getUTCMonth() + 1, day: 1, notes: 'Due on the first day of the month you were formed. Change the date to your formation month.' })
    else out.push({ title: 'State annual report', category: 'annual_return', jurisdiction: 'US', recurrence: 'annual', month: new Date().getUTCMonth() + 1, day: 1, notes: 'Check your state for the exact date and fee, then edit this reminder.' })
    out.push({ title: 'Registered agent renewal', category: 'registered_agent', jurisdiction: state === 'Delaware' ? 'US-DE' : state === 'Wyoming' ? 'US-WY' : 'US', recurrence: 'annual', month: new Date().getUTCMonth() + 1, day: 1, notes: 'Set this to your registered agent anniversary.' })
  }
  if (type === 'ng_ltd') out.push(
    { title: 'CAC annual returns', category: 'annual_return', jurisdiction: 'NG', recurrence: 'annual', month: 6, day: 30, notes: 'File with the Corporate Affairs Commission each year (not in the year of incorporation).' },
    { title: 'Company income tax return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'annual', month: 6, day: 30, notes: 'Due six months after a 31 December year end, with audited accounts.' },
    { title: 'VAT return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', day: 21, notes: 'Monthly, by the 21st of the following month.' },
    { title: 'PAYE remittance', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', day: 10, notes: 'Employee income tax to the state revenue service by the 10th of the following month.' })
  return out
}

// Add the standard reminders for this company (skips any it already has, by title). Runs in the company's workspace.
export async function seedCompanyCompliance(type: string, state: string): Promise<number> {
  const ent = await companyEntityId()
  if (!ent) return 0
  let added = 0
  for (const i of standardFilings(type, state)) {
    const r = await db().query("INSERT INTO compliance.obligations (entity_id, title, category, jurisdiction, recurrence, next_due, reminder_days, notes) SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE NOT EXISTS (SELECT 1 FROM compliance.obligations WHERE entity_id = $1 AND title = $2)",
      [ent, i.title, i.category, i.jurisdiction, i.recurrence, next(i.month, i.day), i.recurrence === 'monthly' ? 5 : 30, i.notes])
    added += r.rowCount ?? 0
  }
  return added
}
