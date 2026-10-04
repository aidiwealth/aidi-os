<script setup lang="ts">
useHead({ title: 'LP register' })
interface L { id: string; name: string; kind: string; contact_name: string | null; email: string | null; country: string | null; kyc_status: string; portal: boolean | null; committed: string; funds: number }
const { data, refresh } = await useFetch<L[]>('/api/funds/lps')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const { money } = useMoney()
const adding = ref(false)
const f = reactive({ name: '', kind: 'individual', contact_name: '', email: '', country: '', kyc_status: 'pending' })
const msg = ref('')
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/funds/lps', { method: 'POST', body: f }); await navigateTo('/funds/lps/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the LP.' }
}
const KIND: Record<string, string> = { individual: 'Individual', entity: 'Company or trust', institution: 'Institution', gp: 'GP commitment' }
void refresh
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/funds" class="back">← Funds</NuxtLink>
    <div class="head"><h1>LP register</h1><button v-if="isGp" class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add LP' }}</button></div>
    <form v-if="adding" class="card frm" @submit.prevent="add">
      <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
      <label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Contact<input v-model="f.contact_name" maxlength="200"></label>
      <label class="label">Email<input v-model="f.email" type="email" maxlength="254"></label>
      <label class="label">Country<input v-model="f.country" maxlength="100"></label>
      <label class="label">KYC (as confirmed by your administrator)<select v-model="f.kyc_status"><option value="pending">Pending</option><option value="approved">Approved</option><option value="expired">Expired</option></select></label>
      <div class="row"><button class="btn" type="submit">Add LP</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <table class="table">
      <thead><tr><th>LP</th><th>Type</th><th>KYC</th><th class="n">Committed</th><th>Portal</th></tr></thead>
      <tbody><tr v-for="l in data" :key="l.id">
        <td><NuxtLink :to="'/funds/lps/' + l.id" class="co">{{ l.name }}</NuxtLink><span class="sub">{{ [l.contact_name, l.email, l.country].filter(Boolean).join(' · ') }}</span></td>
        <td>{{ KIND[l.kind] }}</td><td><span class="k" :data-k="l.kyc_status">{{ l.kyc_status }}</span></td>
        <td class="n">{{ money(l.committed) }}<span class="sub">{{ l.funds }} fund{{ l.funds === 1 ? '' : 's' }}</span></td><td class="muted">{{ l.portal ? 'Link active' : '—' }}</td>
      </tr></tbody>
    </table>
    <p v-if="!data.length" class="muted">No LPs yet.</p>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; align-items: end; } .frm label { display: flex; flex-direction: column; gap: 6px; } .row { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; }
input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.k { text-transform: capitalize; font-size: 13px; font-weight: 500; } .k[data-k="approved"] { color: var(--c-ok); } .k[data-k="pending"] { color: var(--c-warn); } .k[data-k="expired"] { color: var(--c-danger); }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
</style>
