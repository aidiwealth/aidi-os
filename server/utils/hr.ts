// Mini HR for Aidi OS: people (staff and consultants), their agreements, pay schedule, what is due, and payments.
export interface HrPerson { id: string; name: string; email: string | null; kind: string; title: string | null; entity_id: string | null; entity: string | null; start_date: string | null; end_date: string | null; contract_end: string | null; pay_amount: number | null; currency: string; pay_frequency: string; pay_day: number; status: string }
export interface HrPay { person_id: string; period: string; amount: number; currency: string; paid_on: string }
export interface HrAgreement { person_id: string; status: string; ends_on: string | null; created_at: string; kind: string; title: string }
const d10 = (d: Date) => d.toISOString().slice(0, 10)
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
// Pay dates between from and to (inclusive) for one person, with the period key their payment is logged under.
export function payDates(p: HrPerson, from: string, to: string): { due: string; period: string }[] {
  if (p.status === 'ended' || !p.pay_amount || ['none', 'per_invoice'].includes(p.pay_frequency)) return []
  const start = p.start_date && p.start_date > from ? p.start_date : from, end = p.end_date && p.end_date < to ? p.end_date : to
  const out: { due: string; period: string }[] = []
  if (p.pay_frequency === 'monthly' || p.pay_frequency === 'quarterly') {
    const s = new Date(start + 'T00:00:00Z'); let y = s.getUTCFullYear(), m = s.getUTCMonth()
    for (let i = 0; i < 40; i++) {
      if (p.pay_frequency === 'monthly' || m % 3 === 2) { const due = d10(new Date(Date.UTC(y, m, Math.min(p.pay_day, lastDay(y, m))))); if (due > end) break; if (due >= start) out.push({ due, period: due.slice(0, 7) }) }
      m++; if (m > 11) { m = 0; y++ }
      if (d10(new Date(Date.UTC(y, m, 1))) > end) break
    }
  } else {
    const step = p.pay_frequency === 'weekly' ? 7 : 14
    let d = new Date((p.start_date ?? from) + 'T00:00:00Z')
    for (let i = 0; i < 400 && d10(d) <= end; i++) { if (d10(d) >= start) out.push({ due: d10(d), period: d10(d) }); d = new Date(d.getTime() + step * 86400000) }
  }
  return out
}
export function hrStatus(people: HrPerson[], pays: HrPay[], ags: HrAgreement[], today: string) {
  const back = d10(new Date(new Date(today + 'T00:00:00Z').getTime() - 92 * 86400000)), ahead = d10(new Date(new Date(today + 'T00:00:00Z').getTime() + 21 * 86400000))
  const due: { person_id: string; name: string; due: string; period: string; amount: number; currency: string; overdue: boolean }[] = []
  const flags: Record<string, { level: 'red' | 'amber'; text: string }[]> = {}
  const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const add = (id: string, level: 'red' | 'amber', text: string) => (flags[id] ??= []).push({ level, text })
  for (const p of people) {
    if (p.status !== 'ended') {
      for (const x of payDates(p, back, ahead)) if (!pays.some((y) => y.person_id === p.id && y.period === x.period)) due.push({ person_id: p.id, name: p.name, due: x.due, period: x.period, amount: p.pay_amount ?? 0, currency: p.currency, overdue: x.due < today })
      const mine = ags.filter((a) => a.person_id === p.id)
      if (!mine.some((a) => a.status === 'signed')) add(p.id, 'red', mine.length ? 'No signed agreement yet' : 'No agreement on file')
      for (const a of mine) if (a.status === 'sent' && a.created_at < d10(new Date(new Date(today).getTime() - 14 * 86400000))) add(p.id, 'amber', '"' + a.title + '" sent but not signed')
      const ce = p.contract_end ?? mine.filter((a) => a.status === 'signed' && a.ends_on).map((a) => a.ends_on!).sort().pop() ?? null
      if (ce && ce < today) add(p.id, 'red', 'Contract ended ' + nice(ce))
      else if (ce && ce <= d10(new Date(new Date(today).getTime() + 45 * 86400000))) add(p.id, 'amber', 'Contract ends ' + nice(ce))
      if (due.some((x) => x.person_id === p.id && x.overdue)) add(p.id, 'red', 'Pay overdue')
    }
  }
  return { due: due.sort((a, b) => a.due.localeCompare(b.due)), flags }
}
// Monthly cost of active people, by currency (weekly and fortnightly pay converted to a month).
export function monthlyCost(people: HrPerson[]) {
  const per: Record<string, number> = { monthly: 1, quarterly: 1 / 3, biweekly: 26 / 12, weekly: 52 / 12 }
  const out: Record<string, number> = {}
  for (const p of people) if (p.status !== 'ended' && p.pay_amount && per[p.pay_frequency]) out[p.currency] = (out[p.currency] ?? 0) + p.pay_amount * per[p.pay_frequency]!
  return out
}
export const HR_DOCS = ['employment', 'offer_letter', 'consulting', 'contractor', 'advisor', 'ip_assignment', 'mutual_nda']
