// Who serves as registered agent for Finvry companies: a default (Republic Registered Agent LLC) and, optionally, a
// different agent for any US state. Kept in the services operator's settings; the team edits it under Prices & settings.
export interface RaAgent { name: string; address: string }
export interface RaAgents { default: RaAgent; states: Record<string, RaAgent> }
export const DEFAULT_RA_AGENT: RaAgent = { name: 'Republic Registered Agent LLC', address: '' }
export async function raAgents(): Promise<RaAgents> {
  const op = await operatorOrgId()
  const s = (await asPlatform(() => db().query<{ a: Partial<RaAgents> | null }>("SELECT settings->'ra_agents' AS a FROM core.organizations WHERE id = $1", [op]))).rows[0]?.a ?? {}
  return { default: { ...DEFAULT_RA_AGENT, ...(s.default ?? {}), name: s.default?.name || DEFAULT_RA_AGENT.name }, states: s.states ?? {} }
}
// "US-DE", "DE" or "Delaware" → "Delaware".
const ABBR: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' }
export function usState(j: string | null | undefined): string | null {
  const s = (j ?? '').trim(); if (!s) return null
  const code = s.replace(/^US-/i, '').toUpperCase()
  if (ABBR[code]) return ABBR[code]!
  const hit = Object.values(ABBR).find((n) => n.toLowerCase() === s.toLowerCase())
  return hit ?? null
}
export function agentFor(all: RaAgents, jurisdiction: string | null | undefined): RaAgent {
  const st = usState(jurisdiction)
  const a = st ? all.states[st] : undefined
  return a?.name ? a : all.default
}
