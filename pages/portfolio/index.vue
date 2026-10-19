<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
import type { PortfolioRow } from '~/server/api/portfolio/index.get'
useHead({ title: 'Portfolio' })
const { data, error, refresh } = await useFetch<PortfolioRow[]>('/api/portfolio')
const { data: candidates, refresh: refreshC } = await useFetch<{ id: string; company: string; founder_name: string | null; email: string | null }[]>('/api/portfolio/candidates')
const { data: pos } = await useLazyFetch<Record<string, { cost: number; recorded: number | null; implied: number | null; latest: string | null; currency: string }>>('/api/portfolio/positions', { server: false, default: () => ({}) })
const posTot = computed(() => { const v = rows.value.map((r) => pos.value?.[r.id]).filter((x): x is NonNullable<typeof x> => !!x); return v.length ? { cost: v.reduce((a, x) => a + x.cost, 0), recorded: v.reduce((a, x) => a + (x.recorded ?? x.cost), 0), implied: v.reduce((a, x) => a + (x.implied ?? x.recorded ?? x.cost), 0), n: v.length } : null })
const adding = ref(false)
const form = reactive({ deal_id: '', name: '', founder_name: '', founder_email: '', holding_entity_id: '', relationship: 'investment', finvry_org_id: '' })
const fv = ref<{ id: string; name: string } | null>(null); const fvPick = ref(false)
function pickFinvry(w: { id: string; name: string; owner_name: string | null; owner_email: string | null }) { fv.value = w; form.finvry_org_id = w.id; fvPick.value = false; if (!form.name) form.name = w.name; if (!form.founder_name && w.owner_name) form.founder_name = w.owner_name; if (!form.founder_email && w.owner_email) form.founder_email = w.owner_email }
const { data: entities } = await useFetch<{ id: string; name: string; kind: string }[]>('/api/entities')
const funds = computed(() => (entities.value ?? []).filter((e) => e.kind === 'fund' || e.kind === 'spv'))
const holder = ref('')
const rows = computed(() => (data.value ?? []).filter((r) => !holder.value || r.holder_id === holder.value))
const REL: Record<string, string> = { investment: 'Investment', subsidiary: 'Subsidiary', affiliate: 'Affiliate', managed: 'Managed' }
const msg = ref('')
watch(() => form.deal_id, (id) => { const c = candidates.value?.find((x) => x.id === id); if (c) { form.name = c.company; form.founder_name = c.founder_name ?? ''; form.founder_email = c.email ?? '' } })
async function add() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/portfolio', { method: 'POST', body: { ...form } }); await navigateTo('/portfolio/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the company.' }
}
const usd = (v: string | null) => (v === null ? '—' : shortAmount(v))
const runway = (r: PortfolioRow) => (r.cash && r.net_burn && Number(r.net_burn) > 0 ? (Number(r.cash) / Number(r.net_burn)).toFixed(1) + ' mo' : r.net_burn && Number(r.net_burn) <= 0 ? 'Profitable' : '—')
const mon = (p: string | null) => (p ? new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const STATUS: Record<string, string> = { sent: 'Link sent', in_progress: 'Started', submitted: 'Submitted' }
</script>

<template>
  <section>
    <p class="label">Venture Capital</p>
    <div class="head"><h1>Portfolio</h1><div class="tools"><select v-model="holder" aria-label="Filter by fund"><option value="">All funds</option><option v-for="e in funds" :key="e.id" :value="e.id">{{ e.name }}</option></select><a class="btn secondary" href="/api/portfolio/report-template" title="The Excel format portfolio companies report in: read exactly, with no AI">Report template</a><a class="btn secondary" href="/api/portfolio/export?format=xlsx">Export Excel</a><a class="btn secondary" href="/api/portfolio/export?format=pdf">Export PDF</a><button class="btn" type="button" @click="adding = true">Add company</button></div></div>
    <AppModal :open="adding" title="Add a portfolio company" @close="adding = false"><form class="mfrm" @submit.prevent="add">
      <label v-if="candidates?.length" class="label">From an Invested deal<select v-model="form.deal_id"><option value="">— Add by hand —</option><option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.company }}</option></select></label>
      <div class="label">Finvry workspace (optional)<span v-if="fv" class="fvp"><b>{{ fv.name }}</b><button type="button" class="lkb" @click="fv = null; form.finvry_org_id = ''">Remove</button></span><button v-else-if="!fvPick" type="button" class="lkb" @click="fvPick = true">If the company uses Finvry, link it to import its investor updates</button><FinvryPicker v-if="fvPick && !fv" @pick="pickFinvry" /></div>
      <label class="label">Company<input v-model="form.name" required maxlength="200"></label>
      <label class="label">Founder name<input v-model="form.founder_name" required maxlength="200"></label>
      <label class="label">Founder email<input v-model="form.founder_email" type="email" required maxlength="254"></label>
      <label class="label">Fund<select v-model="form.holding_entity_id"><option value="">{{ form.deal_id ? 'The deal\'s fund' : 'Default fund' }}</option><option v-for="e in funds" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Relationship<select v-model="form.relationship"><option value="investment">Investment (fund holds equity)</option><option value="subsidiary">Subsidiary (group owns)</option><option value="affiliate">Affiliate (strategic stake)</option><option value="managed">Managed</option></select></label>
      <button class="btn" type="submit">Add</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form></AppModal>
    <p v-if="error" class="error" role="alert">Could not load the portfolio.</p>
    <EmptyState v-else-if="!data?.length" card icon="portfolio" title="No portfolio companies yet" text="Add a company by hand, or mark a deal Invested in Pipeline and bring it across. Founders then send monthly figures through a secure link."><button class="btn" @click="adding = true">Add a company</button><NuxtLink to="/pipeline" class="btn secondary">Open pipeline</NuxtLink></EmptyState>
    <template v-else><div class="dk">
      <div class="k"><em>Invested</em><b>{{ posTot ? brief(usd(String(posTot.cost))) : '—' }}</b><i>{{ posTot ? posTot.n + ' compan' + (posTot.n === 1 ? 'y' : 'ies') + ' matched to Investments & AUM' : 'Match companies in Investments & AUM' }}</i></div>
      <div class="k"><em>Value on latest rounds</em><b>{{ posTot ? brief(usd(String(posTot.implied))) : '—' }}</b><i>{{ posTot ? (posTot.cost ? (posTot.implied / posTot.cost).toFixed(2) + '× · ' : '') + 'recorded ' + brief(usd(String(posTot.recorded))) : '' }}</i></div>
      <div class="k"><em>Combined revenue (latest)</em><b>{{ brief(usd(String(rows.reduce((a, r) => a + (Number(r.revenue) || 0), 0)))) }}</b><i>{{ rows.length }} compan{{ rows.length === 1 ? 'y' : 'ies' }}</i></div>
      <div class="k"><em>Reporting figures</em><b>{{ rows.filter((r) => r.latest_period).length }} of {{ rows.length }}</b><i>{{ rows.filter((r) => r.last_request_status && r.last_request_status !== 'submitted').length }} requests pending</i></div></div>
    <div class="tw"><table class="table">
      <thead><tr><th>Company</th><th>Held by</th><th>Latest figures</th><th>Revenue / month</th><th>Cash</th><th>Runway</th><th class="r">Invested</th><th class="r">Value on latest round</th><th>Last request</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td><NuxtLink :to="'/portfolio/' + r.id" class="co">{{ r.name }}</NuxtLink><NuxtLink v-if="r.finvry_new" :to="'/portfolio/' + r.id" class="fvn" title="New investor update on Finvry: import its figures">New update</NuxtLink><span class="sub">{{ r.founder_name }}{{ r.finvry ? ' · on Finvry' : '' }}</span></td>
          <td>{{ r.holder ?? '—' }}<span class="sub">{{ REL[r.relationship] }}</span></td>
          <td>{{ mon(r.latest_period) }}</td><td>{{ usd(r.revenue) }}</td><td>{{ usd(r.cash) }}</td><td>{{ runway(r) }}</td><td class="r">{{ pos?.[r.id] ? usd(String(pos[r.id]!.cost)) : '—' }}</td><td class="r">{{ pos?.[r.id]?.implied != null ? usd(String(pos[r.id]!.implied)) : pos?.[r.id]?.recorded != null ? usd(String(pos[r.id]!.recorded)) : '—' }}<span v-if="pos?.[r.id]?.implied != null && pos[r.id]!.cost" class="sub">{{ (pos[r.id]!.implied! / pos[r.id]!.cost).toFixed(2) }}× · {{ pos[r.id]!.latest }}</span></td>
          <td class="muted">{{ r.last_request_status ? STATUS[r.last_request_status] + ' · ' + mon(r.last_request_period) : 'None yet' }}</td>
        </tr>
      </tbody>
    </table></div></template>
  </section>
</template>

<style scoped>
.pt { display: flex; gap: 28px; align-items: baseline; flex-wrap: wrap; margin: 0 0 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--c-rule); } .pt em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .pt b { font-size: 18px; font-weight: 500; color: var(--c-navy); } .pt .mut { margin-left: auto; font-size: 12.5px; color: var(--c-muted); } td.r, th.r { text-align: right; }
.fvp { display: flex; gap: 10px; align-items: center; font-size: 14px; } .lkb { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; text-align: left; } .fvn { margin-left: 8px; font-size: 11px; font-weight: 600; padding: 1px 7px; background: #eaf1f7; color: #1e5079; text-decoration: none; }
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 20px; }
.tools { display: flex; gap: 10px; align-items: center; }
.add { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; }
.add label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; color: var(--c-muted); font-size: 12px; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr 1fr; } }
.mfrm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .mfrm label.label { display: flex; flex-direction: column; gap: 6px; } .mfrm .btn, .mfrm .hint, .mfrm .error { grid-column: 1 / -1; } .mfrm .btn { justify-self: start; }
.dk { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; } .k i { font-style: normal; font-size: 12px; color: var(--c-muted); } @media (max-width: 800px) { .dk { grid-template-columns: repeat(2, minmax(0, 1fr)); } } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; } .k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; letter-spacing: -.02em; } .tw { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } @media (max-width: 900px) { .dk { grid-template-columns: 1fr 1fr; } }
.tools a.btn { text-decoration: none; }
</style>
