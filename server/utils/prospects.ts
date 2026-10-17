// Find investors and grants for a round: a curated list (kept by the Finvry team) ranked by how well each fits the
// company's location, stage, sector and the amount being raised. Founders add the ones they like to a pipeline.
export const RAISE_STAGES = ['idea', 'pre_seed', 'seed', 'series_a', 'series_b', 'growth'] as const
export const RAISE_STAGE_LABEL: Record<string, string> = { idea: 'Idea', pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', growth: 'Growth' }
export const RAISE_SECTORS = ['fintech', 'health', 'education', 'saas', 'commerce', 'logistics', 'climate', 'agriculture', 'hardware', 'deep_tech', 'media', 'mobility', 'proptech', 'other'] as const
export const RAISE_SECTOR_LABEL: Record<string, string> = { fintech: 'Fintech', health: 'Health', education: 'Education', saas: 'Software / SaaS', commerce: 'Commerce', logistics: 'Logistics', climate: 'Climate & energy', agriculture: 'Agriculture', hardware: 'Hardware', deep_tech: 'Deep tech & AI', media: 'Media', mobility: 'Mobility', proptech: 'Property', other: 'Other' }
export const PROSPECT_TYPE_LABEL: Record<string, string> = { vc: 'Venture fund', angel_network: 'Angel network', accelerator: 'Accelerator', corporate: 'Corporate', government: 'Government grant', foundation: 'Foundation grant', competition: 'Prize / competition', credits: 'Credits & perks', dfi: 'Development finance', lender: 'Lender / private credit', other: 'Other' }
const AFRICA = new Set(['Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cameroon', 'Central African Republic', 'Chad', 'Comoros', 'Congo (Republic)', 'Congo (Democratic Republic)', "Côte d'Ivoire", 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe'])

export interface Prospect { id: string; kind: 'investor' | 'grant'; name: string; type: string; regions: string[]; stages: string[]; sectors: string[]; min_usd: number | null; max_usd: number | null; website: string | null; description: string | null; how_to_apply: string | null; deadline: string | null; active: boolean; updated_at: string }
export interface Match extends Prospect { score: number; reasons: string[] }

const money = (n: number) => '$' + (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n))
export async function allProspects(activeOnly = true): Promise<Prospect[]> {
  return (await asPlatform(() => db().query<Prospect>(`SELECT id, kind, name, type, regions, stages, sectors, min_usd::float, max_usd::float, website, description, how_to_apply, deadline, active, updated_at FROM crm.prospects ${activeOnly ? 'WHERE active' : ''} ORDER BY kind, name`))).rows
}

// Score each prospect against the round: location (country, then region, then global), stage, sector, amount.
export function rankProspects(list: Prospect[], q: { country?: string; stage?: string; sectors?: string[]; amount?: number | null }): Match[] {
  const country = (q.country ?? '').trim(), region = AFRICA.has(country) ? 'Africa' : country === 'United States' ? 'North America' : ''
  const out: Match[] = []
  for (const p of list) {
    let score = 0; const why: string[] = []
    const regs = p.regions.map((r) => r.toLowerCase())
    if (country && regs.includes(country.toLowerCase())) { score += 40; why.push((p.kind === 'grant' ? 'Open to ' : 'Invests in ') + country) }
    else if (region && regs.includes(region.toLowerCase())) { score += 32; why.push('Focus on ' + region) }
    else if (regs.includes('global')) { score += 18; why.push('Global') }
    else if (country) continue // outside the company's location
    if (q.stage) { if (p.stages.includes(q.stage)) { score += 30; why.push(RAISE_STAGE_LABEL[q.stage] + ' stage') } else if (!p.stages.length) score += 10; else score -= 10 }
    const sec = (q.sectors ?? []).filter((s) => p.sectors.includes(s))
    if (sec.length) { score += 20; why.push(sec.map((s) => RAISE_SECTOR_LABEL[s] ?? s).join(', ')) } else if (!p.sectors.length) { score += 10; why.push('Any sector') }
    if (q.amount && (p.min_usd || p.max_usd)) {
      const lo = p.min_usd ?? 0, hi = p.max_usd ?? Infinity
      if (q.amount >= lo && (q.amount <= hi * 4 || p.kind === 'grant')) { score += 10; why.push(p.min_usd === p.max_usd && p.min_usd ? money(p.min_usd) : (p.min_usd ? money(p.min_usd) : '') + (p.max_usd ? '–' + money(p.max_usd) : '+')) }
    }
    out.push({ ...p, score: Math.max(0, Math.min(100, score)), reasons: why })
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

// Create a fundraising pipeline with the standard stages (as the Fundraising page does).
export async function createPipeline(input: { name: string; currency: string; target: number | null; instrument?: string }): Promise<string> {
  const id = (await one<{ id: string }>('INSERT INTO crm.pipelines (name, currency, target, instrument) VALUES ($1,$2,$3,$4) RETURNING id', [input.name.slice(0, 120), ['USD', 'NGN'].includes(input.currency) ? input.currency : 'USD', input.target, input.instrument ?? 'safe'])).id
  const STD: [string, string, string][] = [['Contacted', 'grey', 'open'], ['Meeting', 'blue', 'open'], ['Diligence', 'purple', 'open'], ['Term sheet', 'teal', 'committed'], ['Committed', 'amber', 'committed'], ['Closed', 'green', 'won'], ['Passed', 'red', 'lost']]
  for (const [i, s] of STD.entries()) await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [id, s[0], s[1], s[2], i])
  return id
}
