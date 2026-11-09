// The financial review in plain words: names for the suggested-mix buckets, the headline, and the steps in order
// (hidden ones left out for the client; the first three shown as cards).
export const PLAIN_BUCKET: Record<string, string> = {
  cash: 'Cash in the bank', stocks: 'Shares and funds', real_estate: 'Property', metals: 'Gold and silver',
  tbills: 'Short-term government savings or fixed deposits', crypto: 'Crypto', other: 'Other',
}
export interface ReportStep { i: number; title: string; detail: string; priority: string; timeframe: string; hidden: boolean; done: boolean }
const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
export function reportSteps(content: Record<string, any>, staff = false): ReportStep[] {
  const hidden = new Set<string>(content.hidden_steps ?? []), done = new Set<string>(content.steps_done ?? [])
  return ((content.actions ?? []) as { title: string; detail: string; priority: string; timeframe: string }[])
    .map((a, i) => ({ i, title: a.title, detail: a.detail, priority: a.priority, timeframe: a.timeframe, hidden: hidden.has(a.title), done: done.has(a.title) }))
    .filter((s) => staff || !s.hidden)
    .sort((a, b) => (RANK[a.priority] ?? 3) - (RANK[b.priority] ?? 3))
}
export function reportHeadline(content: Record<string, any>): string {
  if (content.headline) return String(content.headline)
  const first = String(content.summary ?? '').split(/(?<=[.!?])\s+/)[0] ?? ''
  return first.length > 160 ? first.slice(0, 157) + '…' : first
}
export function reportRest(content: Record<string, any>): string {
  if (content.headline) return String(content.summary ?? '')
  return String(content.summary ?? '').split(/(?<=[.!?])\s+/).slice(1).join(' ')
}
export const scoreWord = (s: number) => (s >= 80 ? 'Strong' : s >= 65 ? 'Good' : s >= 45 ? 'Fair' : 'Needs attention')
