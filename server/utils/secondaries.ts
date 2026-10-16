// Secondaries deal flow: SPV and secondary opportunities read from Meridian (AngelList) and Wefunder emails that
// arrive in Notices. Plain parsing of the email text (no AI), so the same email always gives the same deals; each
// opportunity is kept once (by its id in the link), so repeated alerts don't duplicate it.
export interface SecDeal { source: 'meridian' | 'wefunder'; ref: string; title: string; company: string | null; sector: string | null; stage: string | null; lead: string | null; co_investors: string | null; min_investment: number | null; valuation: string | null; url: string; closes_at?: string | null }

export const secondarySource = (from: string, subject: string, text: string): 'meridian' | 'wefunder' | null =>
  /angellist\.com/i.test(from) || /meridian/i.test(subject) && /angellist/i.test(text) ? 'meridian' : /wefunder\.com/i.test(from) || /wefunder/i.test(subject) ? 'wefunder' : null

const money = (s: string | undefined): number | null => {
  if (!s) return null
  const m = s.replace(/,/g, '').match(/\$?\s*([\d.]+)\s*([kKmM](?![a-z]))?/i); if (!m) return null
  const n = Number(m[1]) * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1); return Number.isFinite(n) ? n : null
}
const clean = (s: string) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim()

// A closing date in the alert text: "closes Oct 30", "closing on 10/30/2026", "deadline: 2026-10-30", "ends in 5 days",
// "5 days left". Returns YYYY-MM-DD or null.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
export function closeOf(text: string, base = new Date()): string | null {
  const t = text.toLowerCase().replace(/\*/g, '')
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  let m = t.match(/(?:closes?|closing|ends?|deadline|expires?|last day)[^.\n]{0,20}?\bin\s+(\d{1,3})\s+(day|week)s?/) ?? t.match(/(\d{1,3})\s+(day|week)s?\s+(?:left|remaining|to go)/)
  if (m) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + Number(m[1]) * (m[2] === 'week' ? 7 : 1)); return iso(d) }
  const near = t.match(/(?:closes?|closing|ends?|deadline|expires?|last day)[^\n]{0,30}/g)?.join(' ') ?? ''
  m = near.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]
  m = near.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return iso(new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])))) }
  m = near.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/)
  if (m) { let y = m[3] ? Number(m[3]) : base.getUTCFullYear(); const mo = MONTHS.indexOf(m[1]!); const d = new Date(Date.UTC(y, mo, Number(m[2]))); if (!m[3] && d < base) { y++; d.setUTCFullYear(y) } return iso(d) }
  return null
}

// Meridian: each opportunity is a block of lines ending with its portal link (…opportunityId=…).
export function parseMeridian(text: string): SecDeal[] {
  const lines = text.replace(/\r/g, '').split('\n')
  // Links are often wrapped onto their own line in <…>; join a link split over lines.
  const joined: string[] = []
  for (const l of lines) { const t = l.trim(); if (joined.length && /<https?:\/\/[^>]*$/.test(joined[joined.length - 1]!) ) joined[joined.length - 1] += t; else joined.push(t) }
  const out: SecDeal[] = []; let block: string[] = []
  for (const l of joined) {
    const link = l.match(/<?(https:\/\/portal\.angellist\.com\/[^\s>]+)>?/)
    const ref = link ? decodeURIComponent(link[1]!).match(/opportunityId=([0-9a-z][0-9a-z-]{5,63})/i)?.[1] : undefined
    if (link && ref) {
      const body = block.filter((x) => x && !/^(hi|hello)\b/i.test(x) && !/based on your profile/i.test(x) && !/^<https?:/.test(x) && !/meridian\.angellist\.com\/?>?\.?$/i.test(x))
      const get = (k: string) => body.find((x) => new RegExp('^\\*?' + k + ':?\\*?\\s*:?', 'i').test(x))?.replace(new RegExp('^\\*?' + k + ':?\\*?\\s*:?', 'i'), '').trim()
      const plain = body.filter((x) => !/^\*?(lead|co|min investment|valuation)\b/i.test(x))
      if (!plain[0]) { block = []; continue }
      const title = clean(plain[0])
      const tags = plain[1] ? clean(plain[1]) : ''
      const st = tags.match(/\b(Pre-?seed|Seed|Series [A-H]\+?|Growth|Late stage|Secondary|Public)(?=\s|$)/i)?.[0] ?? null
      out.push({ closes_at: closeOf(body.join('\n')), source: 'meridian', ref, title: title.slice(0, 500), company: null, sector: (st ? tags.replace(st, '') : tags).trim().slice(0, 120) || null, stage: st, lead: get('Lead') ? clean(get('Lead')!).slice(0, 300) : null,
        co_investors: get('Co') ? clean(get('Co')!).slice(0, 300) : null, min_investment: money(get('Min investment')), valuation: get('Valuation') ? clean(get('Valuation')!).slice(0, 120) : null, url: link[1]!.slice(0, 1000) })
      block = []
    } else if (/^view all|^you can manage|^best,?$/i.test(l)) block = []
    else if (l) block.push(l)
  }
  return out.filter((d) => d.title && d.ref)
}

// Wefunder: one deal per wefunder.com/<company> link. The company is the link text (or the address); the lines just
// before and after it describe it ("Banking stack for startups", "$120M raised at $1.62B valuation, led by Coatue").
export function parseWefunder(text: string): SecDeal[] {
  const SKIP = /^(about|faq|explore|settings|unsubscribe|users?|notifications|account|login|signup|invest|portfolio|updates|terms|privacy|help|raise|community|blog|press|careers|ir|cash|vault|learn|founders|investors?|syndicates?|funds?|spv|pricing|api)$/i
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim())
  const seen = new Set<string>(), out: SecDeal[] = []
  const strip = (x: string) => x.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<?https?:\/\/\S+>?/g, '').trim()
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/https?:\/\/(?:www\.)?wefunder\.com\/([a-z0-9][a-z0-9-]{1,60})(?:[/?#][^\s>)]*)?/gi)) {
      const slug = m[1]!.toLowerCase(); if (SKIP.test(slug) || seen.has(slug)) continue
      seen.add(slug)
      const named = l.match(/\[([^\]]{1,80})\]\(https?:\/\/(?:www\.)?wefunder\.com\//i)?.[1]
      const company = (named ?? strip(l)) || slug.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ')
      const after: string[] = []; for (let j = i + 1; j < lines.length && j <= i + 4 && lines[j] && !/wefunder\.com\/[a-z0-9]/i.test(lines[j]!); j++) after.push(strip(lines[j]!))
      const before: string[] = []; for (let j = i - 1; j >= 0 && j >= i - 3 && lines[j] && !/wefunder\.com\/[a-z0-9]/i.test(lines[j]!); j--) before.unshift(strip(lines[j]!))
      const ctx = [...before, ...after].filter((x) => x && !/^(hi|hello)\b/i.test(x))
      const all = ctx.join(' ')
      const desc = ctx.filter((x) => !/minimum|valuation|raised|invest now|wefunder|days? left|closes|\$\d/i.test(x) && x.toLowerCase() !== company.toLowerCase())
      const min = all.match(/\$[\d,.]+[kKmM]?\s*(?:minimum|min)/i)?.[0] ?? all.match(/min(?:imum)?(?: investment)?:?\s*\$[\d,.]+[kKmM]?/i)?.[0]
      const val = all.match(/\$[\d,.]+\s*[kKmMbB]\w*\s*(?:post-money\s*)?(?:valuation|cap)/i)?.[0] ?? all.match(/(?:valuation|cap)\s*(?:of)?\s*\$[\d,.]+\s*[kKmMbB]?/i)?.[0]
      const raised = all.match(/\$[\d,.]+\s*[kKmMbB]\s*raised/i)?.[0]
      const lead = all.match(/led by\s+([^,.;&]+)/i)?.[1]?.trim() ?? null
      const co = all.match(/(?:incl\.?|including)\s+([^.;]+)/i)?.[1]?.replace(/^\s*(and\s+)/, '').trim() ?? null
      out.push({ source: 'wefunder', ref: slug, title: clean(desc[0] ?? company).replace(/\*+$/, '').slice(0, 500), company: company.slice(0, 200), sector: null, stage: stageOf(all), lead: lead ? lead.slice(0, 300) : null, co_investors: co ? co.slice(0, 300) : null,
        min_investment: money(min), valuation: val ? clean([raised, val].filter(Boolean).join(' at ')).slice(0, 120) : raised ? clean(raised).slice(0, 120) : null, url: m[0].replace(/[>.,)]+$/, '').slice(0, 1000), closes_at: closeOf(all) })
    }
  })
  return out
}

// From a notice: adds new opportunities (existing ones are left as they are). Returns how many were added.
export async function ingestSecondaries(n: { id: string; from_email: string | null; subject: string; text_body: string | null; html_body?: string | null; received_at?: string }): Promise<number> {
  const src = secondarySource(n.from_email ?? '', n.subject, n.text_body ?? '')
  if (!src) return 0
  const text = n.text_body || (n.html_body ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' <$1> ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  const deals = src === 'meridian' ? parseMeridian(text) : parseWefunder(text)
  const crit = await secCriteria()
  let added = 0
  for (const d of deals) {
    const fit = fitOf(d, crit)
    const r = await db().query(`INSERT INTO wm.secondaries (source, ref, title, company, sector, stage, lead, co_investors, min_investment, valuation, url, notice_id, received_at, fits, fit_note, status, closes_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, coalesce($13::timestamptz, now()), $14, $15, $16, coalesce($17::date, (coalesce($13::timestamptz, now()) + make_interval(days => $18))::date)) ON CONFLICT (organization_id, source, ref) WHERE ref IS NOT NULL DO NOTHING`,
      [d.source, d.ref, d.title, d.company, d.sector, d.stage, d.lead, d.co_investors, d.min_investment, d.valuation, d.url, n.id, n.received_at ?? null, fit.fits, fit.note, fit.fits === false ? 'passed' : 'new', d.closes_at ?? null, crit.expiry_days])
    added += r.rowCount ?? 0
  }
  return added
}

// What we invest in: allowed stages and focus sectors (Wealth management → Secondaries → Criteria). Deals outside
// them are filed under Passed with the reason; deals whose stage or sector the alert doesn't say stay in New.
export interface SecCriteria { stages: string[]; sectors: string[]; expiry_days: number }
export const SEC_STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth']
export const SEC_DEFAULT: SecCriteria = { stages: ['Seed', 'Series A', 'Series B'], sectors: ['AI/ML', 'Enterprise', 'SaaS', 'Fintech'], expiry_days: 21 }
const SECTOR_WORDS: Record<string, string[]> = { 'ai/ml': ['ai', 'ml', 'a.i.', 'artificial intelligence', 'machine learning', 'llm', 'genai', 'ai-native', 'ai native'], enterprise: ['enterprise', 'b2b'], saas: ['saas', 'software', 'b2b software'], fintech: ['fintech', 'payments', 'banking', 'lending', 'insurtech', 'financial', 'wealthtech', 'regtech'] }
export async function secCriteria(): Promise<SecCriteria> {
  const s = ((await currentOrg())?.settings as Record<string, unknown> | undefined)?.secondaries as Partial<SecCriteria> | undefined
  return { stages: Array.isArray(s?.stages) ? s!.stages : SEC_DEFAULT.stages, sectors: Array.isArray(s?.sectors) ? s!.sectors : SEC_DEFAULT.sectors, expiry_days: Number.isInteger(s?.expiry_days) && s!.expiry_days! > 0 ? s!.expiry_days! : SEC_DEFAULT.expiry_days }
}
export function stageOf(text: string | null): string | null {
  const t = (text ?? '').toLowerCase()
  if (/pre-?seed/.test(t)) return 'Pre-seed'
  if (/\bseed\b/.test(t)) return 'Seed'
  if (/series a\b/.test(t)) return 'Series A'
  if (/series b\b/.test(t)) return 'Series B'
  if (/series [c-h]\b/.test(t)) return 'Series C+'
  if (/growth|late stage|pre-ipo/.test(t)) return 'Growth'
  return null
}
export function fitOf(d: { stage: string | null; sector: string | null; title: string }, c: SecCriteria): { fits: boolean | null; note: string | null } {
  const st = stageOf(d.stage), hay = ' ' + [d.sector, d.title].filter(Boolean).join(' ').toLowerCase().replace(/\s*\/\s*/g, '/') + ' '
  const has = (w: string) => new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '($|[^a-z])').test(hay)
  const sectorHit = c.sectors.some((s) => { const k = s.toLowerCase().replace(/\s*\/\s*/g, '/'); return [k, ...(SECTOR_WORDS[k] ?? [])].some(has) })
  const reasons: string[] = []
  if (st && !c.stages.includes(st)) reasons.push(st + ' is outside our stages')
  if (d.sector && !sectorHit) reasons.push((d.sector || 'sector') + ' is outside our focus')
  if (reasons.length) return { fits: false, note: reasons.join('; ') }
  if (st && sectorHit) return { fits: true, note: null }
  return { fits: null, note: !st && !sectorHit ? 'Stage and sector not stated' : !st ? 'Stage not stated' : 'Sector not clear' }
}

// Open deals past their closing date are marked expired (ones with a recorded investment are left alone).
export async function expireSecondaries(): Promise<number> {
  const r = await db().query("UPDATE wm.secondaries s SET status = 'expired', updated_at = now() WHERE s.status IN ('new','reviewing','interested') AND s.closes_at < current_date AND NOT EXISTS (SELECT 1 FROM wealth.holdings h WHERE h.meta->>'secondary_id' = s.id::text)")
  return r.rowCount ?? 0
}
