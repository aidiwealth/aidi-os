// Services that are filings become compliance deadlines in the company's own workspace: added when ordered, marked filed
// (and rolled to the next date) when the services team completes the job.
const FILING: Record<string, { title: string; category: string; jurisdiction: string; month?: number; day?: number }> = {
  irs_annual: { title: 'Federal tax return (IRS)', category: 'tax', jurisdiction: 'US', month: 4, day: 15 },
  de_franchise: { title: 'Delaware franchise tax and annual report', category: 'franchise_tax', jurisdiction: 'US-DE', month: 3, day: 1 },
  ca_state: { title: 'California state filing', category: 'annual_return', jurisdiction: 'US-CA', month: 4, day: 15 },
  registered_agent: { title: 'Registered agent renewal', category: 'registered_agent', jurisdiction: 'US' },
  virtual_office: { title: 'Virtual office renewal', category: 'other', jurisdiction: 'US' },
  de_mailbox: { title: 'Delaware mailbox renewal', category: 'other', jurisdiction: 'US-DE' } }
const nextDue = (f: { month?: number; day?: number }) => { const now = new Date(); if (f.month === undefined) return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10); let d = new Date(Date.UTC(now.getUTCFullYear(), f.month - 1, f.day ?? 1)); if (d <= now) d = new Date(Date.UTC(now.getUTCFullYear() + 1, f.month - 1, f.day ?? 1)); return d.toISOString().slice(0, 10) }
async function inCompany<T>(clientId: string, fn: (orgId: string) => Promise<T>): Promise<T | null> {
  const ws = (await asPlatform(() => db().query<{ workspace_id: string | null }>('SELECT workspace_id FROM services.clients WHERE id = $1', [clientId]))).rows[0]?.workspace_id
  if (!ws) return null
  const prev = currentOrgId()
  setOrgContext(ws)
  try { return await fn(ws) } finally { setOrgContext(prev) }
}
// On order: make sure each filing is on the company's compliance calendar.
export async function filingsOrdered(clientId: string, codes: string[], opts: { vo_term?: 'monthly' | 'annual'; ra_free?: boolean } = {}): Promise<number> {
  const list = codes.filter((c) => FILING[c])
  if (!list.length && !codes.some((c) => c === 'llc_formation' || c === 'inc_formation')) return 0
  return (await inCompany(clientId, async () => {
    const ent = await companyEntityId(); if (!ent) return 0
    let n = 0
    for (const c of list) {
      const f = FILING[c]!
      const monthly = c === 'virtual_office' && opts.vo_term !== 'annual'
      const due = monthly ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate())).toISOString().slice(0, 10) : nextDue(f)
      const note = c === 'registered_agent' ? (opts.ra_free ? 'Free for the first year with your new company. ' : '') + 'Renews automatically each year: charged from your Finvry wallet, or your card on file.'
        : c === 'virtual_office' ? 'Renews automatically ' + (monthly ? 'every month' : 'every year') + ': charged from your Finvry wallet, or your card on file.' : 'Ordered from Aidi in Finvry. Our team handles this filing.'
      const r = await db().query("INSERT INTO compliance.obligations (entity_id, title, category, jurisdiction, recurrence, next_due, reminder_days, notes) SELECT $1,$2,$3,$4,$7,$5,$8,$6 WHERE NOT EXISTS (SELECT 1 FROM compliance.obligations WHERE entity_id = $1 AND title = $2 AND active)", [ent, f.title, f.category, f.jurisdiction, due, note, monthly ? 'monthly' : 'annual', monthly ? 5 : 30])
      n += r.rowCount ?? 0
    }
    return n
  })) ?? 0
}
// On completion: mark this cycle filed and roll forward; formations add the standard filings for the company type.
export async function filingsCompleted(clientId: string, codes: string[], jobTitle: string): Promise<number> {
  return (await inCompany(clientId, async (orgId) => {
    const ent = await companyEntityId(); if (!ent) return 0
    let n = 0
    for (const c of codes.filter((x) => FILING[x])) {
      const f = FILING[c]!
      let o = (await db().query<{ id: string; next_due: string; recurrence: string }>("SELECT id, to_char(next_due, 'YYYY-MM-DD') AS next_due, recurrence FROM compliance.obligations WHERE entity_id = $1 AND title = $2 AND active LIMIT 1", [ent, f.title])).rows[0]
      if (!o) { await filingsOrdered(clientId, [c]); o = (await db().query<{ id: string; next_due: string; recurrence: string }>("SELECT id, to_char(next_due, 'YYYY-MM-DD') AS next_due, recurrence FROM compliance.obligations WHERE entity_id = $1 AND title = $2 AND active LIMIT 1", [ent, f.title])).rows[0] }
      if (!o) continue
      await db().query('INSERT INTO compliance.completions (obligation_id, due_date, completed_on, note) VALUES ($1,$2,current_date,$3)', [o.id, o.next_due, ('Filed by Aidi: ' + jobTitle).slice(0, 2000)])
      const next = rollForward(o.next_due, o.recurrence); if (next) await db().query('UPDATE compliance.obligations SET next_due = $2 WHERE id = $1', [o.id, next])
      n++
    }
    if (codes.some((c) => c === 'llc_formation' || c === 'inc_formation')) {
      const s = (await asPlatform(() => db().query<{ settings: Record<string, string> }>('SELECT settings FROM core.organizations WHERE id = $1', [orgId]))).rows[0]?.settings ?? {}
      n += await seedCompanyCompliance(s.entity_type || (codes.includes('inc_formation') ? 'us_corp' : 'us_llc'), s.state || 'Delaware')
    }
    return n
  })) ?? 0
}
