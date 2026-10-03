<script setup lang="ts">
useHead({ title: 'Finvry · Pipeline' })
interface Lead { id: string; company: string; contact_name: string | null; kind: string; country: string | null; source: string; stage: string; plan: string | null; value_monthly_usd: string | null; billing: string; owner: string | null; expected_close: string | null; stage_changed_at: string; organization_id: string | null }
const route = useRoute()
const { data, refresh } = await useFetch<{ leads: Lead[]; kpis: { open: number; pipeline: number; weighted: number; wonMonth: number; wonMonthValue: number } }>('/api/platform/leads')
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean; price_monthly: string | null }[] }>('/api/platform/plans')
const COLS = [['lead', 'Lead'], ['qualified', 'Qualified'], ['demo', 'Demo'], ['proposal', 'Proposal'], ['negotiation', 'Negotiation']] as const
const col = (s: string) => (data.value?.leads ?? []).filter((l) => l.stage === s)
const closed = computed(() => (data.value?.leads ?? []).filter((l) => l.stage === 'won' || l.stage === 'lost').slice(0, 12))
const adding = ref(route.query.new === '1')
const f = reactive({ company: '', contact_name: '', contact_email: '', kind: 'vc', country: '', source: 'inbound', plan_code: '', value_monthly_usd: '', billing: 'monthly', expected_close: '', notes: '' })
watch(() => f.plan_code, (c) => { const p = plans.value?.plans.find((x) => x.code === c); if (p?.price_monthly && !f.value_monthly_usd) f.value_monthly_usd = p.price_monthly })
const msg = ref('')
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/platform/leads', { method: 'POST', body: f }); await navigateTo('/platform/pipeline/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the lead.' }
}
const usd = (v: number | string | null) => (v === null || v === '' ? '—' : '$' + Math.round(Number(v)).toLocaleString())
const days = (s: string) => Math.max(0, Math.floor((Date.now() - Date.parse(s)) / 86400000))
const KIND: Record<string, string> = { vc: 'Venture firm', family_office: 'Family office', company: 'Company', fund_admin: 'Fund administrator', other: 'Other' }
void refresh
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Pipeline</h1><button class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'New lead' }}</button></div>
    <div class="kpis">
      <div class="kpi"><span class="label">Open deals</span><b>{{ data.kpis.open }}</b></div>
      <div class="kpi"><span class="label">Pipeline MRR</span><b>{{ usd(data.kpis.pipeline) }}</b><span class="sub">if every open deal closes</span></div>
      <div class="kpi"><span class="label">Weighted MRR</span><b>{{ usd(data.kpis.weighted) }}</b><span class="sub">by stage probability</span></div>
      <div class="kpi"><span class="label">Won this month</span><b>{{ data.kpis.wonMonth }}</b><span class="sub">{{ usd(data.kpis.wonMonthValue) }} MRR</span></div>
    </div>
    <form v-if="adding" class="card frm" @submit.prevent="add">
      <label class="label">Company<input v-model="f.company" required maxlength="200"></label>
      <label class="label">Contact<input v-model="f.contact_name" maxlength="200"></label>
      <label class="label">Contact email<input v-model="f.contact_email" type="email" maxlength="254"></label>
      <label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Country<input v-model="f.country" maxlength="100"></label>
      <label class="label">Source<select v-model="f.source"><option v-for="s in ['inbound', 'website', 'referral', 'event', 'outbound', 'partner', 'other']" :key="s" :value="s">{{ s }}</option></select></label>
      <label class="label">Plan<select v-model="f.plan_code"><option value="">Not decided</option><option v-for="p in (plans?.plans ?? []).filter((x) => x.active && x.code !== 'internal')" :key="p.code" :value="p.code">{{ p.name }}</option></select></label>
      <label class="label">Expected MRR (USD)<input v-model="f.value_monthly_usd" inputmode="decimal"></label>
      <label class="label">Expected close<input v-model="f.expected_close" type="date"></label>
      <label class="label wide">Notes<textarea v-model="f.notes" rows="2" maxlength="5000" /></label>
      <div class="wide row"><button class="btn" type="submit">Add lead</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <div class="board">
      <div v-for="[k, l] in COLS" :key="k" class="col">
        <div class="ch"><span>{{ l }}</span><b>{{ col(k).length }}</b></div>
        <NuxtLink v-for="d in col(k)" :key="d.id" :to="'/platform/pipeline/' + d.id" class="lc">
          <b>{{ d.company }}</b>
          <span class="v">{{ usd(d.value_monthly_usd) }}<small v-if="d.value_monthly_usd"> /mo</small></span>
          <span class="m">{{ [d.plan, d.owner].filter(Boolean).join(' · ') || KIND[d.kind] }}</span>
          <span class="m">{{ days(d.stage_changed_at) }}d in stage<template v-if="d.expected_close"> · close {{ d.expected_close }}</template></span>
        </NuxtLink>
        <p v-if="!col(k).length" class="empty">—</p>
      </div>
    </div>
    <div v-if="closed.length" class="card closed">
      <h3>Recently closed</h3>
      <ul><li v-for="d in closed" :key="d.id"><NuxtLink :to="'/platform/pipeline/' + d.id">{{ d.company }}</NuxtLink><span :class="d.stage">{{ d.stage === 'won' ? 'Won' : 'Lost' }}<template v-if="d.stage === 'won' && d.organization_id"> · customer</template></span></li></ul>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 16px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.kpi b { font-family: var(--font-heading); font-weight: 500; font-size: 26px; color: var(--c-navy); } .sub { font-size: 12px; color: var(--c-muted); }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.row { display: flex; gap: 12px; align-items: center; }
.board { display: grid; grid-template-columns: repeat(5, minmax(180px, 1fr)); gap: 10px; overflow-x: auto; margin-bottom: 16px; }
.col { background: #efeeea; padding: 10px; min-height: 220px; display: flex; flex-direction: column; gap: 8px; }
.ch { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--c-muted); padding: 2px 2px 6px; }
.lc { background: #fff; border: 1px solid var(--c-rule); padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; text-decoration: none; color: var(--c-ink); }
.lc:hover { border-color: var(--c-blue); } .lc b { color: var(--c-navy); font-weight: 500; } .v { font-family: var(--font-heading); font-size: 18px; color: var(--c-blue-deep); } .v small { font-family: var(--font-body); font-size: 11px; color: var(--c-muted); }
.m { font-size: 11.5px; color: var(--c-muted); } .empty { color: var(--c-muted); text-align: center; margin: 12px 0; }
h3 { font-family: var(--font-heading); font-weight: 400; font-size: 20px; color: var(--c-navy); margin: 0 0 10px; }
.closed ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 24px; } .closed li { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 14px; }
.won { color: var(--c-ok); } .lost { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } .frm { grid-template-columns: 1fr; } }
</style>
