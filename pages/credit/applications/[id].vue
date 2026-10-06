<script setup lang="ts">
// A loan request from the pitch form: business and guarantor scores, the ask, and the decision (separate from equity).
const id = useRoute().params.id as string
const { data, refresh } = await useFetch<{ app: Record<string, any>; business: { status: string; score: number | null; band: string | null; note: string | null; created_at: string }[]; guarantors: { id: string; name: string; email: string | null; phone: string | null; relationship: string | null; bvn_last4: string | null; nin_last4: string | null; dob: string | null; last_check: { status: string; score: number | null; band: string | null; note: string | null } | null }[]; entities: { id: string; name: string }[] }>('/api/credit/applications/' + id)
useHead({ title: () => (data.value?.app.company ?? 'Loan application') })
const ST: Record<string, string> = { new: 'New', checking: 'Running checks', review: 'In review', approved: 'Approved', declined: 'Declined', disbursed: 'Disbursed', withdrawn: 'Withdrawn' }
const money = (v: number | null | undefined, c: string) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v))
const t = reactive({ principal: 0, annual_rate: 24, tenor_months: 12, repayment_type: 'amortising', lender_entity_id: '' as string | null, note: '' })
watchEffect(() => { const a = data.value?.app; if (a) { t.principal = Number(a.terms?.principal ?? a.amount); t.annual_rate = Number(a.terms?.annual_rate ?? 24); t.tenor_months = Number(a.terms?.tenor_months ?? a.tenor_months ?? 12); t.repayment_type = a.terms?.repayment_type ?? 'amortising'; t.lender_entity_id = a.terms?.lender_entity_id ?? '' } })
const msg = ref(''); const busy = ref('')
const { data: meA } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
async function delApp() { if (!confirm('Delete this loan application, its credit checks and guarantors? If the company has no loans, the borrower record is removed too. This cannot be undone.')) return; busy.value = 'delete'; try { await $fetch('/api/credit/applications/' + id, { method: 'POST', body: { action: 'delete' } }); await navigateTo('/credit') } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.'; busy.value = '' } }
async function act(action: string) { if ((action === 'decline' || action === 'withdraw') && !confirm(action === 'decline' ? 'Decline this loan request?' : 'Mark as withdrawn?')) return; busy.value = action; msg.value = ''
  try { await $fetch('/api/credit/applications/' + id, { method: 'POST', body: { action, note: t.note || undefined, terms: action === 'approve' ? { principal: Number(t.principal), annual_rate: Number(t.annual_rate), tenor_months: Number(t.tenor_months), repayment_type: t.repayment_type, lender_entity_id: t.lender_entity_id || null } : undefined } }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = '' } }
const b0 = computed(() => data.value?.business[0] ?? null)
const BAND: Record<string, string> = { Excellent: 'ex', Good: 'gd', Fair: 'fr', Poor: 'pr' }
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/credit" class="back">← Credit</NuxtLink>
    <div class="hd"><div><p class="label">Loan application · {{ ST[data.app.status] }}</p><h1>{{ data.app.company }}</h1><p class="mut">{{ money(data.app.amount, data.app.currency) }}{{ data.app.tenor_months ? ' over ' + data.app.tenor_months + ' months' : '' }} · {{ data.app.country }} · received {{ new Date(data.app.created_at).toLocaleDateString('en-GB') }}<template v-if="data.app.pitch_id"> · <NuxtLink :to="'/deals/' + data.app.pitch_id">pitch</NuxtLink></template></p></div>
      <button class="btn secondary" :disabled="!!busy" @click="act('check')">{{ busy === 'check' ? 'Running checks…' : 'Run credit checks' }}</button></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="grid">
      <div class="card"><h3>Credit scores</h3>
        <div class="row"><span><b>Business</b><em>{{ data.app.rc_number ? 'RC ' + data.app.rc_number : 'No RC number given' }}</em></span><span v-if="b0?.score" class="sc" :class="BAND[b0.band ?? '']"><b>{{ b0.score }}</b> {{ b0.band }}</span><span v-else class="mut">{{ b0 ? (b0.status === 'no_data' ? 'No bureau history' : b0.status === 'error' ? (b0.note ?? 'Check failed') : b0.status) : 'Not checked' }}</span></div>
        <div v-for="g in data.guarantors" :key="g.id" class="row"><span><b>{{ g.name }}</b><em>{{ g.relationship }} · guarantor{{ g.bvn_last4 ? ' · BVN •••' + g.bvn_last4 : '' }}{{ g.nin_last4 ? ' · NIN •••' + g.nin_last4 : '' }}</em></span><span v-if="g.last_check?.score" class="sc" :class="BAND[g.last_check.band ?? '']"><b>{{ g.last_check.score }}</b> {{ g.last_check.band }}</span><span v-else class="mut">{{ g.last_check ? (g.last_check.status === 'no_data' ? 'No bureau history' : g.last_check.status === 'error' ? (g.last_check.note ?? 'Check failed') : g.last_check.status) : 'Not checked' }}</span></div>
        </div>
      <div class="card"><h3>The request</h3><dl><dt>Amount</dt><dd>{{ money(data.app.amount, data.app.currency) }}</dd><dt>Tenor</dt><dd>{{ data.app.tenor_months ? data.app.tenor_months + ' months' : '—' }}</dd><dt>Monthly revenue</dt><dd>{{ money(data.app.monthly_revenue, data.app.currency) }}</dd><dt>Purpose</dt><dd class="pre">{{ data.app.purpose || '—' }}</dd><dt>Sector</dt><dd>{{ data.app.sector || '—' }}</dd><dt>Contact</dt><dd>{{ data.app.contact_name }} · {{ data.app.contact_email }}</dd><dt>Business</dt><dd class="pre">{{ data.app.one_liner }}<template v-if="data.app.website"><br><a :href="data.app.website" target="_blank">{{ data.app.website }}</a></template></dd></dl></div>
    </div>
    <div class="card crd"><h3>Credit report and guarantors</h3><BorrowerCredit :borrower-id="data.app.borrower_id" /></div>
    <div class="card dec"><h3>Decision</h3>
      <p v-if="data.app.status === 'approved' || data.app.status === 'disbursed'" class="okm">Approved{{ data.app.decided_at ? ' on ' + new Date(data.app.decided_at).toLocaleDateString('en-GB') : '' }}. {{ data.app.status === 'disbursed' ? 'Disbursed.' : 'Log the disbursement in Deployments to book the loan and update the books.' }} <NuxtLink v-if="data.app.status === 'approved'" :to="'/deployments?application=' + id">Log disbursement →</NuxtLink></p>
      <p v-else-if="data.app.status === 'declined'" class="mut">Declined. {{ data.app.decision_note }}</p>
      <div class="tf"><label class="label">Principal<input v-model.number="t.principal" type="number" min="1"></label><label class="label">Rate % a year<input v-model.number="t.annual_rate" type="number" min="0" max="200" step="0.5"></label><label class="label">Tenor (months)<input v-model.number="t.tenor_months" type="number" min="1" max="360"></label>
        <label class="label">Repayment<select v-model="t.repayment_type"><option value="amortising">Amortising</option><option value="interest_only">Interest only</option><option value="bullet">Bullet</option></select></label><label class="label">Lending entity<select v-model="t.lender_entity_id"><option value="">Choose</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label></div>
      <label class="label">Note<textarea v-model="t.note" rows="2" maxlength="3000" /></label>
      <div class="acts"><button class="btn" :disabled="!!busy" @click="act('approve')">Approve with these terms</button><button class="btn secondary" :disabled="!!busy" @click="act('review')">Mark in review</button><button class="btn secondary danger" :disabled="!!busy" @click="act('decline')">Decline</button><button class="lk" :disabled="!!busy" @click="act('withdraw')">Withdrawn by founder</button><button v-if="meA?.roles.includes('admin')" class="lk del" :disabled="!!busy" @click="delApp">Delete application</button></div></div>
  </section>
</template>
<style scoped>
.back { color: var(--c-muted); text-decoration: none; font-size: 13.5px; } .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .hd h1 { margin: 2px 0; } .mut { color: var(--c-muted); font-size: 13px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; } .grid h3, .dec h3 { margin: 0 0 8px; } .row { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .row em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.sc { font-size: 13px; padding: 3px 9px; background: var(--c-paper-2); white-space: nowrap; } .sc.ex, .sc.gd { background: rgba(31,122,77,.1); color: var(--c-ok); } .sc.fr { background: rgba(181,71,8,.09); color: var(--c-warn); } .sc.pr { background: rgba(180,35,24,.07); color: var(--c-danger); }
dl { display: grid; grid-template-columns: 130px 1fr; gap: 6px 10px; margin: 0; font-size: 13.5px; } dt { color: var(--c-muted); } dd { margin: 0; } .pre { white-space: pre-wrap; }
.dec { display: flex; flex-direction: column; gap: 10px; } .tf { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; } input, select, textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .lk { background: none; border: 0; color: var(--c-muted); cursor: pointer; font: inherit; font-size: 13px; } .okm { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid, .tf { grid-template-columns: 1fr; } }
.lk.del { color: var(--c-danger); margin-left: auto; }
/* fields fit */
input, select, textarea { box-sizing: border-box; max-width: 100%; min-width: 0; }
</style>
