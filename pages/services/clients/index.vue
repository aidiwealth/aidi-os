<script setup lang="ts">
useHead({ title: 'Clients' })
interface C { id: string; name: string; kind: string; contact_name: string; email: string; country: string | null; status: string; companies: number; open_jobs: number; unpaid: number }
const { data } = await useFetch<C[]>('/api/services/clients/list')
const q = ref('')
const shown = computed(() => (data.value ?? []).filter((c) => !q.value || (c.name + ' ' + c.contact_name + ' ' + c.email).toLowerCase().includes(q.value.toLowerCase())))
const adding = ref(false)
const f = reactive({ name: '', kind: 'company', contact_name: '', email: '', phone: '', country: '', address: '', status: 'active' })
const msg = ref('')
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/services/clients', { method: 'POST', body: f }); await navigateTo('/services/clients/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the client.' }
}
</script>

<template>
  <section v-if="data">
    <CsNav />
    <div class="head"><h1>Clients</h1><div class="row"><input v-model="q" placeholder="Search clients" aria-label="Search"><button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add client' }}</button></div></div>
    <form v-if="adding" class="card frm" @submit.prevent="add">
      <label class="label">Client name<input v-model="f.name" required maxlength="200" placeholder="Company or person"></label>
      <label class="label">Type<select v-model="f.kind"><option value="company">Company</option><option value="individual">Individual</option></select></label>
      <label class="label">Status<select v-model="f.status"><option value="active">Active</option><option value="lead">Lead</option><option value="inactive">Inactive</option></select></label>
      <label class="label">Main contact<input v-model="f.contact_name" required maxlength="200"></label>
      <label class="label">Email<input v-model="f.email" type="email" required maxlength="254"></label>
      <label class="label">Phone<input v-model="f.phone" maxlength="40"></label>
      <label class="label">Country<input v-model="f.country" maxlength="100"></label>
      <label class="label wide">Address<input v-model="f.address" maxlength="500"></label>
      <div class="wide row"><button class="btn" type="submit">Add client</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <table class="table">
      <thead><tr><th>Client</th><th>Main contact</th><th class="n">Companies</th><th class="n">Open jobs</th><th class="n">Unpaid invoices</th></tr></thead>
      <tbody><tr v-for="c in shown" :key="c.id">
        <td><NuxtLink :to="'/services/clients/' + c.id" class="co">{{ c.name }}</NuxtLink><span class="sub">{{ c.kind === 'company' ? 'Company' : 'Individual' }}{{ c.country ? ' · ' + c.country : '' }}{{ c.status !== 'active' ? ' · ' + c.status : '' }}</span></td>
        <td>{{ c.contact_name }}<span class="sub">{{ c.email }}</span></td><td class="n">{{ c.companies }}</td><td class="n">{{ c.open_jobs }}</td><td class="n" :class="{ error: c.unpaid }">{{ c.unpaid }}</td>
      </tr></tbody>
    </table>
    <p v-if="!shown.length" class="muted">No clients yet.</p>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; align-items: end; } .frm > label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); margin-bottom: 14px; }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); font-weight: 500; font-size: 12.5px; color: var(--c-muted); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; font-variant-numeric: tabular-nums; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.st { font-size: 13px; font-weight: 500; text-transform: capitalize; } .st.paid { color: var(--c-ok); } .st.sent { color: var(--c-blue-deep); } .st.overdue { color: var(--c-danger); } .st.draft, .st.void { color: var(--c-muted); }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 900px) { .frm { grid-template-columns: 1fr; } }
</style>
