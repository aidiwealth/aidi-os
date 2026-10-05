<script setup lang="ts">
// A borrower's credit report: score gauge, band, bureau breakdown, lenders, history; run a check or a manual review.
const props = defineProps<{ borrowerId: string }>()
const emit = defineEmits<{ changed: [] }>()
interface S { loans: number; active: number; closed: number; delinquent: number; overdueAccounts: number; borrowed: number; outstanding: number; overdue: number; highest: number; monthly: number; institutions: number; enquiries3m: number; enquiries12m: number; sources: { source: string; loans: number; outstanding: number; overdue: number; delinquent: number }[]; lenders: { provider: string; amount: number; outstanding: number; status: string; performance: string }[] }
interface C { id: string; provider: string; kind: string; status: string; score: number | null; band: string | null; summary: S | Record<string, never>; note: string | null; created_at: string }
const { data, refresh } = await useFetch<{ borrower: { id: string; name: string; country: string | null; kind: string; monitor: boolean; identifier_last4: string | null }; checks: C[]; nigeria: boolean; us_bureau: boolean }>(() => '/api/credit/borrowers/' + props.borrowerId + '/checks')
const latest = computed(() => data.value?.checks[0] ?? null)
const sum = computed(() => (latest.value && 'loans' in latest.value.summary ? latest.value.summary as S : null))
const f = reactive({ kind: 'business', identifier: '', monitor: false, mscore: '' as string | number, mnote: '' })
watch(data, (d) => { if (d) { f.kind = d.borrower.kind; f.monitor = d.borrower.monitor } }, { immediate: true })
const busy = ref(false); const msg = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function run() { busy.value = true; msg.value = ''; try { await $fetch('/api/credit/borrowers/' + props.borrowerId + '/check', { method: 'POST', body: { kind: f.kind, identifier: f.identifier, monitor: f.monitor } }); f.identifier = ''; await refresh(); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function manual() { busy.value = true; msg.value = ''; try { await $fetch('/api/credit/borrowers/' + props.borrowerId + '/check', { method: 'POST', body: { kind: f.kind, manual: { score: f.mscore === '' ? null : Number(f.mscore), note: f.mnote } } }); f.mscore = ''; f.mnote = ''; await refresh(); emit('changed') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const ngn = (v: number) => '₦' + Math.round(v).toLocaleString('en-US')
const ang = computed(() => (latest.value?.score ? ((latest.value.score - 300) / 550) * 180 : 0))
const arc = (deg: number) => { const r = 80, a = Math.PI * (1 - deg / 180); return (100 + r * Math.cos(a)).toFixed(1) + ' ' + (100 - r * Math.sin(a)).toFixed(1) }
const col = (b: string | null) => (b === 'Excellent' ? '#1f7a4d' : b === 'Good' ? '#1c4f9c' : b === 'Fair' ? '#b5470b' : '#b42318')
const hist = computed(() => [...(data.value?.checks ?? [])].reverse().filter((c) => c.score).map((c) => ({ label: new Date(c.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), value: c.score as number })))
const mix = computed(() => (sum.value ? [{ label: 'Active', value: sum.value.active }, { label: 'Closed', value: sum.value.closed }, { label: 'Delinquent', value: sum.value.delinquent }].filter((x) => x.value > 0) : []))
const SRC: Record<string, string> = { CRC: 'CRC', FIRST_CENTRAL: 'First Central', CREDIT_REGISTRY: 'Credit Registry' }
</script>
<template>
  <div v-if="data" class="cr">
    <div class="top"><div><h3>{{ data.borrower.name }}</h3><p class="mut">{{ data.borrower.country ?? 'Country not set' }} · {{ data.borrower.kind === 'individual' ? 'Individual' : 'Business' }}{{ data.borrower.identifier_last4 ? ' · ID ••' + data.borrower.identifier_last4 : '' }}</p></div>
      <div v-if="latest" class="gauge"><svg viewBox="0 0 200 116"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#ebe9e3" stroke-width="16" stroke-linecap="round" /><path v-if="latest.score" :d="'M20 100 A80 80 0 0 1 ' + arc(ang)" fill="none" :stroke="col(latest.band)" stroke-width="16" stroke-linecap="round" />
        <text x="100" y="92" text-anchor="middle" font-size="30" font-weight="700" :fill="latest.score ? col(latest.band) : '#888'">{{ latest.score ?? '—' }}</text><text x="100" y="112" text-anchor="middle" font-size="12" fill="#777">{{ latest.band ?? (latest.status === 'manual' ? 'Manual review' : latest.status === 'no_data' ? 'No history' : '') }}</text></svg></div></div>
    <p v-if="latest" class="note">{{ latest.provider === 'creditchek' ? 'CreditChek (CRC, First Central, Credit Registry)' : latest.provider === 'manual' ? 'Manual review' : 'Bureau' }} · {{ new Date(latest.created_at).toLocaleString('en-GB') }}{{ latest.note ? ' · ' + latest.note : '' }}</p>
    <template v-if="sum">
      <div class="ks"><div><em>Loans on record</em><b>{{ sum.loans }}</b></div><div><em>Active</em><b>{{ sum.active }}</b></div><div><em>Delinquent</em><b :class="{ r: sum.delinquent }">{{ sum.delinquent }}</b></div><div><em>Overdue accounts</em><b :class="{ r: sum.overdueAccounts }">{{ sum.overdueAccounts }}</b></div>
        <div><em>Outstanding</em><b>{{ ngn(sum.outstanding) }}</b></div><div><em>Overdue amount</em><b :class="{ r: sum.overdue }">{{ ngn(sum.overdue) }}</b></div><div><em>Monthly repayments</em><b>{{ ngn(sum.monthly) }}</b></div><div><em>Enquiries (3 months)</em><b>{{ sum.enquiries3m }}</b></div></div>
      <div class="two"><div v-if="mix.length" class="card"><DonutChart title="Facilities" total-label="Loans" :segments="mix" /></div>
        <div class="card"><h4>By bureau</h4><div v-for="s in sum.sources" :key="s.source" class="srow"><span>{{ SRC[s.source] ?? s.source }}</span><span>{{ s.loans }} loans</span><span>{{ ngn(s.outstanding) }} owed</span><span :class="{ r: s.overdue }">{{ ngn(s.overdue) }} overdue</span></div><p v-if="!sum.sources.length" class="mut">No bureau detail.</p></div></div>
      <div v-if="sum.lenders.length" class="card"><h4>Lenders</h4><div v-for="(l, i) in sum.lenders" :key="i" class="srow"><span>{{ l.provider }}</span><span>{{ ngn(l.amount) }}</span><span>{{ ngn(l.outstanding) }} outstanding</span><span :class="{ r: /lost|non/i.test(l.performance) }">{{ l.performance || l.status }}</span></div></div>
    </template>
    <TrendChart v-if="hist.length > 1" title="Score history" :points="hist" foot="Indicative score, 300–850" />
    <div class="card run"><h4>{{ data.nigeria ? 'Run a credit check' : 'Credit check' }}</h4>
      <template v-if="data.nigeria"><div class="g3"><label class="label">Borrower type<select v-model="f.kind"><option value="business">Business (RC number)</option><option value="individual">Individual (BVN)</option></select></label>
        <label class="label">{{ f.kind === 'individual' ? 'BVN (11 digits)' : 'RC number' }}<input v-model="f.identifier" :placeholder="data.borrower.identifier_last4 ? 'Leave blank to reuse ••' + data.borrower.identifier_last4 : f.kind === 'individual' ? '12345678901' : 'RC123456'" maxlength="30" autocomplete="off"></label>
        <label class="cb"><input v-model="f.monitor" type="checkbox"> Monitor monthly (the ID is stored encrypted)</label></div>
        <button class="btn" :disabled="busy" @click="run">{{ busy ? 'Checking the bureaus…' : 'Run check' }}</button><p class="mut">Get the borrower's consent first. Each check is billed by CreditChek.</p></template>
      <p v-else class="mut">Automatic bureau checks for {{ data.borrower.country || 'this country' }} are switched off until a US credit bureau is connected. Record a manual review instead.</p>
      <details class="mr" :open="!data.nigeria"><summary>Record a manual review</summary><div class="g3"><label class="label">Score (optional, 300–850)<input v-model="f.mscore" type="number" min="300" max="850"></label><label class="label w">Notes<textarea v-model="f.mnote" rows="3" maxlength="3000" placeholder="Bank statements reviewed, references, financials, decision" /></label></div><button class="btn secondary" :disabled="busy" @click="manual">Save review</button></details>
      <p v-if="msg" class="error">{{ msg }}</p></div>
    <div v-if="data.checks.length > 1" class="card"><h4>History</h4><div v-for="c in data.checks" :key="c.id" class="srow"><span>{{ new Date(c.created_at).toLocaleDateString('en-GB') }}</span><span>{{ c.provider === 'manual' ? 'Manual review' : 'CreditChek' }}</span><span>{{ c.score ?? '—' }} {{ c.band ?? '' }}</span><span class="mut">{{ c.status === 'no_data' ? 'No history' : c.note ?? '' }}</span></div></div>
  </div>
</template>
<style scoped>
.cr { display: flex; flex-direction: column; gap: 12px; } .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .top h3 { margin: 0; } .mut { color: var(--c-muted); font-size: 12.5px; margin: 0; } .gauge svg { width: 200px; height: 116px; display: block; }
.note { font-size: 12.5px; color: var(--c-muted); margin: 0; } .ks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .ks div { background: #fbfaf7; border: 1px solid var(--c-rule); padding: 10px 12px; display: flex; flex-direction: column; } .ks em { font-style: normal; font-size: 12px; color: var(--c-muted); } .ks b { font-size: 17px; } .r { color: var(--c-danger); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } h4 { margin: 0 0 8px; font-size: 14.5px; } .srow { display: grid; grid-template-columns: 1.6fr 1fr 1.2fr 1.2fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .srow:last-child { border-bottom: 0; }
.run { display: flex; flex-direction: column; gap: 10px; } .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items: end; } .w { grid-column: span 2; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } input, select, textarea { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.cb { display: flex; gap: 6px; align-items: center; font-size: 13px; } .cb input { width: auto; } .btn { align-self: flex-start; } .mr summary { cursor: pointer; font-size: 13px; color: var(--c-blue-deep); margin-bottom: 8px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 760px) { .ks { grid-template-columns: 1fr 1fr; } .two, .g3 { grid-template-columns: 1fr; } }
</style>
