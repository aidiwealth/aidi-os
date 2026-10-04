<script setup lang="ts">
const id = useRoute().params.id as string
const invited = useRoute().query.invited === '1'
interface D { org: { id: string; name: string; slug: string; kind: string; status: string; plan_code: string; plan: string; trial_ends: string | null; created_at: string; brand: string; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null; price: string | null }
  usage: { seats: number; storage: number; ai: number; last_activity: string | null; modules_off: number }; admins: { name: string; email: string; last_login_at: string | null }[]; log: { action: string; at: string; detail: Record<string, unknown>; by_name: string | null }[]; cards: { provider: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; is_default: boolean }[] }
const { data, refresh } = await useFetch<D>('/api/platform/orgs/' + id)
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean }[] }>('/api/platform/plans')
useHead({ title: () => 'Finvry · ' + (data.value?.org.name ?? 'Customer') })
const f = reactive({ name: '', plan_code: '', status: '', trial_ends_at: '' })
watchEffect(() => { const o = data.value?.org; if (o) Object.assign(f, { name: o.name, plan_code: o.plan_code, status: o.status, trial_ends_at: o.trial_ends ?? '' }) })
const busy = ref(false); const msg = ref(''); const ok = ref(invited ? 'Workspace created and the admin has been invited.' : '')
async function save() {
  if ((f.status === 'suspended' || f.status === 'closed') && f.status !== data.value?.org.status && !confirm('This signs everyone in ' + f.name + ' out and blocks access until reactivated. Continue?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/platform/orgs/' + id, { method: 'PATCH', body: { name: f.name, plan_code: f.plan_code, status: f.status, trial_ends_at: f.status === 'trial' ? (f.trial_ends_at || null) : undefined } }); ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { busy.value = false }
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(2)
const pct = (v: number, max: number | null) => (max ? Math.min(100, (v / max) * 100) : 0)
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never')
const ACT: Record<string, string> = { 'platform.workspace_create': 'Workspace created', 'platform.workspace_update': 'Workspace updated', 'platform.plan_save': 'Plan saved' }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/platform/customers" class="back">← Customers</NuxtLink>
    <p class="label">{{ data.org.slug }} · {{ data.org.brand === 'aidi' ? 'Aidi OS' : 'Finvry' }}</p>
    <h1>{{ data.org.name }}</h1>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="grid">
      <div class="col">
        <form class="card frm" @submit.prevent="save">
          <h2>Subscription</h2>
          <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
          <label class="label">Plan<select v-model="f.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.code === f.plan_code || x.code.startsWith(data!.org.kind === 'vc' ? 'vc_' : 'fo_') || (data!.org.brand === 'aidi' && x.code === 'internal'))" :key="p.code" :value="p.code">{{ p.name }}{{ p.active ? '' : ' (inactive)' }}</option></select></label>
          <label class="label">Status<select v-model="f.status"><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label>
          <label v-if="f.status === 'trial'" class="label">Trial ends<input v-model="f.trial_ends_at" type="date"></label>
          <button class="btn" type="submit" :disabled="busy">Save</button>
          <p class="hint">List price {{ data.org.price ? '$' + Number(data.org.price).toLocaleString() + ' / month' : 'not set' }}. <NuxtLink :to="'/platform/billing?org=' + data.org.id">Subscription and invoices →</NuxtLink></p>
        </form>
        <div class="card">
          <h2>Platform actions</h2>
          <ul class="log"><li v-for="(l, i) in data.log" :key="i"><b>{{ ACT[l.action] ?? l.action }}</b><span>{{ l.by_name ?? 'Platform' }} · {{ when(l.at) }}</span></li></ul>
          <p class="hint">These also appear in the customer's own audit trail.</p>
        </div>
      </div>
      <div class="col">
        <div class="card">
          <h2>Usage</h2>
          <div class="u"><span>Seats</span><b>{{ data.usage.seats }}{{ data.org.seat_limit ? ' of ' + data.org.seat_limit : '' }}</b><i><s :style="{ width: pct(data.usage.seats, data.org.seat_limit) + '%' }" /></i></div>
          <div class="u"><span>Storage</span><b>{{ gb(data.usage.storage) }} GB{{ data.org.storage_gb ? ' of ' + data.org.storage_gb : '' }}</b><i><s :style="{ width: pct(data.usage.storage / 1024 ** 3, data.org.storage_gb) + '%' }" /></i></div>
          <div class="u"><span>AI runs this month</span><b>{{ data.usage.ai }}{{ data.org.ai_runs_month ? ' of ' + data.org.ai_runs_month : '' }}</b><i><s :style="{ width: pct(data.usage.ai, data.org.ai_runs_month) + '%' }" /></i></div>
          <p class="meta">Last activity {{ when(data.usage.last_activity) }} · created {{ when(data.org.created_at) }}<template v-if="data.usage.modules_off"> · {{ data.usage.modules_off }} module{{ data.usage.modules_off === 1 ? '' : 's' }} switched off</template></p>
        </div>
        <div class="card">
          <h2>Admins</h2>
          <ul class="log"><li v-for="a in data.admins" :key="a.email"><b>{{ a.name }}</b><span>{{ a.email }} · last sign-in {{ when(a.last_login_at) }}</span></li></ul>
          <p class="hint">Contact details for account management. The customer's own data is not visible here.</p>
          <template v-if="data.cards.length"><h2 class="mt2">Saved cards</h2>
            <ul class="log"><li v-for="(c, i) in data.cards" :key="i"><b>{{ c.brand ?? 'Card' }} •••• {{ c.last4 ?? '????' }}<template v-if="c.is_default"> · default</template></b><span>{{ c.provider === 'stripe' ? 'Stripe' : 'Paystack' }}<template v-if="c.exp_month"> · expires {{ c.exp_month }}/{{ c.exp_year }}</template></span></li></ul></template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 16px; } h2 { margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 20px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .frm .btn { align-self: flex-start; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.u { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; margin-bottom: 12px; font-size: 13px; } .u b { font-weight: 500; }
.u i { grid-column: 1 / -1; height: 6px; background: var(--c-paper); display: block; } .u s { display: block; height: 100%; background: var(--c-blue); text-decoration: none; }
.meta { font-size: 12.5px; color: var(--c-muted); margin: 6px 0 0; }
.log { list-style: none; padding: 0; margin: 0; } .log li { padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .log b { display: block; font-weight: 500; color: var(--c-navy); font-size: 14px; } .log span { font-size: 12px; color: var(--c-muted); }
.hint { font-size: 12px; color: var(--c-muted); margin: 8px 0 0; } .mt2 { margin-top: 18px; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
