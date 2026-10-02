<script setup lang="ts">
import type { PortfolioRow } from '~/server/api/portfolio/index.get'
useHead({ title: 'Portfolio — Aidi OS' })
const { data, error, refresh } = await useFetch<PortfolioRow[]>('/api/portfolio')
const { data: candidates, refresh: refreshC } = await useFetch<{ id: string; company: string; founder_name: string | null; email: string | null }[]>('/api/portfolio/candidates')
const adding = ref(false)
const form = reactive({ deal_id: '', name: '', founder_name: '', founder_email: '' })
const msg = ref('')
watch(() => form.deal_id, (id) => { const c = candidates.value?.find((x) => x.id === id); if (c) { form.name = c.company; form.founder_name = c.founder_name ?? ''; form.founder_email = c.email ?? '' } })
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/portfolio', { method: 'POST', body: { ...form } }); await navigateTo('/portfolio/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the company.' }
}
const usd = (v: string | null) => (v === null ? '—' : '$' + (Math.abs(Number(v)) >= 1e6 ? (Number(v) / 1e6).toFixed(1) + 'm' : Math.round(Number(v) / 1e3) + 'k'))
const runway = (r: PortfolioRow) => (r.cash && r.net_burn && Number(r.net_burn) > 0 ? (Number(r.cash) / Number(r.net_burn)).toFixed(1) + ' mo' : r.net_burn && Number(r.net_burn) <= 0 ? 'Profitable' : '—')
const mon = (p: string | null) => (p ? new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const STATUS: Record<string, string> = { sent: 'Link sent', in_progress: 'Started', submitted: 'Submitted' }
</script>

<template>
  <section>
    <p class="label">Aidi Ventures</p>
    <div class="head"><h1>Portfolio</h1><button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add company' }}</button></div>
    <form v-if="adding" class="card add" @submit.prevent="add">
      <label v-if="candidates?.length" class="label">From an Invested deal<select v-model="form.deal_id"><option value="">— Add by hand —</option><option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.company }}</option></select></label>
      <label class="label">Company<input v-model="form.name" required maxlength="200"></label>
      <label class="label">Founder name<input v-model="form.founder_name" required maxlength="200"></label>
      <label class="label">Founder email<input v-model="form.founder_email" type="email" required maxlength="254"></label>
      <button class="btn" type="submit">Add</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>
    <p v-if="error" class="error" role="alert">Could not load the portfolio.</p>
    <p v-else-if="!data?.length" class="muted">No portfolio companies yet. Add one, or mark a deal Invested in Pipeline first.</p>
    <table v-else class="table">
      <thead><tr><th>Company</th><th>Latest month</th><th>Revenue</th><th>Cash</th><th>Runway</th><th>Last request</th></tr></thead>
      <tbody>
        <tr v-for="r in data" :key="r.id">
          <td><NuxtLink :to="'/portfolio/' + r.id" class="co">{{ r.name }}</NuxtLink><span class="sub">{{ r.founder_name }}</span></td>
          <td>{{ mon(r.latest_period) }}</td><td>{{ usd(r.revenue) }}</td><td>{{ usd(r.cash) }}</td><td>{{ runway(r) }}</td>
          <td class="muted">{{ r.last_request_status ? STATUS[r.last_request_status] + ' · ' + mon(r.last_request_period) : 'None yet' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; }
.add { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 12px 16px; align-items: end; margin-bottom: 20px; }
.add label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; color: var(--c-muted); font-size: 12px; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr 1fr; } }
</style>
