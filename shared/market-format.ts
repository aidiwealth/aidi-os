// Formatting for Public Markets screens. Written by hand rather than with compact or locale-dependent Intl options, so
// the server and the browser render exactly the same text (no hydration mismatches).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
export function fixed(v: number, d = 2): string { const neg = v < 0, s = Math.abs(v).toFixed(d), [i, f] = s.split('.'); return (neg ? '−' : '') + group(i!) + (f ? '.' + f : '') }
export const usd = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + fixed(Math.abs(v), Math.abs(v) >= 1000 ? 0 : d))
export function big(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const a = Math.abs(v), s = v < 0 ? '−$' : '$'
  if (a >= 1e12) return s + fixed(a / 1e12, 2) + 'tn'
  if (a >= 1e9) return s + fixed(a / 1e9, 1) + 'bn'
  if (a >= 1e6) return s + fixed(a / 1e6, 1) + 'm'
  return s + fixed(a, 0)
}
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : fixed(v, d) + '%')
export const signed = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fixed(Math.abs(v), d) + '%')
// "26 Oct, 10:42 AM PT" in Pacific time; just "26 Oct 2026" for a date.
export function ptTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  const h = Number(p.hour) % 24, m = String(p.minute).padStart(2, '0')
  return Number(p.day) + ' ' + MON[Number(p.month) - 1] + ', ' + (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM') + ' PT'
}
export const day = (d: string | null | undefined) => (d ? Number(d.slice(8, 10)) + ' ' + MON[Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4) : '—')
export const month = (m: string | null | undefined) => (m ? MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : '—')
export const SIGNAL_TONE: Record<string, string> = { strong_buy: 'add', buy: 'add', hold: 'hold', trim: 'trim', sell: 'sell' }
