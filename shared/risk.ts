// Risk levels for Aidi Wealth clients, risk ratings for asset classes, and how the two fit together.
// A client's level sets the riskiest rating they should hold and how much of their invested money may sit in
// high-risk assets (rating 4 or 5). Admins can change both tables; every client is checked against them.

export const RISK_LEVELS = [
  { code: 'conservative', label: 'Conservative', text: 'Protect what you have. Small, steady returns; avoid losses.' },
  { code: 'moderately_conservative', label: 'Moderately conservative', text: 'Mostly stable assets, with a little room for growth.' },
  { code: 'moderate', label: 'Moderate', text: 'A balance of growth and stability; accept some ups and downs.' },
  { code: 'growth', label: 'Growth', text: 'Mainly growth assets; comfortable with large swings over time.' },
  { code: 'aggressive', label: 'Aggressive', text: 'Maximum growth; can accept losing a large part of an investment.' }] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]['code']
export const RATING_LABEL: Record<number, string> = { 1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Very high' }

// Asset classes (holding categories) and their default rating.
export const ASSET_CLASSES: { code: string; label: string; rating: number }[] = [
  { code: 'cash', label: 'Cash & savings', rating: 1 }, { code: 'bonds', label: 'Bonds & fixed income', rating: 2 },
  { code: 'retirement', label: 'Retirement accounts', rating: 2 }, { code: 'precious_metals', label: 'Gold & metals', rating: 2 },
  { code: 'fund', label: 'Funds', rating: 3 }, { code: 'public_securities', label: 'Stocks & ETFs', rating: 3 },
  { code: 'real_estate', label: 'Real estate', rating: 3 }, { code: 'other', label: 'Other', rating: 3 },
  { code: 'private_stake', label: 'Private stakes', rating: 4 }, { code: 'venture', label: 'Venture', rating: 5 },
  { code: 'secondaries', label: 'Secondaries (private deals)', rating: 5 }, { code: 'crypto', label: 'Crypto', rating: 5 }]

export interface RiskLimit { max_rating: number; max_high_pct: number }
export interface RiskConfig { ratings: Record<string, number>; limits: Record<RiskLevel, RiskLimit> }
export const RISK_DEFAULT: RiskConfig = {
  ratings: Object.fromEntries(ASSET_CLASSES.map((a) => [a.code, a.rating])),
  limits: { conservative: { max_rating: 2, max_high_pct: 0 }, moderately_conservative: { max_rating: 3, max_high_pct: 5 }, moderate: { max_rating: 4, max_high_pct: 15 }, growth: { max_rating: 5, max_high_pct: 30 }, aggressive: { max_rating: 5, max_high_pct: 60 } } }
export function riskConfigOf(saved: unknown): RiskConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<RiskConfig>
  return { ratings: { ...RISK_DEFAULT.ratings, ...(s.ratings ?? {}) }, limits: { ...RISK_DEFAULT.limits, ...(s.limits ?? {}) } as RiskConfig['limits'] }
}
export const levelLabel = (c: string | null | undefined) => RISK_LEVELS.find((l) => l.code === c)?.label ?? 'Not set'

// The questionnaire: each answer scores 1 (cautious) to 5 (bold); the average picks the level.
export const RISK_QUESTIONS: { id: string; q: string; a: string[] }[] = [
  { id: 'horizon', q: 'When will you need most of this money?', a: ['Within 2 years', 'In 2 to 5 years', 'In 5 to 10 years', 'In 10 to 20 years', 'More than 20 years from now'] },
  { id: 'drop', q: 'Your investments fall 25% in a year. What do you do?', a: ['Sell everything', 'Sell some', 'Wait and do nothing', 'Buy a little more', 'Buy a lot more'] },
  { id: 'goal', q: 'What matters most to you?', a: ['Not losing money', 'Steady income', 'A balance of growth and safety', 'Growing my wealth', 'The highest possible growth'] },
  { id: 'income', q: 'How secure is your income?', a: ['No regular income', 'Irregular income', 'Fairly stable', 'Stable', 'Very stable, with savings beyond my needs'] },
  { id: 'experience', q: 'Have you invested in private companies, crypto or similar before?', a: ['Never', 'Once or twice', 'A few times', 'Regularly', 'It is a large part of what I do'] }]
export function levelFromAnswers(ans: Record<string, number>): RiskLevel {
  const v = RISK_QUESTIONS.map((q) => Math.min(5, Math.max(1, Number(ans[q.id]) || 1)))
  const avg = v.reduce((a, x) => a + x, 0) / v.length
  return avg < 1.8 ? 'conservative' : avg < 2.6 ? 'moderately_conservative' : avg < 3.4 ? 'moderate' : avg < 4.2 ? 'growth' : 'aggressive'
}

// How a client's holdings sit against their level: value by rating, the high-risk share, and anything above it.
export interface RiskFit { level: string | null; label: string; max_rating: number | null; max_high_pct: number | null; by_rating: { rating: number; label: string; value: number }[]; high_pct: number; over: { name: string; category: string; rating: number; value: number }[]; over_high: boolean; ok: boolean }
export function riskFit(level: string | null, holdings: { name: string; category: string; value: number; rating?: number | null }[], cfg: RiskConfig): RiskFit {
  const lim = level ? cfg.limits[level as RiskLevel] : undefined
  const by: Record<number, number> = {}; let total = 0, high = 0; const over: RiskFit['over'] = []
  for (const h of holdings) {
    if (h.category === 'liability' || h.value <= 0) continue
    const r = h.rating ?? cfg.ratings[h.category] ?? 3
    by[r] = (by[r] ?? 0) + h.value; total += h.value; if (r >= 4) high += h.value
    if (lim && r > lim.max_rating) over.push({ name: h.name, category: h.category, rating: r, value: Math.round(h.value * 100) / 100 })
  }
  const high_pct = total ? Math.round((high / total) * 1000) / 10 : 0
  const over_high = !!lim && high_pct > lim.max_high_pct
  return { level, label: levelLabel(level), max_rating: lim?.max_rating ?? null, max_high_pct: lim?.max_high_pct ?? null,
    by_rating: [1, 2, 3, 4, 5].map((r) => ({ rating: r, label: RATING_LABEL[r]!, value: Math.round((by[r] ?? 0) * 100) / 100 })).filter((x) => x.value > 0),
    high_pct, over, over_high, ok: !!lim && !over.length && !over_high }
}
// Whether a client at this level may be offered an asset with this rating.
export const allowedFor = (level: string | null | undefined, rating: number, cfg: RiskConfig) => !!level && rating <= (cfg.limits[level as RiskLevel]?.max_rating ?? 0)
