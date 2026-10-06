// Loan applications from the pitch form, guarantors (founders) and credit checks for business and guarantors.
export const bandOf = (score: number | null) => (score == null ? null : score >= 750 ? 'Excellent' : score >= 680 ? 'Good' : score >= 600 ? 'Fair' : 'Poor')
// Run a CreditChek check for a business (RC) or a guarantor (BVN) and store it; quietly records an error if unavailable.
export async function runCheck(borrowerId: string, guarantorId: string | null, kind: 'individual' | 'business', ident: string, by: string | null = null): Promise<{ status: string; score: number | null; band: string | null }> {
  try {
    const r = await creditchek(kind, ident)
    const sc = r.summary ? scoreOf(r.summary) : null
    await db().query('INSERT INTO credit.checks (borrower_id, guarantor_id, provider, kind, status, score, band, summary, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [borrowerId, guarantorId, 'creditchek', kind, r.status, sc?.score ?? null, sc?.band ?? null, JSON.stringify(r.summary ?? {}), r.status === 'no_data' ? 'No credit history found at the bureaus.' : null, by])
    return { status: r.status, score: sc?.score ?? null, band: sc?.band ?? null }
  } catch (err) {
    const note = (err as { data?: { error?: { message?: string } }; message?: string }).data?.error?.message ?? (err as Error).message ?? 'Check failed'
    await db().query("INSERT INTO credit.checks (borrower_id, guarantor_id, provider, kind, status, note, created_by) VALUES ($1,$2,'creditchek',$3,'error',$4,$5)", [borrowerId, guarantorId, kind, String(note).slice(0, 500), by])
    return { status: 'error', score: null, band: null }
  }
}
// Business (RC) and every guarantor with a BVN; moves the application to review.
export async function checkApplication(appId: string, by: string | null = null) {
  const a = (await db().query<{ borrower_id: string; rc_number: string | null; country: string | null }>('SELECT a.borrower_id, a.rc_number, b.country FROM credit.applications a JOIN credit.borrowers b ON b.id = a.borrower_id WHERE a.id = $1', [appId])).rows[0]
  if (!a) return
  await db().query("UPDATE credit.applications SET status = CASE WHEN status IN ('new','checking') THEN 'checking' ELSE status END, updated_at = now() WHERE id = $1", [appId])
  if (/nigeria/i.test(a.country ?? '')) {
    if (a.rc_number) await runCheck(a.borrower_id, null, 'business', a.rc_number.replace(/\s+/g, '').toUpperCase(), by)
    for (const g of (await db().query<{ id: string; bvn_enc: string | null }>('SELECT id, bvn_enc FROM credit.guarantors WHERE borrower_id = $1', [a.borrower_id])).rows) if (g.bvn_enc) await runCheck(a.borrower_id, g.id, 'individual', decryptText(g.bvn_enc), by)
  }
  await db().query("UPDATE credit.applications SET status = CASE WHEN status IN ('new','checking') THEN 'review' ELSE status END, updated_at = now() WHERE id = $1", [appId])
}
export interface LoanAsk { company: string; founder_name: string; email: string; phone?: string | null; country?: string | null; sector?: string | null; amount: number; currency: string; tenor_months?: number | null; purpose?: string | null; monthly_revenue?: number | null; rc_number?: string | null; bvn?: string | null; nin?: string | null; dob?: string | null }
export async function createApplication(pitchId: string | null, l: LoanAsk): Promise<string> {
  const br = await one<{ id: string }>("INSERT INTO credit.borrowers (name, country, sector, contact_name, contact_email, kind) VALUES ($1,$2,$3,$4,$5,'business') RETURNING id", [l.company, l.country ?? null, l.sector ?? null, l.founder_name, l.email])
  await db().query('INSERT INTO credit.guarantors (borrower_id, name, email, phone, relationship, bvn_enc, bvn_last4, nin_enc, nin_last4, dob) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [br.id, l.founder_name, l.email, l.phone ?? null, 'Founder', l.bvn ? encryptText(l.bvn) : null, l.bvn ? l.bvn.slice(-4) : null, l.nin ? encryptText(l.nin) : null, l.nin ? l.nin.slice(-4) : null, l.dob || null])
  const app = await one<{ id: string }>('INSERT INTO credit.applications (pitch_id, borrower_id, amount, currency, tenor_months, purpose, monthly_revenue, rc_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [pitchId, br.id, l.amount, l.currency, l.tenor_months ?? null, l.purpose ?? null, l.monthly_revenue ?? null, l.rc_number ?? null])
  if (pitchId) await db().query('UPDATE deals.pitches SET application_id = $2 WHERE id = $1', [pitchId, app.id])
  return app.id
}
