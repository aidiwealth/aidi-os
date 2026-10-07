// The company dashboard: headline figures and trends from Financials, what is due, services, investor page, setup steps.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const org = await currentOrg()
  if (!org || org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const ent = await companyEntityId()
  const rows = ent ? await loadStatements('entity:' + ent, 'month', (org.settings.currency as string) || 'USD') : []
  type Pt = Record<string, number | null> & { period: string; currency: string }
  const series: Pt[] = rows.slice(-12).map((r) => Object.assign({}, derive(r.lines, r.period_type), { period: r.period_end, currency: r.currency }) as Pt)
  const last = series[series.length - 1] ?? null, prev = series[series.length - 2] ?? null
  const lr = last ? last.revenue ?? null : null, pr = prev ? prev.revenue ?? null : null
  const growth = lr != null && pr ? Math.round(((lr - pr) / Math.abs(pr)) * 1000) / 10 : null
  const due = await db().query("SELECT id, title, to_char(next_due, 'YYYY-MM-DD') AS next_due, (next_due < current_date) AS overdue FROM compliance.obligations WHERE active AND next_due <= current_date + 60 ORDER BY next_due LIMIT 6")
  const page = (await db().query<{ slug: string; published: boolean; views: number }>('SELECT slug, published, views FROM financials.public_pages LIMIT 1')).rows[0] ?? null
  const shares = await one<{ n: number; views: number }>('SELECT count(*)::int AS n, coalesce(sum(views), 0)::int AS views FROM financials.shares WHERE expires_at > now()')
  const members = await one<{ n: number }>("SELECT count(*)::int AS n FROM core.memberships WHERE status = 'active'")
  let services = { open: 0, waiting: 0, unpaid: 0 }
  const link = await asPlatform(() => db().query<{ id: string }>('SELECT id FROM services.clients WHERE workspace_id = $1', [org.id]))
  if (link.rows[0]) {
    const s = await asPlatform(() => db().query<{ open: number; waiting: number; unpaid: number }>(
      `SELECT (SELECT count(*)::int FROM services.jobs WHERE client_id = $1 AND status NOT IN ('completed','cancelled')) AS open,
              (SELECT count(*)::int FROM services.jobs WHERE client_id = $1 AND status = 'waiting_client') AS waiting,
              (SELECT count(*)::int FROM services.invoices WHERE client_id = $1 AND status = 'sent') AS unpaid`, [link.rows[0].id]))
    services = s.rows[0]!
  }
  const name = (await asPlatform(() => db().query<{ n: string | null }>('SELECT p.full_name AS n FROM core.users u LEFT JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId]))).rows[0]?.n
  return {
    company: org.name, first: (name ?? user.email).split(' ')[0], currency: last?.currency ?? ((org.settings.currency as string) || 'USD'), plan: org.plan_code, status: org.status,
    last, growth, series, mix: last ? [['cogs', 'Cost of revenue'], ['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_rnd', 'R&D'], ['opex_ga', 'G&A'], ['opex_other', 'Other']].map(([k, l]) => ({ label: l, value: Number(last[k!] ?? 0) })) : [],
    due: due.rows, page, shares, services, wallet: await walletOf(org.id),
    setup: await (async () => {
      const mods = await enabledModules()
      const decks = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM fundraise.decks').catch(() => ({ rows: [{ n: '0' }] }))).rows[0]?.n ?? 0)
      const ups = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM financials.updates WHERE status = 'sent'").catch(() => ({ rows: [{ n: '0' }] }))).rows[0]?.n ?? 0)
      return [
        { key: 'fin', label: 'Bring in your financials', desc: 'Connect QuickBooks, paste a Google Sheet or drop a spreadsheet. We map the figures for you to check.', cta: 'Add financials', mins: 5, done: series.length > 0, to: '/financials' },
        { key: 'co', label: 'Add your company type', desc: 'We add your usual filing deadlines to the compliance calendar, with reminders.', cta: 'Open settings', mins: 1, done: !!org.settings.entity_type, to: '/settings' },
        ...(mods.has('decks') ? [{ key: 'deck', label: 'Upload your deck', desc: 'Share it by link and see who reads it and for how long on every slide.', cta: 'Upload deck', mins: 2, done: decks > 0, to: '/decks' }] : []),
        { key: 'page', label: 'Publish your investor page', desc: 'One link that always shows where the company is, with your deck and data room.', cta: 'Set up page', mins: 5, done: !!page?.published, to: '/investor-page' },
        ...(mods.has('updates') ? [{ key: 'upd', label: 'Send your first investor update', desc: 'Finvry AI drafts it from your numbers. Edit, then send to every investor.', cta: 'Write update', mins: 10, done: ups > 0, to: '/updates' }] : []),
        { key: 'team', label: 'Invite a co-founder or your accountant', desc: 'Share the work. You choose what each person can see and do.', cta: 'Invite', mins: 1, done: members.n > 1, to: '/team' }
      ]
    })()
  }
})
