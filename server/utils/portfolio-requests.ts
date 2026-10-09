// Founder update requests: one personal link per company and period, emailed to the founder.
// Used when the team sends a request by hand and by the daily schedule (monthly or quarterly per company).
export type Cadence = 'off' | 'monthly' | 'quarterly'

// "Q3 2026" for a quarterly request (period is the quarter's last month), otherwise "September 2026".
export function requestLabel(period: string, cadence: Cadence): string {
  if (cadence !== 'quarterly') return periodLabel(period)
  const m = Number(period.slice(5, 7))
  return 'Q' + Math.ceil(m / 3) + ' ' + period.slice(0, 4)
}

// The period a schedule asks for on a given day, or null when nothing is due yet this month.
export function duePeriod(cadence: Cadence, day: number, today = new Date()): string | null {
  if (cadence === 'off' || today.getUTCDate() < day) return null
  const y = today.getUTCFullYear(), m = today.getUTCMonth() // 0-based current month
  if (cadence === 'quarterly' && m % 3 !== 0) return null // only in Jan, Apr, Jul, Oct, for the quarter just ended
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toISOString().slice(0, 10)
}

// The next date the schedule will send, for display.
export function nextSend(cadence: Cadence, day: number, today = new Date()): string | null {
  if (cadence === 'off') return null
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, day))
    if (cadence === 'quarterly' && d.getUTCMonth() % 3 !== 0) continue
    if (i === 0 && today.getUTCDate() > day) continue
    return d.toISOString().slice(0, 10)
  }
  return null
}

export async function createReportRequest(companyId: string, period: string, opts: { userId: string | null; fromName: string; sendEmail: boolean; cadence: Cadence }): Promise<{ link: string; emailed: boolean }> {
  const co = (await db().query<{ name: string; founder_name: string; founder_email: string }>('SELECT name, founder_name, founder_email FROM portfolio.companies WHERE id = $1', [companyId])).rows[0]
  if (!co) throw apiError('not_found', 'Company not found', 404)
  const token = randomToken()
  await db().query('UPDATE portfolio.requests SET expires_at = now() WHERE company_id = $1 AND period = $2 AND expires_at > now()', [companyId, period])
  await db().query('INSERT INTO portfolio.requests (company_id, period, token_hash, expires_at, sent_by) VALUES ($1,$2,$3, now() + make_interval(days => $4), $5)',
    [companyId, period, sha256(token), LINK_DAYS, opts.userId])
  const link = (await appUrl()) + '/report/' + token
  let emailed = false
  if (opts.sendEmail) {
    try { await sendReportRequest(co.founder_email, co.founder_name, co.name, requestLabel(period, opts.cadence), link, opts.fromName, opts.cadence === 'quarterly' ? 'quarterly' : 'monthly'); emailed = true }
    catch (err) { console.error('[portfolio] request email failed', err) }
  }
  return { link, emailed }
}

// What the schedule sends next: a request still owed for the current period goes out on the next daily run.
export async function upcomingRequest(companyId: string, cadence: Cadence, day: number): Promise<{ date: string; label: string; soon: boolean } | null> {
  if (cadence === 'off') return null
  const due = duePeriod(cadence, day)
  if (due && !(await db().query('SELECT 1 FROM portfolio.requests WHERE company_id = $1 AND period = $2', [companyId, due])).rowCount)
    return { date: new Date().toISOString().slice(0, 10), label: requestLabel(due, cadence), soon: true }
  const next = nextSend(cadence, day)
  if (!next) return null
  const d = new Date(next + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1)
  return { date: next, label: requestLabel(d.toISOString().slice(0, 10), cadence), soon: false }
}
