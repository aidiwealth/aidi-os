// Which company's forecasts a request works on (145_entity_forecasts.sql): ?cust=<entity id> is the company chosen
// at the top of Financials, ?cust=group the group forecast (every company's main forecast added together). With
// nothing named (Aidi OS, older links) it is the main company, as before.
import type { H3Event } from 'h3'
export interface ForecastScope { group: boolean; entity: string | null; name: string; currency: string; main: boolean; companies: CustEntity[] }
export async function forecastScope(event: H3Event): Promise<ForecastScope> {
  const org = await currentOrg()
  const base = (org?.settings.currency as string) || 'USD'
  const ents = await custEntities()
  const scoped = !!(event.context.entityScope as string | undefined)
  if (getQuery(event).cust === 'group' && ents.length > 1 && !scoped)
    return { group: true, entity: null, name: org?.name ?? '', currency: (org?.settings.reporting_currency as string) || base, main: false, companies: ents }
  const id = custEntityId() || (await companyEntityId())
  const e = ents.find((x) => x.id === id) ?? null
  return { group: false, entity: id, name: e?.name ?? org?.name ?? '', currency: e?.currency || base, main: e ? e.main : true, companies: ents }
}
