<script setup lang="ts">
useHead({ title: 'Finvry · Customers' })
interface Org { id: string; name: string; slug: string; kind: string; status: string; plan_code: string; plan: string; trial_ends: string | null; created_at: string; seats: number; seat_limit: number | null; last_activity: string | null; brand: string }
const route = useRoute()
const { data, refresh } = await useFetch<Org[]>('/api/platform/orgs')
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean }[] }>('/api/platform/plans')
const adding = ref(route.query.new === '1')
const q = ref('')
const status = ref('')
const rows = computed(() => (data.value ?? []).filter((o) => (!status.value || o.status === status.value) && (!q.value || o.name.toLowerCase().includes(q.value.toLowerCase()))))
const f = reactive({ name: '', slug: '', kind: 'vc', plan_code: 'starter', status: 'trial', trial_days: 14, admin_name: '', admin_email: '' })
watch(() => f.name, (n) => { if (!slugTouched.value) f.slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) })
const slugTouched = ref(false)
const msg = ref('')
async function create() {
  msg.value = ''
  try { const r = await $fetch<{ id: string; emailed: boolean }>('/api/platform/orgs', { method: 'POST', body: f }); await navigateTo('/platform/customers/' + r.id + (r.emailed ? '?invited=1' : '')) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not create the workspace.' }
}
const KIND: Record<string, string> = { vc: 'Venture firm', family_office: 'Family office', company: 'Company', fund_admin: 'Fund administrator', other: 'Other' }
const ago = (s: string | null) => { if (!s) return 'never'; const d = Math.floor((Date.now() - Date.parse(s)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago' }
void refresh
</script>

<template>
  <section>
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Customers</h1><button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'New customer' }}</button></div>
    <form v-if="adding" class="card frm" @submit.prevent="create">
      <label class="label">Company<input v-model="f.name" required maxlength="200" placeholder="e.g. Acme Capital"></label>
      <label class="label">Link name<input v-model="f.slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" @input="slugTouched = true"></label>
      <label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Plan<select v-model="f.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.active && x.code !== 'internal')" :key="p.code" :value="p.code">{{ p.name }}</option></select></label>
      <label class="label">Start as<select v-model="f.status"><option value="trial">Trial</option><option value="active">Active (paying)</option></select></label>
      <label v-if="f.status === 'trial'" class="label">Trial days<input v-model.number="f.trial_days" type="number" min="1" max="90"></label>
      <label class="label">First admin's name<input v-model="f.admin_name" required maxlength="200"></label>
      <label class="label">First admin's email<input v-model="f.admin_email" type="email" required maxlength="254"></label>
      <p class="hint">Creates an empty, isolated workspace on the Finvry brand with a first fund or holding entity, and emails the admin an invitation to app.finvry.com.</p>
      <div class="actions"><button class="btn" type="submit">Create workspace</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <div class="tools"><input v-model="q" placeholder="Search customers" aria-label="Search"><select v-model="status" aria-label="Status"><option value="">All statuses</option><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></div>
    <table class="table">
      <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Seats</th><th>Last activity</th></tr></thead>
      <tbody><tr v-for="o in rows" :key="o.id">
        <td><NuxtLink :to="'/platform/customers/' + o.id" class="co">{{ o.name }}</NuxtLink><span class="sub">{{ KIND[o.kind] }} · {{ o.slug }}<template v-if="o.brand === 'aidi'"> · Aidi OS</template></span></td>
        <td>{{ o.plan }}</td>
        <td><span class="st" :data-s="o.status">{{ o.status.replace('_', ' ') }}</span><span v-if="o.status === 'trial' && o.trial_ends" class="sub">ends {{ o.trial_ends }}</span></td>
        <td>{{ o.seats }}{{ o.seat_limit ? ' / ' + o.seat_limit : '' }}</td>
        <td class="muted">{{ ago(o.last_activity) }}</td>
      </tr></tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; } .frm label { display: flex; flex-direction: column; gap: 6px; }
.hint { grid-column: 1 / -1; font-size: 12px; color: var(--c-muted); margin: 0; } .actions { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.tools { display: flex; gap: 10px; margin-bottom: 12px; } .tools input { flex: 1; max-width: 320px; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.st { text-transform: capitalize; font-weight: 500; } .st[data-s="active"] { color: var(--c-ok); } .st[data-s="trial"] { color: var(--c-blue-deep); } .st[data-s="past_due"] { color: var(--c-warn); } .st[data-s="suspended"], .st[data-s="closed"] { color: var(--c-danger); }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .frm { grid-template-columns: 1fr; } }
</style>
