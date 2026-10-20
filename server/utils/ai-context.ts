// What the AI may know about the company from its own account, as short plain text: the basis for writing report
// details, reviews and comments "from your data". Only this company's data (row-level security applies), and no
// pay, bank account numbers or personal contact details.
const t = (v: unknown, n = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
async function safe<T>(f: () => Promise<T>, d: T): Promise<T> { try { return await f() } catch { return d } }

export async function accountContext(): Promise<string> {
  const org = await currentOrg()
  if (!org) return ''
  const s = org.settings as Record<string, unknown>
  const out: string[] = ['Company: ' + org.name + (t(s.website) ? ' · website ' + t(s.website) : '') + (t(s.country) ? ' · country ' + t(s.country) : '') + (t(s.currency) ? ' · currency ' + t(s.currency) : '')]
  const page = await safe(async () => (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1')).rows[0], undefined)
  if (page?.headline || page?.about) out.push('Investor page: ' + [t(page.headline, 200), t(page.about, 1500)].filter(Boolean).join(' — '))
  const prof = await safe(async () => (await reportProfile()).profile as unknown as Record<string, unknown>, null)
  if (prof) {
    const p = prof as { legal_name?: string; legal_form?: string; jurisdiction?: string; incorporated_on?: string; principal_activities?: string; registered_office?: string; directors?: { name: string; role: string }[]; cfo?: { name: string; role: string }; bankers?: string[]; signatory?: { name: string; role: string } }
    out.push('Report details saved so far: ' + [p.legal_name && 'legal name ' + p.legal_name, p.legal_form && 'legal form ' + p.legal_form, p.jurisdiction && 'incorporated in ' + p.jurisdiction, p.incorporated_on && 'incorporated on ' + p.incorporated_on,
      p.principal_activities && 'activities: ' + t(p.principal_activities, 600), p.registered_office && 'registered office ' + t(p.registered_office, 200),
      p.directors?.length && 'directors ' + p.directors.filter((d) => d.name).map((d) => d.name + (d.role ? ' (' + d.role + ')' : '')).join(', '), p.cfo?.name && 'CFO ' + p.cfo.name,
      p.signatory?.name && 'signs for the board ' + p.signatory.name, p.bankers?.filter(Boolean).length && 'bankers ' + p.bankers.filter(Boolean).join(', ')].filter(Boolean).join('; '))
  }
  const ents = await safe(async () => (await db().query<{ name: string; legal_name: string | null; kind: string; jurisdiction: string | null; formation_date: string | null; address: string | null; registration_number: string | null; parent: string | null }>(
    "SELECT e.name, e.legal_name, e.kind, e.jurisdiction, to_char(e.formation_date, 'YYYY-MM-DD') AS formation_date, e.address, e.registration_number, p.name AS parent FROM core.entities e LEFT JOIN core.entities p ON p.id = e.parent_id ORDER BY e.parent_id NULLS FIRST, e.created_at LIMIT 12")).rows, [])
  if (ents.length) out.push('Companies in the account: ' + ents.map((e) => [e.legal_name || e.name, e.kind, e.parent ? 'subsidiary of ' + e.parent : '', e.jurisdiction ? 'in ' + e.jurisdiction : '', e.formation_date ? 'formed ' + e.formation_date : '', e.registration_number ? 'reg. no. ' + e.registration_number : '', e.address ? 'address ' + t(e.address, 160) : ''].filter(Boolean).join(', ')).join(' | '))
  const people = await safe(async () => (await db().query<{ name: string; title: string | null; kind: string | null }>("SELECT name, title, kind FROM hr.people WHERE status IS DISTINCT FROM 'left' ORDER BY created_at LIMIT 25")).rows, [])
  if (people.length) out.push('People (names and titles only): ' + people.map((p) => p.name + (p.title ? ' — ' + p.title : p.kind ? ' — ' + p.kind : '')).join(', '))
  const team = await safe(async () => (await db().query<{ name: string; roles: string }>("SELECT coalesce(pe.full_name, u.email) AS name, string_agg(DISTINCT r.role_code, ',') AS roles FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people pe ON pe.id = u.person_id JOIN core.user_roles r ON r.user_id = u.id AND r.organization_id = m.organization_id WHERE m.status = 'active' GROUP BY 1 LIMIT 15")).rows, [])
  if (team.length) out.push('Workspace members and roles (gp = founder or partner): ' + team.map((x) => x.name.replace(/@.*/, '') + ' (' + x.roles + ')').join(', '))
  const banks = await safe(async () => [...new Set([...(await db().query<{ b: string }>('SELECT DISTINCT bank_name AS b FROM banking.accounts WHERE bank_name IS NOT NULL')).rows.map((r) => r.b), ...(await db().query<{ b: string }>('SELECT DISTINCT institution AS b FROM banking.plaid_items WHERE institution IS NOT NULL')).rows.map((r) => r.b)])], [] as string[])
  if (banks.length) out.push('Banks the company uses: ' + banks.join(', '))
  const holders = await safe(async () => (await db().query<{ name: string; kind: string }>("SELECT h.name, h.kind FROM equity.holders h JOIN equity.captables c ON c.id = h.captable_id AND c.is_main ORDER BY h.created_at LIMIT 12")).rows, [])
  if (holders.length) out.push('Shareholders on the cap table: ' + holders.map((h) => h.name + ' (' + h.kind + ')').join(', '))
  const docs = await safe(async () => (await db().query<{ title: string; kind: string }>("SELECT title, kind FROM core.documents WHERE coalesce(sensitivity, 'normal') <> 'restricted' ORDER BY created_at DESC LIMIT 25")).rows, [])
  if (docs.length) out.push('Documents on file (titles only): ' + docs.map((d) => t(d.title, 80)).join('; '))
  const ob = await safe(async () => (await db().query<{ title: string; jurisdiction: string | null }>('SELECT title, jurisdiction FROM compliance.obligations WHERE active ORDER BY next_due NULLS LAST LIMIT 12')).rows, [])
  if (ob.length) out.push('Filings on the compliance calendar: ' + ob.map((o) => o.title + (o.jurisdiction ? ' (' + o.jurisdiction + ')' : '')).join(', '))
  const mins = await safe(async () => (await db().query<{ title: string; held: string; summary: string | null; decisions: string | null }>("SELECT title, to_char(held_at, 'YYYY-MM-DD') AS held, summary, decisions::text AS decisions FROM core.meeting_minutes WHERE status IS DISTINCT FROM 'draft' ORDER BY held_at DESC LIMIT 4")).rows, [])
  if (mins.length) out.push('Recent board and team meetings: ' + mins.map((m) => m.held + ' ' + m.title + (m.summary ? ': ' + t(m.summary, 300) : '')).join(' | '))
  return out.join('\n')
}
