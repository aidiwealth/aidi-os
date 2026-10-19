// People (staff and consultants), their agreements and payments, what is due and what needs attention (admins).
export default defineEventHandler(async (event) => {
  await requireTeamManager(event)
  const people = (await db().query<HrPerson & { phone: string | null; location: string | null; notes: string | null; user_id: string | null }>(`SELECT p.id, p.user_id, p.name, p.email, p.phone, p.kind, p.title, p.entity_id, e.name AS entity, p.location, to_char(p.start_date, 'YYYY-MM-DD') AS start_date, to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
      to_char(p.contract_end, 'YYYY-MM-DD') AS contract_end, p.pay_amount::float, p.currency, p.pay_frequency, p.pay_day, p.status, p.notes FROM hr.people p LEFT JOIN core.entities e ON e.id = p.entity_id ORDER BY (p.status = 'ended'), p.name`)).rows
  const agreements = (await db().query<HrAgreement & { id: string; document_id: string | null; starts_on: string | null; signed_on: string | null }>("SELECT id, person_id, kind, title, document_id, status, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, to_char(signed_on, 'YYYY-MM-DD') AS signed_on, to_char(created_at, 'YYYY-MM-DD') AS created_at FROM hr.agreements ORDER BY created_at DESC")).rows
  const payments = (await db().query<HrPay & { id: string; method: string | null; reference: string | null; expense_id: string | null; notes: string | null }>("SELECT id, person_id, period, amount::float, currency, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, method, reference, expense_id, notes FROM hr.payments ORDER BY paid_on DESC LIMIT 2000")).rows
  const today = new Date().toISOString().slice(0, 10)
  const st = hrStatus(people, payments, agreements, today)
  const year = today.slice(0, 4)
  const paidYtd: Record<string, number> = {}; for (const p of payments) if (p.paid_on.startsWith(year)) paidYtd[p.currency] = (paidYtd[p.currency] ?? 0) + p.amount
  const team = (await db().query<{ id: string; name: string; email: string }>("SELECT u.id, coalesce(p.full_name, u.email) AS name, u.email FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id WHERE m.organization_id = core.current_org() AND m.status = 'active' ORDER BY 2")).rows
  const entities = (await db().query("SELECT id, name FROM core.entities WHERE status <> 'closed' AND kind NOT IN ('trust') ORDER BY name")).rows
  return { people, agreements, payments, due: st.due, flags: st.flags, monthly: monthlyCost(people), paid_ytd: paidYtd, team, entities, docs: HR_DOCS.map((k) => ({ key: k, ...DOC_TYPES[k] })), categories: await expenseCategoryNames() }
})
