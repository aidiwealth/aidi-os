<script setup lang="ts">
// Secondaries: SPV and secondary opportunities from Meridian (AngelList) and Wefunder, picked up from Notices as the
// alerts arrive, plus any added by hand. Review, mark interest, record what was invested.
useHead({ title: 'Secondaries' })
interface S { id: string; source: 'meridian' | 'wefunder' | 'other'; ref: string | null; title: string; company: string | null; sector: string | null; stage: string | null; lead: string | null; co_investors: string | null; min_investment: number | null; valuation: string | null; currency: string; url: string | null; notice_id: string | null; received_at: string; status: string; amount: number | null; notes: string | null; fits: boolean | null; fit_note: string | null; client_visible: boolean; pipeline_deal_id: string | null; portfolio_company_id: string | null; closes_at: string | null; interest: number }
const route = useRoute(), router = useRouter()
const STATUSES = [['new', 'New'], ['reviewing', 'Reviewing'], ['interested', 'Interested'], ['invested', 'Invested'], ['passed', 'Passed'], ['expired', 'Expired']] as const
const SOURCES: Record<string, string> = { meridian: 'Meridian', wefunder: 'Wefunder', other: 'Other' }
const status = ref(String(route.query.status ?? 'open')), source = ref(String(route.query.source ?? '')), q = ref(String(route.query.q ?? '')), page = ref(1), size = ref(25)
const qd = ref(q.value); let qt: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => { clearTimeout(qt); qt = setTimeout(() => { qd.value = v.trim(); page.value = 1 }, 300) })
watch([status, source, size], () => { page.value = 1 })
watch([status, source, qd], () => router.replace({ query: { status: status.value !== 'open' ? status.value : undefined, source: source.value || undefined, q: qd.value || undefined } }))
const { data, refresh, pending } = await useFetch<{ criteria: { stages: string[]; sectors: string[]; expiry_days: number }; stages: string[]; rows: S[]; total: number; page: number; pages: number; size: number; counts: { status: string; n: number }[]; kpi: { month: number; invested: number } }>('/api/secondaries', { query: { status, source, q: qd, page, size } })
const cnt = (s: string) => data.value?.counts.find((c) => c.status === s)?.n ?? 0
const openCount = computed(() => cnt('new') + cnt('reviewing') + cnt('interested'))
const usd = (v: number | null | undefined) => (v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v).toLocaleString('en-US')))
const daysTo = (d: string) => Math.round((new Date(d + 'T00:00:00Z').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) / 86400e3)
const closeLabel = (r: S) => { if (!r.closes_at) return '—'; const n = daysTo(r.closes_at); return r.status === 'expired' || n < 0 ? 'Closed ' + day(r.closes_at) : n === 0 ? 'Closes today' : 'In ' + n + ' day' + (n === 1 ? '' : 's') }
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const from = computed(() => (data.value ? (data.value.page - 1) * data.value.size + 1 : 0)), to = computed(() => (data.value ? Math.min(data.value.total, data.value.page * data.value.size) : 0))
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const okMsg = ref(''), msg = ref('')
async function setStatus(r: S, s: string) { try { await $fetch('/api/secondaries', { method: 'POST', body: { id: r.id, status: s } }); await refresh() } catch (e) { msg.value = err(e) } }
// Pick up deal alerts already in Notices.
const scanning = ref(false)
async function scan() { scanning.value = true; msg.value = ''; try { const r = await $fetch<{ emails: number; added: number }>('/api/secondaries/scan', { method: 'POST' }); okMsg.value = r.emails ? r.added + ' new opportunit' + (r.added === 1 ? 'y' : 'ies') + ' from ' + r.emails + ' deal alert' + (r.emails === 1 ? '' : 's') + ' in Notices.' : 'No Meridian or Wefunder alerts in Notices yet.'; await refresh() } catch (e) { msg.value = err(e) } finally { scanning.value = false } }
// One opportunity: view and edit.
const blank = () => ({ id: '', title: '', company: '', sector: '', stage: '', lead: '', co_investors: '', min_investment: '' as string | number, valuation: '', url: '', status: 'new', amount: '' as string | number, notes: '', source: 'other' as S['source'], notice_id: null as string | null, received_at: '', client_visible: true, closes_at: '', pipeline_deal_id: null as string | null, portfolio_company_id: null as string | null, fits: null as boolean | null, fit_note: null as string | null })
const f = reactive({ open: false, busy: false, msg: '', ...blank() })
function edit(r?: S) { det.value = null; inv.client_id = ''; inv.amount = ''; inv.msg = ''; if (r) void loadDet(r.id); Object.assign(f, blank(), r ? { ...r, company: r.company ?? '', sector: r.sector ?? '', stage: r.stage ?? '', lead: r.lead ?? '', co_investors: r.co_investors ?? '', min_investment: r.min_investment ?? '', valuation: r.valuation ?? '', url: r.url ?? '', amount: r.amount ?? '', notes: r.notes ?? '', closes_at: r.closes_at ?? '' } : {}, { open: true, busy: false, msg: '' }) }
async function save() {
  f.busy = true; f.msg = ''
  try { const { open: _o, busy: _b, msg: _m, notice_id: _n, received_at: _r, pipeline_deal_id: _p, portfolio_company_id: _pc, fits: _f, fit_note: _fn, id, ...body } = f; await $fetch('/api/secondaries', { method: 'POST', body: { id: id || undefined, ...body } }); f.open = false; await refresh() }
  catch (e) { f.msg = err(e) } finally { f.busy = false }
}
// Deal detail: wealth clients interested and investments recorded.
interface Det { entities: { id: string; name: string; kind: string }[]; portfolio: { id: string; name: string; held_by: string | null } | null; matches: { id: string; name: string; held_by: string | null }[]; interest: { above_risk?: boolean; risk_profile?: string | null; id: string; client_id: string; client: string; amount: number | null; note: string | null; status: string; created_at: string }[]; investments: { id: string; amount: number; value: number | null; currency: string; date: string; investor: string; wm_client_id: string | null }[]; clients: { id: string; name: string; above_risk?: boolean }[] }
const det = ref<Det | null>(null)
async function loadDet(id: string) { try { det.value = await $fetch<Det>('/api/secondaries/' + id) } catch { det.value = null } }
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const inv = reactive({ client_id: '', amount: '' as string | number, value: '' as string | number, date: today(), busy: false, msg: '' })
function investFor(i?: Det['interest'][number]) { inv.client_id = i ? 'c:' + i.client_id : ''; inv.amount = i?.amount ?? ''; inv.date = today(); inv.msg = '' }
async function invest() {
  inv.busy = true; inv.msg = ''
  try { const res = await $fetch<{ warning: string | null }>('/api/secondaries/' + f.id + '/invest', { method: 'POST', body: { client_id: inv.client_id.startsWith('c:') ? inv.client_id.slice(2) : null, entity_id: inv.client_id.startsWith('e:') ? inv.client_id.slice(2) : null, amount: inv.amount, value: inv.value === '' ? null : inv.value, date: inv.date } }); f.status = 'invested'; const who = inv.client_id; inv.amount = ''; inv.value = ''; await Promise.all([loadDet(f.id), refresh()]); inv.msg = 'Recorded. It now shows under Secondaries in ' + (who.startsWith('c:') ? "the client's holdings" : 'Investments & AUM') + '.' + (res.warning ? ' Note: ' + res.warning : '') }
  catch (e) { inv.msg = err(e) } finally { inv.busy = false }
}
const pipeBusy = ref(false)
async function toPipeline() { pipeBusy.value = true; f.msg = ''; try { const r = await $fetch<{ id: string }>('/api/secondaries/' + f.id + '/pipeline', { method: 'POST' }); f.pipeline_deal_id = r.id; if (f.status === 'new') f.status = 'reviewing'; await refresh() } catch (e) { f.msg = err(e) } finally { pipeBusy.value = false } }
// Add to Portfolio: a new portfolio company of one of our funds, or link one that exists.
const pf = reactive({ open: false, entity: '', founder_name: '', founder_email: '', busy: false, msg: '' })
function openPf() { Object.assign(pf, { open: true, entity: det.value?.entities.find((e) => /angel/i.test(e.name))?.id ?? det.value?.entities.find((e) => e.kind === 'fund')?.id ?? '', founder_name: '', founder_email: '', busy: false, msg: '' }) }
async function toPortfolio(existing?: string) { pf.busy = true; pf.msg = ''; try { const r = await $fetch<{ id: string }>('/api/secondaries/' + f.id + '/portfolio', { method: 'POST', body: existing ? { existing_id: existing } : { holding_entity_id: pf.entity, name: f.company || undefined, founder_name: pf.founder_name, founder_email: pf.founder_email } }); f.portfolio_company_id = r.id; pf.open = false; await Promise.all([loadDet(f.id), refresh()]) } catch (e) { pf.msg = err(e) } finally { pf.busy = false } }
// Criteria: stages we allow and sectors we focus on.
const cr = reactive({ open: false, stages: [] as string[], sectors: [] as string[], expiry_days: 21, add: '', busy: false, msg: '' })
function openCriteria() { Object.assign(cr, { open: true, stages: [...(data.value?.criteria.stages ?? [])], sectors: [...(data.value?.criteria.sectors ?? [])], expiry_days: data.value?.criteria.expiry_days ?? 21, add: '', msg: '' }) }
function addSector() { const v = cr.add.trim(); if (v && !cr.sectors.some((x) => x.toLowerCase() === v.toLowerCase())) cr.sectors.push(v); cr.add = '' }
async function saveCriteria() { cr.busy = true; cr.msg = ''; try { const r = await $fetch<{ passed: number; reopened: number }>('/api/secondaries/criteria', { method: 'POST', body: { stages: cr.stages, sectors: cr.sectors, expiry_days: cr.expiry_days } }); cr.open = false; okMsg.value = 'Criteria saved.' + (r.passed ? ' ' + r.passed + ' open deal' + (r.passed === 1 ? '' : 's') + ' moved to Passed.' : '') + (r.reopened ? ' ' + r.reopened + ' brought back to New.' : ''); await refresh() } catch (e) { cr.msg = err(e) } finally { cr.busy = false } }
</script>
<template>
  <section v-if="data" class="sc">
    <p class="label">Wealth management</p>
    <div class="head"><div><h1>Secondaries</h1><p class="lead">SPV and secondary deals from Meridian and Wefunder, picked up automatically from deal alerts in Notices. Review them, mark the ones you like, and record what you invest.</p></div>
      <div class="row"><button class="btn secondary" @click="openCriteria">Criteria</button><button class="btn secondary" :disabled="scanning" @click="scan">{{ scanning ? 'Checking…' : 'Check Notices' }}</button><button class="btn" @click="edit()">Add a deal</button></div></div>
    <p class="crit">We invest in <b>{{ data.criteria.stages.join(', ') }}</b> deals in <b>{{ data.criteria.sectors.join(', ') }}</b>. Deals outside these go to Passed with the reason. <button class="lk" @click="openCriteria">Change</button></p>
    <div class="fx-stats">
      <StatTile label="Open deals" :value="openCount" icon="briefcase" tone="n" :note="cnt('new') + ' new · ' + cnt('reviewing') + ' reviewing'" clickable :on="status === 'open'" @click="status = 'open'" />
      <StatTile label="Interested" :value="cnt('interested')" icon="flag" tone="b" note="Shortlisted to invest" clickable :on="status === 'interested'" @click="status = 'interested'" />
      <StatTile label="Invested" :value="usd(data.kpi.invested)" icon="money" tone="c" :note="cnt('invested') + ' deal' + (cnt('invested') === 1 ? '' : 's')" clickable :on="status === 'invested'" @click="status = 'invested'" />
      <StatTile label="This month" :value="data.kpi.month" icon="calendar" tone="a" note="New deals received" />
    </div>
    <nav class="tabs"><button :class="{ on: status === 'open' }" @click="status = 'open'">Open<em>{{ openCount }}</em></button><button v-for="[k, l] in STATUSES" :key="k" :class="{ on: status === k }" @click="status = k">{{ l }}<em>{{ cnt(k) }}</em></button><button :class="{ on: status === 'all' }" @click="status = 'all'">All</button></nav>
    <div class="tools"><div class="srch"><input v-model="q" type="search" placeholder="Search deal, sector, lead or co-investor" aria-label="Search"><button v-if="q" class="clr" aria-label="Clear search" @click="q = ''">×</button></div>
      <select v-model="source" aria-label="Source"><option value="">All sources</option><option value="meridian">Meridian</option><option value="wefunder">Wefunder</option><option value="other">Added by hand</option></select>
      <span class="rc">{{ data.total ? from + '–' + to + ' of ' + data.total : '' }}</span></div>
    <p v-if="okMsg" class="okm">{{ okMsg }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <div v-if="data.rows.length" class="box" :class="{ dim: pending }">
      <table data-nosearch><thead><tr><th>Deal</th><th class="ld">Lead and co-investors</th><th class="n">Minimum</th><th class="cl">Clients</th><th class="src">Source</th><th class="rd">Closes</th><th class="st">Status</th></tr></thead>
        <tbody><tr v-for="r in data.rows" :key="r.id" @click="edit(r)">
          <td class="mn"><b>{{ r.company ? r.company + ' · ' : '' }}{{ r.title }}</b><span>{{ [r.sector, r.stage].filter(Boolean).join(' · ') || '—' }}{{ r.valuation ? ' · ' + r.valuation : '' }}{{ r.status === 'invested' && r.amount ? ' · invested ' + usd(r.amount) : '' }}</span><em v-if="r.fit_note" class="fn" :class="{ out: r.fits === false }">{{ r.fits === false ? 'Outside criteria: ' : 'Check: ' }}{{ r.fit_note }}</em><em v-if="r.pipeline_deal_id || r.portfolio_company_id" class="fn">{{ [r.pipeline_deal_id ? 'In Pipeline' : '', r.portfolio_company_id ? 'Portfolio company' : ''].filter(Boolean).join(' · ') }}</em></td>
          <td class="ld">{{ r.lead || '—' }}<em v-if="r.co_investors">with {{ r.co_investors }}</em></td>
          <td class="n">{{ usd(r.min_investment) }}</td><td class="cl">{{ r.interest ? r.interest + ' interested' : '—' }}</td>
          <td class="src">{{ SOURCES[r.source] }}<a v-if="r.url" :href="r.url" target="_blank" rel="noopener" @click.stop>View ↗</a></td>
          <td class="rd" :class="{ soon: r.closes_at && daysTo(r.closes_at) >= 0 && daysTo(r.closes_at) <= 3 && ['new','reviewing','interested'].includes(r.status) }">{{ closeLabel(r) }}<em>arrived {{ day(r.received_at) }}</em></td>
          <td class="st" @click.stop><select :value="r.status" :aria-label="'Status of ' + r.title" @change="setStatus(r, ($event.target as HTMLSelectElement).value)"><option v-for="[k, l] in STATUSES" :key="k" :value="k">{{ l }}</option></select></td></tr></tbody></table>
      <div v-if="data.total > 25" class="pg"><span>{{ from }}–{{ to }} of {{ data.total }}</span><label>Show <select v-model.number="size"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
        <button class="btn secondary sm" :disabled="data.page <= 1" @click="page = data.page - 1">‹ Prev</button><span>Page {{ data.page }} of {{ data.pages }}</span><button class="btn secondary sm" :disabled="data.page >= data.pages" @click="page = data.page + 1">Next ›</button></div>
    </div>
    <EmptyState v-else card icon="funnel" :title="qd || source ? 'No deals match' : status === 'open' ? 'No open deals yet' : 'Nothing here'" text="Meridian and Wefunder deal alerts that reach Notices are added here automatically. Already have some in Notices? Check Notices to pick them up."><button class="btn secondary" :disabled="scanning" @click="scan">Check Notices</button></EmptyState>

    <AppModal :open="f.open" :title="f.id ? 'Deal' : 'Add a deal'" wide @close="f.open = false">
      <form id="scf" class="frm" @submit.prevent="save">
        <p v-if="f.id" class="mut">{{ SOURCES[f.source] }}{{ f.received_at ? ' · received ' + new Date(f.received_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' }}<template v-if="f.url"> · <a :href="f.url" target="_blank" rel="noopener">Open on {{ SOURCES[f.source] === 'Other' ? 'the site' : SOURCES[f.source] }} ↗</a></template><template v-if="f.notice_id"> · <NuxtLink to="/notices?status=all">From Notices</NuxtLink></template></p>
        <label class="label">What it is<textarea v-model="f.title" rows="2" maxlength="500" required placeholder="e.g. Speech AI for emotion and speaking style" /></label>
        <div class="g3"><label class="label">Company (once known)<input v-model="f.company" maxlength="200"></label><label class="label">Sector<input v-model="f.sector" maxlength="120" placeholder="e.g. AI / ML"></label><label class="label">Stage<input v-model="f.stage" maxlength="60" placeholder="e.g. Seed, Series B+"></label></div>
        <div class="g2"><label class="label">Lead<input v-model="f.lead" maxlength="300"></label><label class="label">Co-investors<input v-model="f.co_investors" maxlength="300"></label></div>
        <div class="g3"><label class="label">Minimum (USD)<input v-model="f.min_investment" inputmode="decimal"></label><label class="label">Valuation or cap<input v-model="f.valuation" maxlength="120"></label><label class="label">Link<input v-model="f.url" type="url" maxlength="1000" placeholder="https://"></label></div>
        <div class="g3"><label class="label">Status<select v-model="f.status"><option v-for="[k, l] in STATUSES" :key="k" :value="k">{{ l }}</option></select></label><label class="label">Amount invested (USD)<input v-model="f.amount" inputmode="decimal" :disabled="f.status !== 'invested'" :placeholder="f.status === 'invested' ? '' : 'When invested'"></label>
          <label class="label">Closes on<input v-model="f.closes_at" type="date"></label>
          <label v-if="!f.id" class="label">Source<select v-model="f.source"><option value="meridian">Meridian</option><option value="wefunder">Wefunder</option><option value="other">Other</option></select></label></div>
        <label class="ck"><input v-model="f.client_visible" type="checkbox"> Show to wealth management clients (on their dashboard, without the source or link)</label>
        <p v-if="f.fit_note" class="mut">{{ f.fits === false ? 'Outside our criteria' : 'Check fit' }}: {{ f.fit_note }}</p>
        <label class="label">Notes<textarea v-model="f.notes" rows="3" maxlength="5000" placeholder="Thesis, questions, who looked at it" /></label>
        <p v-if="f.msg" class="error">{{ f.msg }}</p></form>
      <div v-if="f.id" class="xs">
        <div class="xh"><b>Pipeline</b><NuxtLink v-if="f.pipeline_deal_id" :to="'/pipeline/' + f.pipeline_deal_id" class="btn secondary sm">Open in Pipeline</NuxtLink><button v-else class="btn secondary sm" type="button" :disabled="pipeBusy" @click="toPipeline">{{ pipeBusy ? 'Moving…' : 'Move to Pipeline' }}</button></div>
        <div class="xh"><b>Portfolio</b><NuxtLink v-if="det?.portfolio" :to="'/portfolio/' + det.portfolio.id" class="btn secondary sm">Open {{ det.portfolio.name }}{{ det.portfolio.held_by ? ' (' + det.portfolio.held_by + ')' : '' }}</NuxtLink><template v-else><button v-for="m in det?.matches ?? []" :key="m.id" class="btn secondary sm" type="button" :disabled="pf.busy" @click="toPortfolio(m.id)">Link to {{ m.name }}{{ m.held_by ? ' (' + m.held_by + ')' : '' }}</button><button v-if="!pf.open" class="btn secondary sm" type="button" @click="openPf">Add to Portfolio</button></template></div>
        <div v-if="pf.open && !det?.portfolio" class="pff"><select v-model="pf.entity" aria-label="Held by"><option value="" disabled>Held by…</option><option v-for="e in (det?.entities ?? []).filter((x) => ['fund', 'spv'].includes(x.kind))" :key="e.id" :value="e.id">{{ e.name }}</option></select><input v-model="pf.founder_name" maxlength="200" placeholder="Founder name" aria-label="Founder name"><input v-model="pf.founder_email" type="email" maxlength="254" placeholder="Founder email" aria-label="Founder email"><button class="btn sm" type="button" :disabled="pf.busy || !pf.entity || !pf.founder_name || !pf.founder_email" @click="toPortfolio()">Add</button><button class="lk" type="button" @click="pf.open = false">Cancel</button><p v-if="pf.msg" class="error">{{ pf.msg }}</p></div>
        <div class="xh"><b>Wealth clients</b><span class="mut">{{ det?.interest.filter((i) => i.status !== 'withdrawn').length ?? 0 }} interested</span></div>
        <div v-for="i in det?.interest ?? []" :key="i.id" class="ir"><span><b>{{ i.client }}</b><em>{{ i.status === 'invested' ? 'Invested' : i.status === 'withdrawn' ? 'Withdrew' : 'Interested' }}{{ i.amount ? ' · ' + usd(i.amount) : '' }}{{ i.note ? ' · ' + i.note : '' }}<template v-if="i.above_risk"> · <span class="wr">{{ i.risk_profile ? 'Above their risk level' : 'Risk level not set' }}</span></template></em></span><button v-if="i.status === 'interested'" class="lk" type="button" @click="investFor(i)">Record investment</button></div>
        <div class="xh"><b>Investments</b><span class="mut">Each one is a holding in the Secondaries asset class</span></div>
        <div v-for="x in det?.investments ?? []" :key="x.id" class="ir"><span><b>{{ x.investor }}</b><em>{{ usd(x.amount) }} on {{ x.date }}{{ x.value != null && x.value !== x.amount ? ' · now ' + usd(x.value) + ' (' + (x.value / x.amount).toFixed(2) + 'x)' : '' }}</em></span></div>
        <div class="ivf"><select v-model="inv.client_id" aria-label="Investor"><option value="">The group (Investments &amp; AUM)</option><optgroup v-if="det?.entities.length" label="Our funds and companies"><option v-for="e in det.entities" :key="e.id" :value="'e:' + e.id">{{ e.name }}</option></optgroup><optgroup v-if="det?.clients.length" label="Wealth clients"><option v-for="c in det.clients" :key="c.id" :value="'c:' + c.id">{{ c.name }}{{ c.above_risk ? ' (above risk level)' : '' }}</option></optgroup></select><input v-model="inv.amount" inputmode="decimal" placeholder="Amount (USD)" aria-label="Amount"><input v-model="inv.value" inputmode="decimal" placeholder="Value now (optional)" aria-label="Value now"><input v-model="inv.date" type="date" aria-label="Date invested"><button class="btn sm" type="button" :disabled="inv.busy || !inv.amount" @click="invest">{{ inv.busy ? 'Saving…' : 'Record investment' }}</button></div>
        <p v-if="inv.msg" class="mut">{{ inv.msg }}</p>
      </div>

      <template #foot><DeleteButton v-if="f.id" type="secondary" :id="f.id" :name="f.title" link @deleted="f.open = false; refresh()" /><span class="sp" /><button class="btn secondary" @click="f.open = false">Cancel</button><button class="btn" type="submit" form="scf" :disabled="f.busy">{{ f.busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
    <AppModal :open="cr.open" title="What we invest in" @close="cr.open = false">
      <div class="frm"><span class="k">Stages</span><div class="chk"><label v-for="st in data.stages" :key="st"><input v-model="cr.stages" type="checkbox" :value="st"> {{ st }}</label></div>
        <span class="k">Focus sectors</span><div class="tags"><span v-for="(x, i) in cr.sectors" :key="x" class="tg2">{{ x }}<button type="button" :aria-label="'Remove ' + x" @click="cr.sectors.splice(i, 1)">×</button></span></div>
        <form class="addr" @submit.prevent="addSector"><input v-model="cr.add" maxlength="40" placeholder="Add a sector, e.g. Healthtech"><button class="btn secondary sm" :disabled="!cr.add.trim()">Add</button></form>
        <label class="label">Deals expire after (days, when the alert gives no closing date)<input v-model.number="cr.expiry_days" type="number" min="1" max="365" style="max-width:120px"></label>
        <p class="mut">AI/ML also matches AI, machine learning and LLM; Fintech matches payments, banking and lending; Enterprise matches B2B; SaaS matches software. Open deals are re-checked when you save.</p><p v-if="cr.msg" class="error">{{ cr.msg }}</p></div>
      <template #foot><button class="btn secondary" @click="cr.open = false">Cancel</button><button class="btn" :disabled="cr.busy || !cr.stages.length || !cr.sectors.length" @click="saveCriteria">Save criteria</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.wr { color: var(--c-warn); }
.crit { font-size: 13.5px; color: var(--c-ink-soft); margin: 10px 0 0; } .crit b { font-weight: 500; color: var(--c-ink); } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.fn { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); margin-top: 2px; } .fn.out { color: var(--c-warn); } .cl { width: 100px; color: var(--c-ink-soft); white-space: nowrap; }
.ck { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.xs { border-top: 1px solid var(--c-rule); margin-top: 16px; padding-top: 14px; display: flex; flex-direction: column; gap: 8px; } .xh { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 6px; } .xh b { font-weight: 600; font-size: 14px; }
.ir { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .ir em { display: block; font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.ivf { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 8px; margin-top: 4px; } .ivf input[type=date] { grid-column: 1; } .ivf .btn { justify-self: start; } .pff { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr auto auto; gap: 8px; align-items: center; } .pff .error { grid-column: 1 / -1; } .xh .btn + .btn { margin-left: 6px; }
.rd em { display: block; font-style: normal; font-size: 11.5px; color: var(--c-muted); } .rd.soon { color: var(--c-warn); }
.k { font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); } .chk { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13.5px; } .chk label { display: flex; gap: 6px; align-items: center; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; } .tg2 { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--c-rule-strong); padding: 3px 8px; font-size: 13px; } .tg2 button { background: none; border: 0; padding: 0; font-size: 15px; line-height: 1; color: var(--c-muted); cursor: pointer; } .addr { display: flex; gap: 8px; } .addr input { flex: 1; }
@media (max-width: 760px) { .ivf, .pff { grid-template-columns: 1fr; } .cl { display: none; } }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; max-width: 720px; } .row { display: flex; gap: 8px; flex-wrap: wrap; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 12px; overflow-x: auto; } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; white-space: nowrap; } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .tabs em { font-style: normal; font-size: 12px; margin-left: 6px; color: var(--c-muted); }
.tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .srch { position: relative; flex: 1; min-width: 240px; max-width: 420px; } .srch input { width: 100%; padding-right: 30px; } .clr { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; } .rc { margin-left: auto; font-size: 13px; color: var(--c-muted); }
.okm { font-size: 13.5px; margin: 0 0 8px; } .error { color: var(--c-danger); margin: 0 0 8px; font-size: 13px; } .mut { font-size: 13px; color: var(--c-muted); margin: 0; } .mut a { color: var(--c-blue-deep); }
.box { background: #fff; border: 1px solid var(--c-rule); overflow-x: auto; } .box.dim { opacity: .6; } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; } td { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } tbody tr { cursor: pointer; } tbody tr:hover { background: #fafaf8; } tbody tr:last-child td { border-bottom: 0; }
.mn { min-width: 260px; } .mn b { display: block; font-weight: 500; font-size: 14px; line-height: 1.4; } .mn span { font-size: 12.5px; color: var(--c-muted); }
.ld { width: 220px; color: var(--c-ink-soft); } .ld em { display: block; font-style: normal; font-size: 12.5px; color: var(--c-muted); } .n { text-align: right; white-space: nowrap; } th.n { text-align: right; }
.src { width: 110px; } .src a { display: block; font-size: 12.5px; color: var(--c-blue-deep); text-decoration: none; } .rd { width: 110px; color: var(--c-ink-soft); white-space: nowrap; } .st { width: 130px; } .st select { width: 100%; }
.pg { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid var(--c-rule); font-size: 13px; color: var(--c-ink-soft); }
input, select, textarea { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; } .sp { flex: 1; }
@media (max-width: 760px) { .g2, .g3 { grid-template-columns: 1fr; } .ld, .src { display: none; } }
</style>
