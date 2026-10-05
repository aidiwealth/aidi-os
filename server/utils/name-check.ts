// Business name check: naming rules for the state and entity type, our own records, and the public register
// (OpenCorporates covers every US state's register; needs NUXT_OPENCORPORATES_TOKEN). The state's own search is linked
// because only the Secretary of State can confirm availability.
const STATE_SEARCH: Record<string, string> = {
  Delaware: 'https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx', Wyoming: 'https://wyobiz.wyo.gov/Business/FilingSearch.aspx', Texas: 'https://www.sos.state.tx.us/corp/sosda/index.shtml',
  California: 'https://bizfileonline.sos.ca.gov/search/business', Florida: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName', 'New York': 'https://apps.dos.ny.gov/publicInquiry/',
  Arizona: 'https://ecorp.azcc.gov/EntitySearch/Index', Nevada: 'https://esos.nv.gov/EntitySearch/OnlineEntitySearch', Georgia: 'https://ecorp.sos.ga.gov/BusinessSearch', Illinois: 'https://apps.ilsos.gov/businessentitysearch/',
  Washington: 'https://ccfs.sos.wa.gov/#/BusinessSearch', Colorado: 'https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do', Massachusetts: 'https://corp.sec.state.ma.us/corpweb/corpsearch/CorpSearch.aspx' }
const CODE: Record<string, string> = { Alabama: 'al', Alaska: 'ak', Arizona: 'az', Arkansas: 'ar', California: 'ca', Colorado: 'co', Connecticut: 'ct', Delaware: 'de', 'District of Columbia': 'dc', Florida: 'fl', Georgia: 'ga', Hawaii: 'hi', Idaho: 'id', Illinois: 'il', Indiana: 'in', Iowa: 'ia', Kansas: 'ks', Kentucky: 'ky', Louisiana: 'la', Maine: 'me', Maryland: 'md', Massachusetts: 'ma', Michigan: 'mi', Minnesota: 'mn', Mississippi: 'ms', Missouri: 'mo', Montana: 'mt', Nebraska: 'ne', Nevada: 'nv', 'New Hampshire': 'nh', 'New Jersey': 'nj', 'New Mexico': 'nm', 'New York': 'ny', 'North Carolina': 'nc', 'North Dakota': 'nd', Ohio: 'oh', Oklahoma: 'ok', Oregon: 'or', Pennsylvania: 'pa', 'Rhode Island': 'ri', 'South Carolina': 'sc', 'South Dakota': 'sd', Tennessee: 'tn', Texas: 'tx', Utah: 'ut', Vermont: 'vt', Virginia: 'va', Washington: 'wa', 'West Virginia': 'wv', Wisconsin: 'wi', Wyoming: 'wy' }
const LLC = /\b(l\.?l\.?c\.?|limited liability company|limited company|ltd\.?)$/i
const CORP = /\b(inc\.?|incorporated|corp\.?|corporation|company|co\.?|limited|ltd\.?)$/i
const RESTRICTED = ['bank', 'banking', 'trust', 'insurance', 'assurance', 'reinsurance', 'federal', 'national', 'united states', 'usa', 'fbi', 'cia', 'treasury', 'university', 'college', 'olympic', 'attorney', 'engineering', 'architect', 'cooperative', 'credit union']
export const core = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/\b(the|l\.?l\.?c\.?|limited liability company|inc\.?|incorporated|corp\.?|corporation|company|co\.?|ltd\.?|limited)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
export interface NameResult { name: string; state: string; status: 'available' | 'taken' | 'similar' | 'unknown'; issues: string[]; matches: { name: string; status: string | null; incorporated: string | null; exact: boolean; source: string }[]; register_checked: boolean; official_search: string | null; suggestion: string }
export async function checkName(name: string, state: string, type: 'llc' | 'corp', ownMatches: string[]): Promise<NameResult> {
  const n = name.trim().replace(/\s+/g, ' ')
  const issues: string[] = []
  if (type === 'llc' && !LLC.test(n)) issues.push('An LLC name must end with "LLC" (or "Limited Liability Company"). Try "' + n + ' LLC".')
  if (type === 'corp' && !CORP.test(n)) issues.push('A corporation name must end with "Inc.", "Corp." or "Corporation". Try "' + n + ' Inc.".')
  const low = ' ' + n.toLowerCase() + ' '
  const bad = RESTRICTED.filter((w) => low.includes(' ' + w + ' '))
  if (bad.length) issues.push('"' + bad.join('", "') + '" usually needs approval from a regulator or licensing body in ' + state + '. Avoid it unless you hold that licence.')
  if (core(n).length < 2) issues.push('Add a distinctive word; the name is too short once the ending is removed.')
  const matches: NameResult['matches'] = ownMatches.map((m) => ({ name: m, status: 'Aidi record', incorporated: null, exact: core(m) === core(n), source: 'Aidi' }))
  let checked = false
  const token = useRuntimeConfig().opencorporatesToken as string
  const code = CODE[state]
  if (token && code) {
    try {
      const r = await fetch('https://api.opencorporates.com/v0.4/companies/search?q=' + encodeURIComponent(core(n)) + '&jurisdiction_code=us_' + code + '&per_page=30&api_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(12000) })
      if (r.ok) {
        checked = true
        const j = await r.json() as { results?: { companies?: { company: { name: string; current_status: string | null; incorporation_date: string | null } }[] } }
        for (const c of j.results?.companies ?? []) {
          const exact = core(c.company.name) === core(n)
          if (exact || core(c.company.name).startsWith(core(n))) matches.push({ name: c.company.name, status: c.company.current_status, incorporated: c.company.incorporation_date, exact, source: 'State register' })
        }
      } else console.error('[name-check] opencorporates', r.status)
    } catch (err) { console.error('[name-check]', err) }
  }
  const exactActive = matches.some((m) => m.exact && !/dissolved|inactive|cancel|revoked|forfeit|void|withdrawn/i.test(m.status ?? ''))
  const status: NameResult['status'] = exactActive ? 'taken' : matches.length ? 'similar' : checked ? 'available' : 'unknown'
  return { name: n, state, status, issues, matches: matches.slice(0, 12), register_checked: checked, official_search: STATE_SEARCH[state] ?? null,
    suggestion: status === 'taken' ? 'This name is already registered in ' + state + '. Pick a different name.' : status === 'similar' ? 'Similar names exist. The state may reject names that are not clearly different; adding a distinctive word helps.' : status === 'available' ? 'No registered company with this name was found in ' + state + '. The Secretary of State confirms availability when we file.' : 'We could not search the ' + state + ' register automatically. Check the official search below; we confirm availability before filing.' }
}
