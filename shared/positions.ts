// Investor positions: what each holder has across rounds, how much they would own once SAFEs and notes convert, and
// who holds a power position (a large stake, a senior or multiple preference, board seats or vetoes), set against the
// founders. Planning figures: the documents decide.
import { table, type Data } from './captable'

export interface Right { id: string; holder_id: string | null; party: string | null; kind: string; summary: string; impact: string | null; terms: Record<string, unknown>; clause: string | null; document_id: string | null; doc_title?: string | null }
export interface Position {
  holder: { id: string; name: string; kind: string }
  rounds: string[]
  instruments: { label: string; round: string; amount: number | null; shares: number | null }[]
  unplaced: boolean
  pctFd: number
  pctConverted: number | null
  safeAmount: number
  rights: Right[]
  flags: { code: string; text: string }[]
  power: boolean
}
export const RIGHT_LABEL: Record<string, string> = { pro_rata: 'Pro rata', super_pro_rata: 'Super pro rata', information: 'Information rights', board_seat: 'Board seat', board_observer: 'Board observer', mfn: 'MFN', veto: 'Veto / protective provisions', rofr: 'Right of first refusal', co_sale: 'Co-sale', drag_along: 'Drag-along', tag_along: 'Tag-along', redemption: 'Redemption', anti_dilution: 'Anti-dilution', liquidation_pref: 'Liquidation preference', participation: 'Participation', vesting: 'Founder vesting', acceleration: 'Acceleration', other: 'Other right' }
// Rights that give a say over the company (control), not just money.
const CONTROL = new Set(['board_seat', 'veto', 'drag_along', 'redemption', 'anti_dilution', 'super_pro_rata'])

// The round a convertible belongs to: its attached document's round, else "SAFE, Mar 2024".
type DocRound = { convertible_id: string | null; issuance_id: string | null; round: string | null }
const mon = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function positions(d: Data, today: string, rights: Right[] = [], docs: DocRound[] = []): { rows: Position[]; founders: { pctFd: number; pctConverted: number | null; names: string[] }; investors: { pctFd: number; pctConverted: number | null }; warnings: string[]; converted: boolean } {
  const t = table(d, today)
  const fd = t.fd || 0
  const live = d.convertibles.filter((c) => c.status === 'outstanding')
  // As-converted: a post-money SAFE with a cap owns amount / cap after it converts; a pre-money SAFE or a note with a
  // cap about amount / (cap + amount). Uncapped ones convert at the next round's price, so they cannot be placed yet.
  const placeable = live.filter((c) => c.valuation_cap && c.valuation_cap > 0)
  const safePct = new Map<string, number>()
  for (const c of placeable) safePct.set(c.holder_id, (safePct.get(c.holder_id) ?? 0) + c.amount / (c.kind === 'safe' && c.post_money ? c.valuation_cap! : c.valuation_cap! + c.amount))
  const unplaced = new Set(live.filter((c) => !placeable.includes(c)).map((c) => c.holder_id))
  const S = Math.min(0.95, [...safePct.values()].reduce((a, b) => a + b, 0))
  const converted = placeable.length > 0 && placeable.length === live.length
  const cls = (id: string) => d.classes.find((c) => c.id === id)
  const docRound = (k: 'convertible_id' | 'issuance_id', id: string) => docs.find((x) => x[k] === id && x.round && x.round !== 'Other')?.round ?? null
  const fdOf = (hid: string) => t.rows.find((r) => r.holder.id === hid)?.fd ?? 0

  const rows: Position[] = d.holders.map((h) => {
    const instruments: Position['instruments'] = []
    const byClass = new Map<string, number>()
    for (const i of d.issuances.filter((x) => x.holder_id === h.id)) byClass.set(i.class_id, (byClass.get(i.class_id) ?? 0) + i.shares)
    for (const [cid, sh] of byClass) { const c = cls(cid); const ir = d.issuances.find((x) => x.holder_id === h.id && x.class_id === cid); instruments.push({ label: (c?.name ?? 'Shares'), round: (ir && docRound('issuance_id', ir.id)) || (c?.kind === 'common' ? 'Common' : c?.name ?? 'Shares'), amount: null, shares: sh }) }
    const opts = d.grants.filter((g) => g.holder_id === h.id && !g.cancelled_on).reduce((a, g) => a + g.shares, 0)
    if (opts) instruments.push({ label: 'Options', round: 'Options', amount: null, shares: opts })
    for (const c of live.filter((x) => x.holder_id === h.id)) instruments.push({ label: (c.kind === 'safe' ? 'SAFE' : 'Note') + (c.valuation_cap ? ' · ' + Math.round(c.valuation_cap / 1e5) / 10 + 'M cap' : ''), round: docRound('convertible_id', c.id) || (c.kind === 'safe' ? 'SAFE' : 'Note') + ', ' + mon(c.issued_on), amount: c.amount, shares: null })
    // Rounds: distinct funding rounds (options are not a round).
    const rounds = [...new Set(instruments.filter((x) => x.round !== 'Options').map((x) => x.round))]
    const pctFd = fd ? (fdOf(h.id) / fd) * 100 : 0
    const pctConverted = converted || safePct.size ? (fd ? (fdOf(h.id) / fd) * (1 - S) * 100 : 0) + (safePct.get(h.id) ?? 0) * 100 : null
    const hr = rights.filter((r) => r.holder_id === h.id)
    return { holder: { id: h.id, name: h.name, kind: h.kind }, rounds, instruments, pctFd, pctConverted, safeAmount: live.filter((x) => x.holder_id === h.id).reduce((a, c) => a + c.amount, 0), rights: hr, flags: [], power: false, unplaced: unplaced.has(h.id) }
  }).filter((r) => r.instruments.length || r.rights.length)

  const pctOf = (r: Position) => r.pctConverted ?? r.pctFd
  const founders = rows.filter((r) => r.holder.kind === 'founder')
  const investors = rows.filter((r) => r.holder.kind === 'investor')
  const fSum = founders.reduce((a, r) => a + pctOf(r), 0), iSum = investors.reduce((a, r) => a + pctOf(r), 0)
  const topFounder = Math.max(0, ...founders.map(pctOf))
  const largestInv = investors.slice().sort((a, b) => pctOf(b) - pctOf(a))[0]
  for (const r of rows) {
    if (r.holder.kind === 'founder') continue
    const p = pctOf(r)
    if (r.rounds.length > 1) r.flags.push({ code: 'multi', text: 'In ' + r.rounds.length + ' rounds: ' + r.rounds.join(', ') })
    if (p >= 10) r.flags.push({ code: 'stake', text: p.toFixed(1) + '% ' + (r.pctConverted != null ? 'as converted' : 'fully diluted') })
    if (r === largestInv && p >= 5 && investors.length > 1) r.flags.push({ code: 'largest', text: 'Largest investor' })
    if (topFounder && p > topFounder) r.flags.push({ code: 'over_founder', text: 'Owns more than any founder' })
    const prefs = r.instruments.map((x) => d.classes.find((c) => c.name === x.label)).filter((c) => c?.kind === 'preferred')
    if (prefs.some((c) => c!.liq_pref > 1)) r.flags.push({ code: 'pref', text: Math.max(...prefs.map((c) => c!.liq_pref)) + '× liquidation preference' })
    if (prefs.some((c) => c!.participating)) r.flags.push({ code: 'participating', text: 'Participating preferred (paid twice at exit)' })
    const topSen = Math.max(0, ...d.classes.filter((c) => c.kind === 'preferred').map((c) => c.seniority))
    if (prefs.length && d.classes.filter((c) => c.kind === 'preferred').length > 1 && prefs.some((c) => c!.seniority === topSen)) r.flags.push({ code: 'senior', text: 'Most senior preference' })
    const ctl = [...new Set(r.rights.filter((x) => CONTROL.has(x.kind)).map((x) => RIGHT_LABEL[x.kind]!))]
    if (ctl.length) r.flags.push({ code: 'control', text: ctl.join(', ') })
    r.power = r.flags.some((f) => f.code !== 'multi')
  }
  const warnings: string[] = []
  if (founders.length && iSum > fSum) warnings.push('Investors together own more than the founders (' + iSum.toFixed(1) + '% against ' + fSum.toFixed(1) + '%' + (converted ? ', as converted' : '') + ').')
  if (founders.length && fSum < 50) warnings.push('Founders together hold under 50%' + (converted ? ' once the SAFEs convert' : '') + ': ordinary resolutions need investor votes.')
  const seats = rows.filter((r) => r.holder.kind !== 'founder' && r.rights.some((x) => x.kind === 'board_seat')).length
  if (seats) warnings.push(seats + ' investor' + (seats === 1 ? ' has' : 's have') + ' a board seat. Check who controls the board.')
  const vetoes = rows.filter((r) => r.holder.kind !== 'founder' && r.rights.some((x) => x.kind === 'veto')).map((r) => r.holder.name)
  if (vetoes.length) warnings.push('Vetoes over company decisions: ' + vetoes.join(', ') + '.')
  rows.sort((a, b) => (a.holder.kind === 'founder' ? 0 : 1) - (b.holder.kind === 'founder' ? 0 : 1) || pctOf(b) - pctOf(a))
  return { rows, founders: { pctFd: founders.reduce((a, r) => a + r.pctFd, 0), pctConverted: safePct.size ? fSum : null, names: founders.map((r) => r.holder.name) }, investors: { pctFd: investors.reduce((a, r) => a + r.pctFd, 0), pctConverted: safePct.size ? iSum : null }, warnings, converted }
}

// Pro rata in the next round: each holder with the right may buy enough of it to keep their stake (or the share
// their letter fixes; super pro rata multiplies it).
export function proRataTake(rows: Position[], newMoney: number): { holder: string; pct: number; amount: number; kind: string }[] {
  const out: { holder: string; pct: number; amount: number; kind: string }[] = []
  for (const r of rows) for (const x of r.rights.filter((y) => y.kind === 'pro_rata' || y.kind === 'super_pro_rata')) {
    const fixed = Number(x.terms?.pct) > 0 ? Number(x.terms.pct) : null
    const mult = x.kind === 'super_pro_rata' ? Math.max(1, Number(x.terms?.multiple) || 2) : 1
    const pct = Math.min(100, (fixed ?? (r.pctConverted ?? r.pctFd)) * (fixed ? 1 : mult))
    out.push({ holder: r.holder.name, pct, amount: Math.round(newMoney * pct / 100), kind: x.kind })
  }
  return out
}

// Today's price per share: the latest priced round (a preferred class first, else a common issuance above a nominal
// price); with none, the latest SAFE or note cap spread over the shares it would convert into. The founder can enter
// another figure (e.g. a 409A or a recent secondary).
export function currentPrice(d: Data): { price: number | null; source: string } {
  const desc = <T extends { issued_on: string }>(a: T, b: T) => (a.issued_on < b.issued_on ? 1 : a.issued_on > b.issued_on ? -1 : 0)
  const priced = d.issuances.filter((i) => i.price && i.price >= 0.01).sort(desc)
  const x = priced.find((i) => d.classes.find((c) => c.id === i.class_id)?.kind === 'preferred') ?? priced[0]
  if (x) return { price: x.price!, source: (d.classes.find((c) => c.id === x.class_id)?.name ?? 'Shares') + ' price, ' + x.issued_on }
  const live = d.convertibles.filter((c) => c.status === 'outstanding' && c.valuation_cap)
  const last = live.slice().sort(desc)[0]
  const fd = table(d, new Date().toISOString().slice(0, 10)).fd
  if (!last || !fd) return { price: null, source: '' }
  const postS = live.filter((c) => c.kind === 'safe' && c.post_money).reduce((s, c) => s + c.amount / c.valuation_cap!, 0)
  const shares = last.kind === 'safe' && last.post_money ? fd / Math.max(0.05, 1 - Math.min(0.95, postS)) : fd
  return { price: Math.round(last.valuation_cap! / shares * 10000) / 10000, source: 'latest ' + (last.kind === 'safe' ? 'SAFE' : 'note') + ' cap (' + Math.round(last.valuation_cap! / 1e5) / 10 + 'M, ' + last.issued_on + ') ÷ shares' }
}

// Row order for cap table views: the founder's saved order where it has one; otherwise founders, then holders of
// common shares, then everyone else largest first. Rows not in the saved order go after it in the default order.
export function orderRows<T extends { key: string; name: string; kind: string; size: number }>(rows: T[], saved: string[], commonNames: Set<string>): T[] {
  const rank = (r: T) => (r.kind === 'founder' ? 0 : commonNames.has(r.name) ? 1 : 2)
  const def = rows.slice().sort((a, b) => rank(a) - rank(b) || b.size - a.size)
  if (!saved.length) return def
  const pos = new Map(saved.map((n, i) => [n, i]))
  return def.map((r, i) => ({ r, k: pos.has(r.key) ? pos.get(r.key)! : saved.length + i })).sort((a, b) => a.k - b.k).map((x) => x.r)
}
// Holders who hold common shares (founders' and employees' stock, angels in a common round).
export function commonHolders(d: Data): Set<string> {
  const common = new Set(d.classes.filter((c) => c.kind === 'common').map((c) => c.id))
  return new Set(d.holders.filter((h) => d.issuances.some((i) => i.holder_id === h.id && common.has(i.class_id))).map((h) => h.name))
}
