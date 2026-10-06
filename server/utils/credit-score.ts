// Credit bureau checks. Nigeria: CreditChek (all three bureaus). US: connector built, switched off until a bureau
// contract exists (US borrowers go to manual review). The score is our indicative 300–850 score from the bureau data.
type Src = { source: string; value: unknown }
const num = (v: unknown): number => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 }
const maxOf = (arr?: Src[]) => Math.max(0, ...(arr ?? []).map((s) => num(s.value)))
export interface CreditSummary { loans: number; active: number; closed: number; delinquent: number; overdueAccounts: number; borrowed: number; outstanding: number; overdue: number; highest: number; monthly: number; institutions: number; enquiries3m: number; enquiries12m: number;
  sources: { source: string; loans: number; outstanding: number; overdue: number; delinquent: number }[]; lenders: { provider: string; amount: number; outstanding: number; status: string; performance: string }[] }
export function summarise(score: Record<string, Src[] | unknown>): CreditSummary {
  const g = (k: string) => score[k] as Src[] | undefined
  const sources = ['CRC', 'FIRST_CENTRAL', 'CREDIT_REGISTRY'].map((s) => ({ source: s, loans: num(g('totalNoOfLoans')?.find((x) => x.source === s)?.value), outstanding: num(g('totalOutstanding')?.find((x) => x.source === s)?.value), overdue: num(g('totalOverdue')?.find((x) => x.source === s)?.value), delinquent: num(g('totalNoOfDelinquentFacilities')?.find((x) => x.source === s)?.value) })).filter((s) => s.loans || s.outstanding)
  const perf = (g('loanPerformance') ?? []).flatMap((s) => (Array.isArray(s.value) ? s.value : []) as Record<string, unknown>[])
  const enq = (g('creditEnquiriesSummary') ?? []).map((s) => s.value as Record<string, unknown>).find((v) => v && !Array.isArray(v) && 'Last3MonthCount' in v)
  return { loans: maxOf(g('totalNoOfLoans')), active: maxOf(g('totalNoOfActiveLoans')), closed: maxOf(g('totalNoOfClosedLoans')), delinquent: maxOf(g('totalNoOfDelinquentFacilities')), overdueAccounts: maxOf(g('totalNoOfOverdueAccounts')),
    borrowed: maxOf(g('totalBorrowed')), outstanding: maxOf(g('totalOutstanding')), overdue: maxOf(g('totalOverdue')), highest: maxOf(g('highestLoanAmount')), monthly: maxOf(g('totalMonthlyInstallment')), institutions: maxOf(g('totalNoOfInstitutions')),
    enquiries3m: num(enq?.Last3MonthCount), enquiries12m: num(enq?.Last12MonthCount), sources,
    lenders: perf.slice(0, 20).map((l) => ({ provider: String(l.loanProvider ?? '').slice(0, 80), amount: num(l.loanAmount), outstanding: num(l.outstandingBalance), status: String(l.status ?? ''), performance: String(l.performanceStatus ?? '') })) }
}
// Indicative score: starts at 720, penalised for delinquencies, overdue accounts and amounts, heavy recent borrowing
// enquiries and lost loans; rewarded for a long, clean record. Clamped to 300–850.
export function scoreOf(s: CreditSummary): { score: number; band: string } {
  let v = 720
  v -= s.delinquent * 70 + s.overdueAccounts * 35
  if (s.outstanding > 0) v -= Math.min(180, (s.overdue / s.outstanding) * 300)
  v -= Math.max(0, s.enquiries3m - 2) * 12
  v -= s.lenders.filter((l) => /lost|non-performing|written/i.test(l.performance)).length * 60
  if (s.closed >= 3 && !s.delinquent && !s.overdueAccounts) v += 40
  if (s.loans === 0) v = 600
  const score = Math.round(Math.max(300, Math.min(850, v)))
  return { score, band: score >= 750 ? 'Excellent' : score >= 680 ? 'Good' : score >= 600 ? 'Fair' : 'Poor' }
}
export async function creditchek(kind: 'individual' | 'business', id: string): Promise<{ status: 'ok' | 'no_data'; summary: CreditSummary | null; name?: string }> {
  const key = await creditchekKey()
  if (!key) throw apiError('creditchek_off', 'CreditChek is not set up yet. An admin can add the key in Credit → Settings.', 503)
  const url = kind === 'individual' ? 'https://api.creditchek.africa/v1/credit/advanced?bvn=' + encodeURIComponent(id) : 'https://api.creditchek.africa/v1/credit/sme/premium?businessregno=' + encodeURIComponent(id)
  const r = await fetch(url, { headers: { token: key }, signal: AbortSignal.timeout(45000) })
  const j = await r.json().catch(() => ({})) as { status?: boolean; message?: string; data?: { name?: string; score?: Record<string, unknown> } }
  if (!r.ok && r.status !== 404) { console.error('[creditchek]', r.status, j.message); throw apiError('creditchek', 'CreditChek returned an error: ' + (j.message ?? r.status), 502) }
  if (!j.status || !j.data?.score) return { status: 'no_data', summary: null }
  return { status: 'ok', summary: summarise(j.data.score as Record<string, Src[]>), name: j.data.name }
}
export const usBureauOn = () => useRuntimeConfig().usBureauEnabled === 'true'
