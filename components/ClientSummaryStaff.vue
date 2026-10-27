<script setup lang="ts">
// A wealth client at a glance, for the team: headline figures, what needs doing (with buttons), net worth over time,
// the mix against the Fortress guide, where it is held, the plan and risk, and recent activity.
const props = defineProps<{ d: Record<string, any>; id: string }>()
const emit = defineEmits<{ tab: [t: string]; edit: []; refresh: [] }>()
const { data: fort } = await useFetch<{ rows: { key: string; label: string; target_pct: number; current_pct: number }[] } | null>(() => '/api/wm/clients/' + props.id + '/fortress', { key: 'fort-' + props.id, default: () => null })
const usd = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(v)))
const t = computed(() => props.d.summary.totals as { net_worth: number; invested: number; cash: number; cost: number; gain: number })
const hist = computed(() => (props.d.summary.history as { m: string; v: number }[] | undefined ?? []))
const change = computed(() => (hist.value.length >= 2 ? t.value.net_worth - hist.value[0]!.v : null))
const points = computed(() => hist.value.map((x) => ({ label: new Date(x.m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: x.v })))
const cashPct = computed(() => (t.value.net_worth > 0 ? Math.round((t.value.cash / t.value.net_worth) * 100) : 0))
const lump = computed(() => { const tot = props.d.summary.holdings.reduce((a: number, h: any) => a + (h.currency === 'USD' ? Number(h.current_value ?? 0) : 0), 0); const top = props.d.summary.holdings.find((h: any) => h.category === 'other' && h.currency === 'USD' && tot > 0 && Number(h.current_value ?? 0) / tot >= 0.5); return top ? Math.round((Number(top.current_value) / tot) * 100) : 0 })
const feesDue = computed(() => (props.d.fees as { status: string }[]).filter((f) => f.status === 'due').length)
// What needs the team, each with the place to fix it.
const needs = computed(() => {
  const out: { text: string; label: string; go: () => void }[] = []
  if (props.d.onboarding?.status === 'submitted') out.push({ text: 'Onboarding waiting for approval', label: 'Review', go: () => navigateTo('/wealth-mgmt?t=onboarding') })
  if (props.d.onboarding?.account_status === 'failed' || props.d.onboarding?.account_status === 'held') out.push({ text: 'Investing account not opened', label: 'Open onboarding', go: () => navigateTo('/wealth-mgmt?t=onboarding') })
  if (props.d.client.kyc_status !== 'verified') out.push({ text: 'Identity check ' + (props.d.client.kyc_status === 'failed' ? 'not passed' : 'not finished'), label: 'Identity', go: () => emit('tab', 'kyc') })
  if (!props.d.client.risk_profile) out.push({ text: 'Risk level not set', label: 'Set risk level', go: () => document.getElementById('risk-card')?.scrollIntoView({ behavior: 'smooth' }) })
  if (lump.value) out.push({ text: lump.value + '% of the value is one unitemised line', label: 'Itemise holdings', go: () => emit('tab', 'holdings') })
  if (feesDue.value) out.push({ text: feesDue.value + ' invoice' + (feesDue.value === 1 ? '' : 's') + ' due', label: 'Billing', go: () => emit('tab', 'fees') })
  return out
})
const places = computed(() => (props.d.summary.by_platform as { label: string; value: number }[]).filter((p) => p.value > 0))
const maxPlace = computed(() => Math.max(1, ...places.value.map((p) => p.value)))
const showAll = ref(false)
const ago = (d: string) => { const n = Math.round((Date.now() - Date.parse(d)) / 86400e3); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 30 ? n + ' d ago' : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
const RISK: Record<string, string> = { conservative: 'Conservative', moderately_conservative: 'Moderately conservative', moderate: 'Moderate', growth: 'Growth', aggressive: 'Aggressive' }
</script>
<template>
  <div class="css">
    <div class="kp">
      <div class="k"><span>Net worth</span><b class="nw">{{ brief(usd(t.net_worth)) }}</b><em v-if="change != null"><span :class="change >= 0 ? 'up' : 'dn'">{{ change >= 0 ? '+' : '−' }}{{ brief(usd(Math.abs(change))) }}</span> since {{ points[0]?.label }}</em><em v-else>in US dollars</em></div>
      <div class="k"><span>Invested</span><b>{{ brief(usd(t.invested)) }}</b><em><span :class="t.gain >= 0 ? 'up' : 'dn'">{{ t.gain >= 0 ? '+' : '−' }}{{ brief(usd(Math.abs(t.gain))) }}</span> on cost</em></div>
      <div class="k"><span>Cash</span><b>{{ brief(usd(t.cash)) }}</b><em>{{ cashPct }}% of net worth{{ cashPct < 10 ? ' · below the 10% guide' : '' }}</em></div>
      <div class="k"><span>Advisory fee</span><b>{{ d.advisory_estimate != null ? usd(d.advisory_estimate) : '—' }}</b><em>{{ d.advisory_estimate != null ? 'a year at the current schedule' : 'not a managed client' }}</em></div>
    </div>
    <section v-if="needs.length" class="card nd"><div><b>{{ needs.length }} thing{{ needs.length === 1 ? '' : 's' }} need{{ needs.length === 1 ? 's' : '' }} you</b><span class="mut">{{ needs.map((n) => n.text).join(' · ') }}</span></div><span class="acts"><button v-for="n in needs" :key="n.label" class="btn secondary sm" @click="n.go()">{{ n.label }}</button></span></section>
    <div class="g2">
      <TrendChart v-if="points.length >= 2" title="Net worth" sub="At each month end" :points="points" unit="usd" />
      <section v-else class="card"><b class="h">Net worth</b><p class="mut">The chart builds up month by month.</p></section>
      <section class="card"><div class="hh"><b class="h">Mix against the guide</b><span class="mut sm">now · guide</span></div>
        <div v-for="r in fort?.rows ?? []" :key="r.key" class="mx"><span>{{ r.label }}</span><span class="tr"><i :style="{ width: Math.min(100, r.current_pct) + '%' }" /><em :style="{ left: Math.min(100, r.target_pct) + '%' }" /></span><span class="mut r">{{ Math.round(r.current_pct) }}% · {{ r.target_pct }}%</span></div>
        <p class="mut sm">Bars show now; the line marks the Fortress guide.</p></section>
    </div>
    <div class="g3">
      <section class="card"><b class="h">Where it is held</b><div v-for="p in (showAll ? places : places.slice(0, 6))" :key="p.label" class="pl"><span>{{ p.label }}</span><span class="br"><i :style="{ width: (p.value / maxPlace) * 100 + '%' }" /></span><b>{{ brief(usd(p.value)) }}</b></div><button v-if="places.length > 6" class="lk" @click="showAll = !showAll">{{ showAll ? 'Show fewer' : '+ ' + (places.length - 6) + ' more' }}</button><p v-if="!places.length" class="mut">Nothing recorded yet.</p></section>
      <section class="card"><b class="h">Plan and risk</b>
        <div class="pr"><span>Financial review</span><b>{{ d.plan ? new Date(d.plan.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not prepared' }}</b></div>
        <div class="pr"><span>Health score</span><b>{{ d.plan?.health != null ? d.plan.health + ' / 100' : '—' }}</b></div>
        <div class="pr"><span>Savings rate</span><b>{{ d.plan?.rate != null ? Math.round(d.plan.rate) + '%' : '—' }}</b></div>
        <div class="pr"><span>Risk level</span><b :class="{ warn: !d.client.risk_profile }">{{ RISK[d.client.risk_profile] ?? 'Not set' }}</b></div>
        <div class="pr"><span>High-risk share</span><b>{{ d.summary.risk?.high_pct != null ? d.summary.risk.high_pct + '%' : '—' }}</b></div>
        <button class="lk" @click="emit('tab', 'plan')">Open the plan →</button></section>
      <section class="card"><b class="h">Recent activity</b><div class="ev"><template v-for="(a, i) in d.activity" :key="i"><span class="mut">{{ ago(a.at) }}</span><span>{{ a.text }}</span></template></div><p v-if="!d.activity?.length" class="mut">Nothing yet.</p></section>
    </div>
    <div id="risk-card"><RiskCard :fit="d.summary.risk" :set-by="d.client.risk_set_by" :set-at="d.client.risk_set_at" mode="staff" :client-id="id" @saved="emit('refresh')" /></div>
    <section class="card ct"><div><b>Contact</b><span class="mut sm">{{ [d.client.contact_name, d.client.email, d.client.phone].filter(Boolean).join(' · ') || 'No contact details yet' }}</span></div><button class="btn secondary sm" @click="emit('edit')">Edit details</button></section>
  </div>
</template>
<style scoped>
.css { display: flex; flex-direction: column; gap: 12px; } .card { margin: 0; } .h { display: block; font-size: 15px; margin-bottom: 8px; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .r { text-align: right; }
.kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .k > span { display: block; font-size: 12.5px; color: var(--c-muted); } .k b { display: block; font-size: 24px; font-weight: 600; margin: 2px 0; } .k b.nw { color: var(--c-blue-deep); } .k em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .warn { color: var(--c-warn); }
.nd { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; border-color: rgba(181,71,8,.3); } .nd b { display: block; font-size: 14px; } .nd .mut { font-size: 12.5px; } .acts { display: flex; gap: 8px; flex-wrap: wrap; }
.g2 { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hh { display: flex; justify-content: space-between; } .mx { display: grid; grid-template-columns: 150px minmax(0, 1fr) 80px; gap: 10px; align-items: center; font-size: 13px; padding: 5px 0; }
.tr { position: relative; height: 14px; background: var(--c-paper-2); } .tr i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-blue-deep); } .tr em { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--c-navy); }
.pl { display: grid; grid-template-columns: 100px minmax(0, 1fr) 64px; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; } .pl span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pl b { text-align: right; } .br { display: block; height: 8px; background: var(--c-paper-2); } .br i { display: block; height: 100%; background: var(--c-blue-deep); }
.pr { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; } .pr span { color: var(--c-muted); }
.ev { display: grid; grid-template-columns: 80px 1fr; gap: 6px 10px; font-size: 13px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; margin-top: 6px; }
.ct { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .ct b { display: block; font-size: 14px; }
@media (max-width: 1000px) { .kp { grid-template-columns: 1fr 1fr; } .g2, .g3 { grid-template-columns: 1fr; } }
</style>
