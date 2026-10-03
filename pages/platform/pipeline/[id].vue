<script setup lang="ts">
const id = useRoute().params.id as string
interface Lead { id: string; company: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; kind: string; country: string | null; source: string; stage: string; plan_code: string | null; seats: number | null; value_monthly_usd: string | null; billing: string; owner_id: string | null; owner: string | null; expected_close: string | null; lost_reason: string | null; notes: string | null; organization_id: string | null; organization_name: string | null }
interface Ev { id: string; kind: string; body: string | null; from_stage: string | null; to_stage: string | null; created_at: string; by_name: string | null }
const { data, refresh } = await useFetch<{ lead: Lead; events: Ev[] }>('/api/platform/leads/' + id)
const { data: plans } = await useFetch<{ plans: { code: string; name: string; active: boolean }[] }>('/api/platform/plans')
const { data: staff } = await useFetch<{ id: string; name: string }[]>('/api/platform/staff')
useHead({ title: () => 'Finvry · ' + (data.value?.lead.company ?? 'Lead') })
const STAGES = [['lead', 'Lead'], ['qualified', 'Qualified'], ['demo', 'Demo'], ['proposal', 'Proposal'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost']] as const
const label = (s: string | null) => STAGES.find(([k]) => k === s)?.[1] ?? s ?? ''
const busy = ref(false); const msg = ref(''); const ok = ref('')
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done = '') { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const setStage = (s: string) => run(async () => {
  const body = s === 'lost' ? prompt('Why was it lost?') : ''
  if (s === 'lost' && !body) return
  await $fetch('/api/platform/leads/' + id + '/events', { method: 'POST', body: { kind: 'stage', stage: s, body: body || undefined } })
})
const note = reactive({ kind: 'note', body: '' })
const addNote = () => run(async () => { await $fetch('/api/platform/leads/' + id + '/events', { method: 'POST', body: { ...note } }); note.body = '' })
const f = reactive({ company: '', contact_name: '', contact_email: '', contact_phone: '', kind: 'vc', country: '', source: 'inbound', plan_code: '', seats: '' as string | number, value_monthly_usd: '', billing: 'monthly', owner_id: '', expected_close: '', notes: '' })
watchEffect(() => { const l = data.value?.lead; if (!l) return; Object.assign(f, { company: l.company, contact_name: l.contact_name ?? '', contact_email: l.contact_email ?? '', contact_phone: l.contact_phone ?? '', kind: l.kind, country: l.country ?? '', source: l.source, plan_code: l.plan_code ?? '', seats: l.seats ?? '', value_monthly_usd: l.value_monthly_usd ?? '', billing: l.billing, owner_id: l.owner_id ?? '', expected_close: l.expected_close ?? '', notes: l.notes ?? '' }) })
const save = () => run(() => $fetch('/api/platform/leads', { method: 'POST', body: { id, ...f } }), 'Saved.')
const cv = reactive({ slug: '', plan_code: '', status: 'trial', trial_days: 14, admin_name: '', admin_email: '' })
watchEffect(() => { const l = data.value?.lead; if (!l || cv.slug) return; Object.assign(cv, { slug: l.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40), plan_code: l.plan_code ?? 'starter', admin_name: l.contact_name ?? '', admin_email: l.contact_email ?? '' }) })
async function convert() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ organization_id: string }>('/api/platform/leads/' + id + '/convert', { method: 'POST', body: cv }); await navigateTo('/platform/customers/' + r.organization_id + '?invited=1') }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const KIND: Record<string, string> = { vc: 'Venture firm', family_office: 'Family office', company: 'Company', fund_admin: 'Fund administrator', other: 'Other' }
const EV: Record<string, string> = { note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting', stage: 'Stage', converted: 'Became a customer' }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/platform/pipeline" class="back">← Pipeline</NuxtLink>
    <p class="label">{{ KIND[data.lead.kind] }}<template v-if="data.lead.country"> · {{ data.lead.country }}</template> · {{ data.lead.source }}</p>
    <div class="dh"><h1>{{ data.lead.company }}</h1><DeleteButton type="lead" :id="id" :name="data.lead.company" :url="'/api/platform/leads/' + id" to="/platform/pipeline" /></div>
    <div class="stages" role="group" aria-label="Stage">
      <button v-for="[k, l] in STAGES" :key="k" type="button" :class="{ on: data.lead.stage === k, won: k === 'won', lost: k === 'lost' }" :disabled="busy || data.lead.stage === k" @click="setStage(k)">{{ l }}</button>
    </div>
    <p v-if="data.lead.stage === 'lost' && data.lead.lost_reason" class="muted">Lost: {{ data.lead.lost_reason }}</p>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="grid">
      <div class="col">
        <div v-if="data.lead.organization_id" class="card cust"><b>Customer</b><NuxtLink :to="'/platform/customers/' + data.lead.organization_id">{{ data.lead.organization_name }} →</NuxtLink></div>
        <form v-else-if="data.lead.stage !== 'lost'" class="card frm2" @submit.prevent="convert">
          <h2>Convert to customer</h2>
          <p class="hint">Creates their isolated Finvry workspace, invites the first admin, and marks this deal won.</p>
          <label class="label">Link name<input v-model="cv.slug" required pattern="[a-z0-9][a-z0-9-]{1,40}"></label>
          <label class="label">Plan<select v-model="cv.plan_code"><option v-for="p in (plans?.plans ?? []).filter((x) => x.active && x.code !== 'internal')" :key="p.code" :value="p.code">{{ p.name }}</option></select></label>
          <label class="label">Start as<select v-model="cv.status"><option value="trial">Trial</option><option value="active">Active</option></select></label>
          <label v-if="cv.status === 'trial'" class="label">Trial days<input v-model.number="cv.trial_days" type="number" min="1" max="90"></label>
          <label class="label">First admin's name<input v-model="cv.admin_name" required maxlength="200"></label>
          <label class="label">First admin's email<input v-model="cv.admin_email" type="email" required maxlength="254"></label>
          <button class="btn" type="submit" :disabled="busy">Create workspace</button>
        </form>
        <div class="card">
          <h2>Activity</h2>
          <form class="nf" @submit.prevent="addNote">
            <select v-model="note.kind" aria-label="Type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option></select>
            <textarea v-model="note.body" rows="2" maxlength="5000" required placeholder="What happened, next step" />
            <button class="btn sm" type="submit" :disabled="busy">Add</button>
          </form>
          <ul class="tl"><li v-for="e in data.events" :key="e.id"><b>{{ EV[e.kind] }}<template v-if="e.kind === 'stage'">: {{ label(e.from_stage) }} → {{ label(e.to_stage) }}</template></b><span v-if="e.body" class="b">{{ e.body }}</span><span class="m">{{ e.by_name ?? '—' }} · {{ when(e.created_at) }}</span></li></ul>
          <p v-if="!data.events.length" class="muted">No activity yet.</p>
        </div>
      </div>
      <form class="card frm2" @submit.prevent="save">
        <h2>Details</h2>
        <label class="label">Company<input v-model="f.company" required maxlength="200"></label>
        <label class="label">Contact<input v-model="f.contact_name" maxlength="200"></label>
        <label class="label">Email<input v-model="f.contact_email" type="email" maxlength="254"></label>
        <label class="label">Phone<input v-model="f.contact_phone" maxlength="40"></label>
        <label class="label">Type<select v-model="f.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Country<input v-model="f.country" maxlength="100"></label>
        <label class="label">Source<select v-model="f.source"><option v-for="s in ['inbound', 'website', 'referral', 'event', 'outbound', 'partner', 'other']" :key="s" :value="s">{{ s }}</option></select></label>
        <label class="label">Plan<select v-model="f.plan_code"><option value="">Not decided</option><option v-for="p in (plans?.plans ?? []).filter((x) => x.code !== 'internal')" :key="p.code" :value="p.code">{{ p.name }}</option></select></label>
        <label class="label">Seats<input v-model="f.seats" inputmode="numeric"></label>
        <label class="label">Expected MRR (USD)<input v-model="f.value_monthly_usd" inputmode="decimal"></label>
        <label class="label">Billing<select v-model="f.billing"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
        <label class="label">Owner<select v-model="f.owner_id"><option v-for="s in staff ?? []" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
        <label class="label">Expected close<input v-model="f.expected_close" type="date"></label>
        <label class="label">Notes<textarea v-model="f.notes" rows="4" maxlength="5000" /></label>
        <button class="btn" type="submit" :disabled="busy">Save</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
.label { } h1 { margin-bottom: 12px; } h2 { margin-bottom: 10px; }
.stages { display: flex; flex-wrap: wrap; border: 1px solid var(--c-rule-strong); width: fit-content; background: #fff; margin-bottom: 12px; }
.stages button { font: inherit; font-size: 13px; padding: 8px 14px; background: #fff; border: 0; border-right: 1px solid var(--c-rule); cursor: pointer; color: var(--c-ink-soft); }
.stages button:last-child { border-right: 0; } .stages button.on { background: var(--c-navy); color: #fff; } .stages button.on.won { background: var(--c-ok); } .stages button.on.lost { background: var(--c-muted); }
.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 16px; }
.frm2 { display: flex; flex-direction: column; gap: 10px; } .frm2 label { display: flex; flex-direction: column; gap: 5px; } .frm2 .btn { align-self: flex-start; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12.5px; color: var(--c-muted); margin: 0; }
.cust { display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--c-ok); }
.nf { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; margin-bottom: 12px; align-items: start; }
.tl { list-style: none; padding: 0; margin: 0; } .tl li { padding: 9px 0; border-bottom: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 2px; }
.tl b { font-weight: 500; color: var(--c-navy); font-size: 14px; } .b { white-space: pre-wrap; font-size: 14px; } .m { font-size: 12px; color: var(--c-muted); }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
