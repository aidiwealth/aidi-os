// Deals from a founder's CRM (HubSpot, Pipedrive), read-only, laid out as a table with the same headings an export
// would have, so they go through the same column and stage matching, review and accept as a sheet. Finvry does not
// replace the CRM: it reads deals to build the pipeline view and report investors expect.
type Cell = string | number | null
export interface CrmTable { headers: string[]; rows: Cell[][] }
export const CRM_HEADERS = ['Record ID', 'Deal name', 'Company name', 'Contact name', 'Amount', 'Deal stage', 'Deal status', 'Close date', 'Deal owner']
export const CRMS: Record<string, { label: string; key: string; help: string }> = {
  hubspot: { label: 'HubSpot', key: 'Private app access token', help: 'In HubSpot: Settings → Integrations → Private apps → Create a private app with the scopes crm.objects.deals.read, crm.objects.companies.read and crm.objects.owners.read, then copy its access token.' },
  pipedrive: { label: 'Pipedrive', key: 'Personal API token', help: 'In Pipedrive: your name (top right) → Personal preferences → API → copy your personal API token.' },
}
const MAX = 2000
type Get = (url: string, init?: RequestInit) => Promise<unknown>
const getter = (headers: Record<string, string>): Get => async (url, init) => {
  const r = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined), accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).catch(() => { throw apiError('crm_unreachable', 'Could not reach the CRM just now. Try again shortly.', 502) })
  if (r.status === 401 || r.status === 403) throw apiError('crm_auth', 'The CRM did not accept that key. Check it has read access to deals.', 400)
  if (!r.ok) throw apiError('crm_error', 'The CRM did not answer (error ' + r.status + '). Try again shortly.', 502)
  return r.json()
}

export async function hubspotDeals(token: string, get: Get = getter({ authorization: 'Bearer ' + token })): Promise<CrmTable> {
  const base = 'https://api.hubapi.com'
  const pipes = (await get(base + '/crm/v3/pipelines/deals')) as { results?: { stages?: { id: string; label: string; metadata?: { isClosed?: string; probability?: string } }[] }[] }
  const stage = new Map<string, { label: string; status: string }>()
  for (const p of pipes.results ?? []) for (const s of p.stages ?? []) stage.set(s.id, { label: s.label, status: s.metadata?.isClosed === 'true' ? (Number(s.metadata?.probability) >= 1 ? 'won' : 'lost') : 'open' })
  const owners = new Map<string, string>()
  try { const o = (await get(base + '/crm/v3/owners?limit=500')) as { results?: { id: string; email?: string; firstName?: string; lastName?: string }[] }; for (const x of o.results ?? []) owners.set(String(x.id), x.email || [x.firstName, x.lastName].filter(Boolean).join(' ')) } catch { /* owners are optional */ }
  const deals: { id: string; p: Record<string, string | null>; company?: string }[] = []
  let after: string | undefined
  do {
    const r = (await get(base + '/crm/v3/objects/deals?limit=100&archived=false&associations=companies&properties=dealname,amount,dealstage,closedate,hubspot_owner_id' + (after ? '&after=' + encodeURIComponent(after) : ''))) as { results?: { id: string; properties: Record<string, string | null>; associations?: { companies?: { results?: { id: string }[] } } }[]; paging?: { next?: { after?: string } } }
    for (const d of r.results ?? []) deals.push({ id: d.id, p: d.properties, company: d.associations?.companies?.results?.[0]?.id })
    after = r.paging?.next?.after
  } while (after && deals.length < MAX)
  // Company names for the deals' first associated company, a hundred at a time.
  const ids = [...new Set(deals.map((d) => d.company).filter((x): x is string => !!x))], names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    try { const r = (await get(base + '/crm/v3/objects/companies/batch/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ properties: ['name'], inputs: ids.slice(i, i + 100).map((id) => ({ id })) }) })) as { results?: { id: string; properties: { name?: string } }[] }; for (const c of r.results ?? []) if (c.properties.name) names.set(c.id, c.properties.name) } catch { break }
  }
  return { headers: CRM_HEADERS, rows: deals.slice(0, MAX).map((d) => { const s = stage.get(d.p.dealstage ?? ''); return ['hubspot:' + d.id, d.p.dealname ?? '', d.company ? names.get(d.company) ?? null : null, null, d.p.amount ? Number(d.p.amount) : null, s?.label ?? d.p.dealstage ?? null, s?.status ?? null, d.p.closedate ? d.p.closedate.slice(0, 10) : null, d.p.hubspot_owner_id ? owners.get(d.p.hubspot_owner_id) ?? null : null] }) }
}

export async function pipedriveDeals(token: string, get: Get = getter({ 'x-api-token': token })): Promise<CrmTable> {
  const base = 'https://api.pipedrive.com/v1'
  const st = (await get(base + '/stages')) as { data?: { id: number; name: string }[] | null }
  const stage = new Map((st.data ?? []).map((s) => [s.id, s.name]))
  const rows: Cell[][] = []
  let start: number | null = 0
  while (start !== null && rows.length < MAX) {
    const r = (await get(base + '/deals?status=all_not_deleted&limit=500&start=' + start)) as { data?: { id: number; title: string; value: number | null; stage_id: number; status: string; expected_close_date: string | null; org_name?: string | null; person_name?: string | null; owner_name?: string | null; user_id?: { email?: string; name?: string } | number | null }[] | null; additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } } }
    for (const d of r.data ?? []) { const u = typeof d.user_id === 'object' && d.user_id ? d.user_id : null; rows.push(['pipedrive:' + d.id, d.title, d.org_name ?? null, d.person_name ?? null, d.value ?? null, stage.get(d.stage_id) ?? null, d.status === 'won' || d.status === 'lost' ? d.status : 'open', d.expected_close_date, u?.email || u?.name || d.owner_name || null]) }
    start = r.additional_data?.pagination?.more_items_in_collection ? r.additional_data.pagination.next_start ?? null : null
  }
  return { headers: CRM_HEADERS, rows: rows.slice(0, MAX) }
}

export async function crmTable(source: string, secretEnc: string | null): Promise<CrmTable> {
  if (!secretEnc) throw apiError('crm_auth', 'Reconnect the CRM: its key is missing.', 400)
  const token = decryptText(secretEnc)
  if (source === 'hubspot') return hubspotDeals(token)
  if (source === 'pipedrive') return pipedriveDeals(token)
  throw apiError('invalid', 'Unknown connection.', 400)
}
