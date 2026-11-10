// A short in-memory cache for heavy figures shown on public pages (statements, customer series, investor financials),
// so many visitors in a few minutes don't each rebuild them. Keys always include the workspace; failures aren't kept.
const store = new Map<string, { at: number; p: Promise<unknown> }>()
export function memo<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.p as Promise<T>
  const p = fn(); store.set(key, { at: Date.now(), p })
  p.then((v) => { if (Array.isArray(v) && !v.length) store.delete(key) }, () => store.delete(key))
  if (store.size > 400) { const old = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100); for (const [k] of old) store.delete(k) }
  return p
}
// Drop a workspace's cached figures (after its books or page change).
export function memoClear(orgId: string) { for (const k of store.keys()) if (k.includes(orgId)) store.delete(k) }
