// The workspace overview: what matters now across the areas this person can use.
const ACTIVITY: Record<string, [string, string]> = {
  'deal.pitch_received': ['pitches', 'A new pitch arrived'], 'deal.screened': ['pitches', 'AI screened a pitch'], 'deal.rescreen': ['pitches', 'Re-screened a pitch'],
  'deal.decision': ['pitches', 'Decided on a pitch'], 'pipeline.create': ['pipeline', 'Added a deal'], 'pipeline.stage': ['pipeline', 'Moved a deal to a new stage'],
  'pipeline.ic_vote': ['pipeline', 'Voted at IC'], 'pipeline.note': ['pipeline', 'Added a deal note'], 'pipeline.meeting': ['pipeline', 'Logged a meeting'], 'pipeline.document': ['pipeline', 'Added a deal document'],
  'pipeline.update': ['pipeline', 'Updated a deal'], 'portfolio.add': ['portfolio', 'Added a portfolio company'], 'portfolio.request_sent': ['portfolio', 'Requested a monthly update'],
  'portfolio.report_submitted': ['portfolio', 'A founder submitted their update'], 'portfolio.override': ['portfolio', 'Corrected a reported figure'],
  'entity.create': ['entities', 'Added an entity'], 'document.upload': ['documents', 'Uploaded a document'], 'compliance.create': ['compliance', 'Added a compliance obligation'],
  'compliance.complete': ['compliance', 'Completed a filing'], 'banking.account_create': ['banking', 'Added a bank account'], 'banking.statement_saved': ['banking', 'Saved a bank statement'],
  'governance.draft': ['governance', 'Drafted a resolution'], 'governance.circulate': ['governance', 'Circulated a resolution for signature'], 'governance.approve': ['governance', 'Approved a resolution'],
  'governance.reject': ['governance', 'Rejected a resolution'], 'governance.party_add': ['governance', 'Added to the register'], 'credit.loan_book': ['credit', 'Booked a loan'],
  'credit.repayment': ['credit', 'Recorded a repayment'], 'credit.borrower_add': ['credit', 'Added a borrower'], 'credit.covenant_breached': ['credit', 'A covenant was breached'],
  'services.job_create': ['services', 'Opened a client job'], 'services.status': ['services', 'Updated a job status'], 'services.link_sent': ['services', 'Sent a client link'],
  'services.client_message': ['services', 'A client sent a message'], 'services.client_upload': ['services', 'A client uploaded a file'], 'services.note': ['services', 'Added a job note']
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const on = await enabledModules()
  const can = (code: string) => { const m = MODULES.find((x) => x.code === code); return !!m && on.has(code) && canUse(m, user.roles) }
  const n = (v: unknown) => Number(v ?? 0)
  const today = new Date().toISOString().slice(0, 10)
  const keys = seriesKeys('12m', 'month')
  const me = await db().query<{ name: string }>('SELECT p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])
  const org = await currentOrg()
  const attention: { tone: 'red' | 'amber' | 'blue'; text: string; to: string }[] = []
  const out: Record<string, unknown> = {}

  if (can('pitches') || can('pipeline') || can('portfolio')) {
    const vc: Record<string, unknown> = {}
    if (can('pitches')) {
      const p = await one<{ last30: number; fresh: number }>("SELECT count(*) FILTER (WHERE received_at > now() - interval '30 days')::int AS last30, count(*) FILTER (WHERE status = 'new')::int AS fresh FROM deals.pitches WHERE status <> 'spam'")
      const s = await db().query<{ b: string; v: number }>("SELECT to_char(date_trunc('month', received_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM deals.pitches WHERE status <> 'spam' AND received_at > now() - interval '12 months' GROUP BY 1")
      vc.pitches = { last30: p.last30, fresh: p.fresh, series: fillSeries(s.rows, keys) }
      if (p.fresh) attention.push({ tone: 'blue', text: p.fresh + ' new pitch' + (p.fresh === 1 ? '' : 'es') + ' to review', to: '/deals' })
    }
    if (can('pipeline')) {
      const d = await one<{ open: number; deployed: string; invested: number }>(
        "SELECT count(*) FILTER (WHERE stage NOT IN ('invested','passed'))::int AS open, coalesce(sum(check_usd) FILTER (WHERE stage = 'invested'), 0)::text AS deployed, count(*) FILTER (WHERE stage = 'invested')::int AS invested FROM deals.deals")
      const st = await db().query<{ stage: string; n: number }>("SELECT stage, count(*)::int AS n FROM deals.deals WHERE stage NOT IN ('invested','passed') GROUP BY stage")
      vc.pipeline = { open: d.open, deployed: n(d.deployed), invested: d.invested, byStage: Object.fromEntries(st.rows.map((r) => [r.stage, r.n])) }
    }
    if (can('portfolio')) {
      const c = await one<{ active: number }>('SELECT count(*)::int AS active FROM portfolio.companies WHERE active')
      const rev = await db().query<{ b: string; v: string }>(
        `SELECT to_char(period, 'YYYY-MM-DD') AS b, sum(coalesce(override_value, founder_value))::text AS v FROM portfolio.metric_values
          WHERE metric = 'revenue' AND coalesce(override_value, founder_value) IS NOT NULL AND period >= date_trunc('month', now()) - interval '12 months' GROUP BY 1`)
      const lastMonths = Array.from({ length: 12 }, (_, i) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12 + i, 1)).toISOString().slice(0, 10) })
      const series = fillSeries(rev.rows, lastMonths)
      const r = await one<{ sent: number; done: number }>("SELECT count(*)::int AS sent, count(*) FILTER (WHERE status = 'submitted')::int AS done FROM portfolio.requests WHERE period = date_trunc('month', now() - interval '1 month')::date")
      const latest = [...series].reverse().find((x) => x.value > 0)
      vc.portfolio = { active: c.active, revenue: latest?.value ?? 0, revenuePeriod: latest?.period ?? null, series, reportsSent: r.sent, reportsDone: r.done }
      if (r.sent > r.done) attention.push({ tone: 'amber', text: (r.sent - r.done) + ' founder update' + (r.sent - r.done === 1 ? '' : 's') + ' not yet submitted', to: '/portfolio' })
    }
    out.vc = vc
  }

  if (can('entities') || can('documents') || can('compliance') || can('banking') || can('governance')) {
    const fo: Record<string, unknown> = {}
    if (can('entities')) fo.entities = (await one<{ n: number }>("SELECT count(*)::int AS n FROM core.entities WHERE status = 'active'")).n
    if (can('documents')) fo.documents = (await one<{ n: number }>('SELECT count(*)::int AS n FROM core.documents')).n
    if (can('compliance')) {
      const c = await one<{ overdue: number; week: number; month: number }>(
        "SELECT count(*) FILTER (WHERE next_due < current_date)::int AS overdue, count(*) FILTER (WHERE next_due BETWEEN current_date AND current_date + 7)::int AS week, count(*) FILTER (WHERE next_due BETWEEN current_date AND current_date + 30)::int AS month FROM compliance.obligations WHERE active")
      fo.compliance = c
      if (c.overdue) attention.push({ tone: 'red', text: c.overdue + ' compliance item' + (c.overdue === 1 ? '' : 's') + ' overdue', to: '/compliance' })
      if (c.week) attention.push({ tone: 'amber', text: c.week + ' filing' + (c.week === 1 ? '' : 's') + ' due in the next 7 days', to: '/compliance' })
    }
    if (can('banking')) {
      const cash = await db().query<{ currency: string; v: string }>(
        `SELECT a.currency, sum(s.closing_balance)::text AS v FROM banking.accounts a
           JOIN LATERAL (SELECT closing_balance FROM banking.statements WHERE account_id = a.id ORDER BY period_end DESC LIMIT 1) s ON true WHERE a.active GROUP BY a.currency ORDER BY sum(s.closing_balance) DESC`)
      const main = cash.rows[0]?.currency ?? 'USD'
      const s = await db().query<{ b: string; v: string }>(
        `WITH months AS (SELECT (date_trunc('month', current_date) - (g || ' months')::interval + interval '1 month - 1 day')::date AS m FROM generate_series(0, 11) g)
         SELECT to_char(date_trunc('month', mo.m), 'YYYY-MM-DD') AS b, coalesce(sum(s.closing_balance), 0)::text AS v FROM months mo
           CROSS JOIN banking.accounts a JOIN LATERAL (SELECT closing_balance FROM banking.statements WHERE account_id = a.id AND period_end <= mo.m ORDER BY period_end DESC LIMIT 1) s ON true
          WHERE a.active AND a.currency = $1 GROUP BY 1`, [main])
      fo.cash = { byCurrency: cash.rows.map((r) => ({ currency: r.currency, value: n(r.v) })), main, series: fillSeries(s.rows, keys) }
    }
    if (can('governance')) {
      const g = await one<{ n: number }>("SELECT count(*)::int AS n FROM governance.resolutions WHERE status = 'circulating'")
      fo.circulating = g.n
      if (g.n) attention.push({ tone: 'blue', text: g.n + ' resolution' + (g.n === 1 ? '' : 's') + ' awaiting signatures', to: '/governance' })
    }
    out.fo = fo
  }

  if (can('credit')) {
    const loans = await db().query<{ id: string; principal: string; currency: string }>("SELECT id, principal::text, currency FROM credit.loans WHERE status = 'active' ORDER BY created_at DESC LIMIT 100")
    const book: Record<string, number> = {}
    let arrears = 0
    for (const l of loans.rows) {
      const pos = await loadPosition(l.id, Number(l.principal))
      book[l.currency] = (book[l.currency] ?? 0) + pos.outstandingPrincipal
      if (pos.arrears > 0) arrears++
    }
    out.credit = { active: loans.rows.length, outstanding: Object.entries(book).map(([currency, value]) => ({ currency, value })), arrears }
    if (arrears) attention.push({ tone: 'red', text: arrears + ' loan' + (arrears === 1 ? '' : 's') + ' in arrears', to: '/credit' })
  }

  if (can('services')) {
    const j = await one<{ open: number; overdue: number; week: number; done30: number }>(
      `SELECT count(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS open,
              count(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_date < current_date)::int AS overdue,
              count(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_date BETWEEN current_date AND current_date + 7)::int AS week,
              count(*) FILTER (WHERE status = 'completed' AND completed_at > now() - interval '30 days')::int AS done30 FROM services.jobs`)
    out.cs = j
    if (j.overdue) attention.push({ tone: 'red', text: j.overdue + ' client job' + (j.overdue === 1 ? '' : 's') + ' past due', to: '/services' })
  }

  const allowed = Object.entries(ACTIVITY).filter(([, [m]]) => can(m)).map(([a]) => a)
  const act = allowed.length ? await db().query<{ at: string; action: string; who: string | null }>(
    `SELECT a.at, a.action, p.full_name AS who FROM core.audit_log a LEFT JOIN core.users u ON u.id = a.actor_user_id LEFT JOIN core.people p ON p.id = u.person_id
      WHERE a.action = ANY($1::text[]) ORDER BY a.at DESC LIMIT 8`, [allowed]) : { rows: [] }
  const order = { red: 0, amber: 1, blue: 2 }
  return {
    name: me.rows[0]?.name ?? '', org: org?.name ?? '', today,
    ...out, attention: attention.sort((a, b) => order[a.tone] - order[b.tone]),
    activity: act.rows.map((r) => ({ at: r.at, who: r.who, text: ACTIVITY[r.action]![1], area: ACTIVITY[r.action]![0] })),
    quick: [can('pipeline') && { label: 'Add deal', to: '/pipeline' }, can('documents') && { label: 'Upload document', to: '/documents' }, can('compliance') && { label: 'Add obligation', to: '/compliance' }, can('services') && { label: 'New client job', to: '/services' }].filter(Boolean)
  }
})
