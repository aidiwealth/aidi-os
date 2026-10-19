// Customer revenue for the Retention and Customers pages, with the as-of month and grouping the founder picks.
import { addM, monthsBetween, span, type Cust, type GroupBy } from '~/shared/customer-metrics'
export interface CustData { config: { currency: string; group_by: GroupBy; enterprise_arr: number; midmarket_arr: number; scheme: { name: string; why: string; segments: { name: string; rule: string }[] } | null; billing?: 'subscription' | 'usage' | 'prepaid'; dormant_months?: number; retention_basis?: 'month' | 'quarter' | 'year' }; customers: Cust[]; fin: { revenue: Record<string, number>; gm: number | null }; imports: { id: string; filename: string; created: string; summary: Record<string, unknown> }[] }
export async function useCustomers() {
  // Read in the browser, not while the page is drawn on the server: a large customer file would otherwise be sent twice
  // (inside the page and again) and worked out twice. Not deeply reactive: the figures are read, never edited here.
  const r = await useFetch<CustData>('/api/financials/customers', { key: 'cust-data', server: false, deep: false })
  const cs = computed(() => r.data.value?.customers ?? [])
  const sp = computed(() => span(cs.value))
  const asOf = ref('')
  watch(sp, (v) => { if (v && (!asOf.value || asOf.value > v.last || asOf.value < v.first)) asOf.value = v.last }, { immediate: true })
  const months = computed(() => (sp.value ? monthsBetween(sp.value.first, sp.value.last) : []))
  const groupBy = ref<GroupBy>('size')
  watch(() => r.data.value?.config.group_by, (g) => { if (g) groupBy.value = g }, { immediate: true })
  const t = computed(() => ({ enterprise: r.data.value?.config.enterprise_arr ?? 100000, midmarket: r.data.value?.config.midmarket_arr ?? 25000 }))
  const cur = computed(() => r.data.value?.config.currency ?? 'USD')
  const stamp = computed(() => String(cs.value.length) + ':' + (sp.value?.last ?? '') + ':' + (r.data.value?.imports[0]?.id ?? '') + ':' + groupBy.value + ':' + (r.data.value?.config.billing ?? '') + (r.data.value?.config.dormant_months ?? '') + (r.data.value?.config.retention_basis ?? ''))
  // How customers pay: usage and prepaid credits count a customer lost only after some quiet months.
  const grace = computed(() => r.data.value?.config.dormant_months ?? 1)
  const billing = computed(() => r.data.value?.config.billing ?? 'subscription')
  const last12 = computed(() => months.value.filter((m) => m <= asOf.value && m > addM(asOf.value, -12)))
  return { ...r, cs, sp, asOf, months, groupBy, t, cur, stamp, last12, grace, billing }
}
export const C_SYMS: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R ' }
export const cMoney = (v: number | null | undefined, cur: string, compact = false) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = C_SYMS[cur] ?? cur + ' ', a = Math.abs(v), neg = v < 0 ? '−' : ''
  if (compact && a >= 1e6) return neg + s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm'
  if (compact && a >= 1e4) return neg + s + Math.round(a / 1e3) + 'k'
  return neg + s + Math.round(a).toLocaleString('en-US')
}
export const cPct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (v * 100).toFixed(d) + '%')
export const cMon = (m: string, long = false) => (m ? new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }) : '')
