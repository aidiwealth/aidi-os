// Which company's customer revenue a request works on (142_entity_customers.sql). ?cust=<entity id> names a company;
// ?cust=group (or nothing, in a group) reads every company and the app combines them. A workspace with one company
// always works on it, so its uploads and settings land on it. Someone limited to some companies only ever gets one of
// theirs, never the group.
import type { H3Event } from 'h3'
export interface CustEntity { id: string; name: string; currency: string | null; main: boolean }
export async function custEntities(): Promise<CustEntity[]> {
  const subs = await subsidiariesAllowed()
  return (await db().query<CustEntity>("SELECT id, name, currency, parent_id IS NULL AS main FROM core.entities WHERE kind = 'operating' AND status <> 'closed'" + (subs ? '' : ' AND parent_id IS NULL') + ' ORDER BY (parent_id IS NOT NULL), created_at').catch(() => ({ rows: [] as CustEntity[] }))).rows
}
// Subsidiaries (their own Financials, customers and forecasts, and the group) are part of the Scale plan. On another
// plan they are kept but not shown, and come back when the company moves to Scale. Aidi OS is not limited.
export async function subsidiariesAllowed(): Promise<boolean> {
  const org = await currentOrg()
  return !org || org.kind !== 'company' || org.plan_code === 'company_scale'
}
export async function resolveCustEntity(event: H3Event): Promise<string> {
  const q = getQuery(event).cust
  const ents = await custEntities()
  const scoped = !!(event.context.entityScope as string | undefined)
  if (typeof q === 'string' && ents.some((e) => e.id === q)) return q
  if (ents.length === 1 || (scoped && ents.length)) return ents[0]!.id
  return ''
}
// The company this request works on, or null for the group (every company combined).
export function custEntityId(): string | null {
  try { return (useEvent().context.custEntity as string | undefined) || null } catch { return null }
}
// Customer changes (uploads, settings, edits) need one company: in a group, the page must say which.
export function requireCustEntity(): string {
  const id = custEntityId()
  if (!id) throw apiError('choose_company', 'Choose which company this is for: customer revenue is kept per company and combined for the group.', 400)
  return id
}
// Run something across every company's customer revenue whatever company this request is on (e.g. which companies
// have data yet, for the company switcher).
export async function withAllCompanies<T>(fn: () => Promise<T>): Promise<T> {
  const e = useEvent(), was = e.context.custEntity
  e.context.custEntity = ''
  try { return await fn() } finally { e.context.custEntity = was }
}
// Customer revenue that goes with a Financials subject: a company's own ('entity:<operating id>'), or every company's
// combined for the group. Anything else (a fund, a portfolio company) has none.
export async function custForSubject(subject: string): Promise<string | null> {
  if (subject === 'group') return ''
  const m = /^entity:([0-9a-f-]{36})$/.exec(subject)
  return m && (await custEntities()).some((e) => e.id === m[1]) ? m[1]! : null
}
export async function withCustFor<T>(subject: string, fn: () => Promise<T>): Promise<T | null> {
  const c = await custForSubject(subject)
  if (c === null) return null
  const e = useEvent(), was = e.context.custEntity
  e.context.custEntity = c
  try { return await fn() } finally { e.context.custEntity = was }
}
// The currency a subject's figures are read in: the group in the reporting currency (else the company's).
export async function subjectCurrency(subject: string): Promise<string> {
  const org = await currentOrg()
  const base = (org?.settings.currency as string) || 'USD'
  return subject === 'group' ? ((org?.settings.reporting_currency as string) || base) : base
}
