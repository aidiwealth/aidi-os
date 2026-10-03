// Credit maths: schedules from loan terms, and a loan's position from its schedule and repayments.
// Repayments are applied in date order to the oldest instalment, interest before principal.
export interface Row { seq: number; due_date: string; principal_due: number; interest_due: number }
export interface Pay { id: string; received_on: string; amount: number }
const r2 = (n: number) => Math.round(n * 100) / 100

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last))
  return t.toISOString().slice(0, 10)
}

export function buildSchedule(t: { principal: number; annual_rate: number; tenor_months: number; repayment_type: string; frequency: string; disbursed_on: string; first_payment_on: string }): Row[] {
  const step = t.frequency === 'quarterly' ? 3 : 1
  const n = Math.max(1, Math.round(t.tenor_months / step))
  const r = (t.annual_rate / 100) * (step / 12)
  const rows: Row[] = []
  let bal = t.principal
  if (t.repayment_type === 'bullet') {
    const days = (Date.parse(addMonths(t.first_payment_on, (n - 1) * step)) - Date.parse(t.disbursed_on)) / 86400000
    rows.push({ seq: 1, due_date: addMonths(t.first_payment_on, (n - 1) * step), principal_due: t.principal, interest_due: r2(t.principal * (t.annual_rate / 100) * Math.max(days, 0) / 365) })
    return rows
  }
  const pmt = r === 0 ? t.principal / n : (t.principal * r) / (1 - Math.pow(1 + r, -n))
  for (let i = 0; i < n; i++) {
    const interest = r2(bal * r)
    let principal = t.repayment_type === 'interest_only' ? (i === n - 1 ? bal : 0) : r2(pmt - interest)
    if (i === n - 1) principal = r2(bal)
    bal = r2(bal - principal)
    rows.push({ seq: i + 1, due_date: addMonths(t.first_payment_on, i * step), principal_due: r2(principal), interest_due: interest })
  }
  return rows
}

export interface Position {
  outstandingPrincipal: number; principalReceived: number; interestReceived: number
  arrears: number; dpd: number; bucket: 'current' | '1-30' | '31-90' | '90+'
  next: { due_date: string; amount: number } | null
  rows: (Row & { paid: number; status: 'paid' | 'partial' | 'overdue' | 'due' | 'upcoming' })[]
  allocations: { id: string; received_on: string; interest: number; principal: number; excess: number }[]
}

export function position(schedule: Row[], pays: Pay[], principal: number, today = new Date().toISOString().slice(0, 10)): Position {
  const rows = schedule.map((s) => ({ ...s, paidI: 0, paidP: 0 }))
  const allocations: Position['allocations'] = []
  for (const p of [...pays].sort((a, b) => a.received_on.localeCompare(b.received_on))) {
    let left = p.amount, i = 0, pr = 0
    for (const row of rows) {
      if (left <= 0) break
      const ti = Math.min(left, r2(row.interest_due - row.paidI)); row.paidI = r2(row.paidI + ti); left = r2(left - ti); i = r2(i + ti)
      const tp = Math.min(left, r2(row.principal_due - row.paidP)); row.paidP = r2(row.paidP + tp); left = r2(left - tp); pr = r2(pr + tp)
    }
    // Anything beyond the schedule is treated as early principal repayment
    allocations.push({ id: p.id, received_on: p.received_on, interest: i, principal: pr, excess: r2(left) })
  }
  const principalReceived = r2(allocations.reduce((s, a) => s + a.principal + a.excess, 0))
  const interestReceived = r2(allocations.reduce((s, a) => s + a.interest, 0))
  let arrears = 0, firstUnpaid: string | null = null, next: Position['next'] = null
  const out = rows.map((row) => {
    const due = r2(row.principal_due + row.interest_due), paid = r2(row.paidI + row.paidP), owed = r2(due - paid)
    let status: Position['rows'][number]['status']
    if (owed <= 0.004) status = 'paid'
    else if (row.due_date < today) { status = paid > 0 ? 'partial' : 'overdue'; arrears = r2(arrears + owed); firstUnpaid ??= row.due_date }
    else { status = row.due_date === today ? 'due' : paid > 0 ? 'partial' : 'upcoming'; if (!next) next = { due_date: row.due_date, amount: owed } }
    return { seq: row.seq, due_date: row.due_date, principal_due: row.principal_due, interest_due: row.interest_due, paid, status }
  })
  const dpd = firstUnpaid ? Math.round((Date.parse(today) - Date.parse(firstUnpaid)) / 86400000) : 0
  const bucket = dpd === 0 ? 'current' : dpd <= 30 ? '1-30' : dpd <= 90 ? '31-90' : '90+'
  return { outstandingPrincipal: Math.max(0, r2(principal - principalReceived)), principalReceived, interestReceived, arrears, dpd, bucket, next, rows: out, allocations }
}

export async function loadPosition(loanId: string, principal: number): Promise<Position> {
  const s = await db().query<{ seq: number; due_date: string; principal_due: string; interest_due: string }>(
    "SELECT seq, to_char(due_date, 'YYYY-MM-DD') AS due_date, principal_due::text, interest_due::text FROM credit.schedule WHERE loan_id = $1 ORDER BY seq", [loanId])
  const p = await db().query<{ id: string; received_on: string; amount: string }>(
    "SELECT id, to_char(received_on, 'YYYY-MM-DD') AS received_on, amount::text FROM credit.repayments WHERE loan_id = $1 ORDER BY received_on, created_at", [loanId])
  return position(s.rows.map((r) => ({ seq: r.seq, due_date: r.due_date, principal_due: Number(r.principal_due), interest_due: Number(r.interest_due) })),
    p.rows.map((r) => ({ id: r.id, received_on: r.received_on, amount: Number(r.amount) })), principal)
}

export const nextCovenantDate = (from: string, frequency: string): string | null =>
  frequency === 'once' ? null : addMonths(from, frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12)
