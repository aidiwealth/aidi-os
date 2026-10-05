<script setup lang="ts">
useHead({ title: 'Settings' })
interface S { org: { name: string; slug: string; kind: string; status: string; plan: string }; settings: { public_name: string; investor_name: string; thesis: string; notify_emails: string[]; default_vehicle_id: string }
  plan: { name: string; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null }; usage: { members: number; storage_bytes: number; ai_runs: number }; pitchUrl: string }
const { data, refresh } = await useFetch<S>('/api/settings')
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const { data: billing } = await useFetch<{ subscription: { plan: string; billing: string; method: string; amount_usd: string; renews: string; status: string } | null; invoices: { id: string; number: string; issue_date: string; due_date: string; amount: string; currency: string; status: string; overdue: boolean; payUrl: string | null }[]; card: { provider: string; brand: string | null; last4: string | null } | null }>('/api/settings/billing')
const usd = (v: string | number) => '$' + Number(v).toLocaleString()
const f = reactive({ name: '', public_name: '', investor_name: '', thesis: '', notify: '', default_vehicle_id: '' })
watchEffect(() => { const d = data.value; if (!d) return; Object.assign(f, { name: d.org.name, public_name: d.settings.public_name, investor_name: d.settings.investor_name, thesis: d.settings.thesis, notify: d.settings.notify_emails.join(', '), default_vehicle_id: d.settings.default_vehicle_id }) })
const busy = ref(false); const msg = ref(''); const ok = ref('')
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    await $fetch('/api/settings', { method: 'POST', body: { name: f.name, public_name: f.public_name, investor_name: f.investor_name, thesis: f.thesis, notify_emails: f.notify.split(/[\s,;]+/).filter(Boolean), default_vehicle_id: f.default_vehicle_id } })
    ok.value = 'Saved.'; await refresh(); await refreshNuxtData('me')
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(2)
const pct = (v: number, max: number | null) => (max ? Math.min(100, (v / max) * 100) : 0)
const copied = ref(false)
async function copy() { if (!data.value) return; await navigator.clipboard.writeText(data.value.pitchUrl); copied.value = true; setTimeout(() => (copied.value = false), 1500) }
</script>

<template>
  <section v-if="data">
    <p class="label">Administration</p>
    <h1>Settings</h1>
    <div class="grid">
      <form class="card frm" @submit.prevent="save">
        <h2>Workspace</h2>
        <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
        <label class="label">Name founders see<input v-model="f.public_name" maxlength="120" :placeholder="f.name"><span class="hint">Used on pitch receipts and monthly report requests, for example your fund's name.</span></label>
        <label class="label">Default vehicle for new deals and companies<select v-model="f.default_vehicle_id"><option value="">First fund</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <label class="label">Who receives pitch, report and reminder emails<input v-model="f.notify" placeholder="partners@yourfirm.com, ops@yourfirm.com"><span class="hint">Separate addresses with commas. Leave empty to notify your admins.</span></label>
        <h2 class="mt">Pitch screening</h2>
        <label class="label">Firm name used in screening<input v-model="f.investor_name" maxlength="200" :placeholder="data.org.name"></label>
        <label class="label">Investment thesis<textarea v-model="f.thesis" rows="9" maxlength="6000" placeholder="Stages, sectors, geographies, cheque size, what you look for and what you avoid." /><span class="hint">AI screening scores each pitch against this. It advises; your partners decide.</span></label>
        <div class="row"><button class="btn" type="submit" :disabled="busy">Save</button><span v-if="ok" class="ok">{{ ok }}</span><span v-if="msg" class="error">{{ msg }}</span></div>
      </form>
      <div class="col">
        <div v-if="data.org.kind === 'company'" class="card"><CompanyProfile /></div>
        <div class="card">
          <h2>Plan and usage</h2>
          <p class="plan"><b>{{ data.plan.name }}</b> plan<template v-if="data.org.status === 'trial'"> · trial</template></p>
          <div class="u"><span>Seats</span><b>{{ data.usage.members }}{{ data.plan.seat_limit ? ' of ' + data.plan.seat_limit : '' }}</b><i><s :style="{ width: pct(data.usage.members, data.plan.seat_limit) + '%' }" /></i></div>
          <div class="u"><span>Storage</span><b>{{ gb(data.usage.storage_bytes) }} GB{{ data.plan.storage_gb ? ' of ' + data.plan.storage_gb : '' }}</b><i><s :style="{ width: pct(data.usage.storage_bytes / 1024 ** 3, data.plan.storage_gb) + '%' }" /></i></div>
          <div class="u"><span>AI runs this month</span><b>{{ data.usage.ai_runs }}{{ data.plan.ai_runs_month ? ' of ' + data.plan.ai_runs_month : '' }}</b><i><s :style="{ width: pct(data.usage.ai_runs, data.plan.ai_runs_month) + '%' }" /></i></div>
        </div>
        <div class="card">
          <h2>Billing</h2>
          <p v-if="billing?.subscription" class="plan"><b>{{ billing.subscription.plan }}</b> · {{ usd(billing.subscription.amount_usd) }} / {{ billing.subscription.billing === 'annual' ? 'year' : 'month' }} · renews {{ billing.subscription.renews }}</p>
          <EmptyState v-else compact icon="empty" title="No subscription on file{{ data.org.status === 'trial' ? ' yet: you are on a trial' : '' }}" />
          <ul v-if="billing?.invoices.length" class="invs"><li v-for="i in billing.invoices" :key="i.id"><a :href="'/invoice/' + i.id" target="_blank">{{ i.number }}</a><span>{{ new Intl.NumberFormat('en-US', { style: 'currency', currency: i.currency }).format(Number(i.amount)) }} · <b :class="{ red: i.overdue, ok: i.status === 'paid' }">{{ i.overdue ? 'overdue' : i.status === 'sent' ? 'due ' + i.due_date : i.status }}</b><a v-if="i.payUrl" :href="i.payUrl" class="payl">Pay</a></span></li></ul>
          <p v-if="billing?.card" class="muted small">Card on file: {{ billing.card.brand ?? 'card' }} •••• {{ billing.card.last4 }}. Renewals are charged to it automatically.</p>
        </div>
        <div id="vehicles" class="card"><VehicleManager /></div>
        <div class="card">
          <h2>Public pitch form</h2>
          <p class="muted small">Founders can pitch you through this address. Point your website's pitch form at it.</p>
          <div class="link"><code>{{ data.pitchUrl }}</code><button type="button" class="btn secondary sm" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button></div>
          <p class="muted small">Workspace link name: <b>{{ data.org.slug }}</b></p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; margin-top: 16px; } .col { display: flex; flex-direction: column; gap: 20px; }
h2 { margin-bottom: 12px; } .mt { margin-top: 12px; }
.frm { display: flex; flex-direction: column; gap: 14px; } .frm label { display: flex; flex-direction: column; gap: 6px; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
textarea { resize: vertical; } .hint { font-size: 12px; color: var(--c-muted); letter-spacing: normal; text-transform: none; }
.row { display: flex; gap: 12px; align-items: center; }
.plan { margin: 0 0 14px; } .plan b { color: var(--c-navy); font-weight: 500; }
.u { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; margin-bottom: 12px; font-size: 13px; } .u b { font-weight: 500; }
.u i { grid-column: 1 / -1; height: 6px; background: var(--c-paper); display: block; } .u s { display: block; height: 100%; background: var(--c-blue); text-decoration: none; }
.link { display: flex; gap: 8px; align-items: center; margin: 10px 0; } .link code { flex: 1; font-size: 12px; background: var(--c-paper); padding: 8px; overflow-x: auto; white-space: nowrap; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.invs { list-style: none; padding: 0; margin: 8px 0 0; } .invs li { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .invs b { font-weight: 500; } .red { color: var(--c-danger); } .payl { margin-left: 10px; font-weight: 500; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
