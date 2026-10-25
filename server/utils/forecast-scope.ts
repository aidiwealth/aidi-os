// Which company's forecasts a request works on (145_entity_forecasts.sql): ?cust=<entity id> is the company chosen
// at the top of Financials, ?cust=group the group forecast (every company's main forecast added together). With
// nothing named (Aidi OS, older links) it is the main company, as before.
import type { H3Event } from 'h3'
export interface ForecastScope { group: boolean; entity: string | null; name: string; currency: string; main: boolean; companies: CustEntity[] }
export async function forecastScope(event: H3Event): Promise<ForecastScope> {
  const org = await currentOrg()
  const base = (org?.settings.currency as string) || 'USD'
  const scoped = !!(event.context.entityScope as string | undefined)
  // Aidi OS Banking: ?cust= is the group (every company in the workspace) or any one of its companies, whatever its kind
  // (operating, holding, fund, trust). Without ?cust= nothing changes (forecasts keep the main company).
  const q = getQuery(event).cust
  if (org && org.kind !== 'company' && typeof q === 'string' && q) {
    const allow = String(event.context.entityScope ?? '').split(',').filter(Boolean)
    const all = (await db().query<CustEntity>("SELECT id, name, currency, false AS main FROM core.entities WHERE status <> 'closed' ORDER BY name")).rows.filter((e) => !allow.length || allow.includes(e.id))
    const one = all.find((e) => e.id === q) ?? (q === 'group' && allow.length ? all[0] : undefined)
    if (one) return { group: false, entity: one.id, name: one.name, currency: one.currency || base, main: false, companies: all }
    if (q === 'group') return { group: true, entity: null, name: String(org.settings.group_name ?? '').trim() || org.name, currency: (org.settings.reporting_currency as string) || base, main: false, companies: all }
  }
  const ents = await custEntities()
  if (getQuery(event).cust === 'group' && ents.length > 1 && !scoped)
    return { group: true, entity: null, name: await groupName(), currency: (org?.settings.reporting_currency as string) || base, main: false, companies: ents }
  const id = custEntityId() || (await companyEntityId())
  const e = ents.find((x) => x.id === id) ?? null
  return { group: false, entity: id, name: e?.name ?? org?.name ?? '', currency: e?.currency || base, main: e ? e.main : true, companies: ents }
}
