<script setup lang="ts">
const id = useRoute().params.id as string
interface Co { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; registration_number: string | null; ein: string | null; formation_date: string | null; fiscal_year_end: string | null; address: string | null; registered_agent: string; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string; notes: string | null }
interface Pe { id: string; name: string; email: string | null; phone: string | null; role: string; ownership_pct: string | null; company_id: string | null; company: string | null; address: string | null; nationality: string | null; portal_access: boolean }
interface D { client: { id: string; name: string; kind: string; contact_name: string; email: string; phone: string | null; country: string | null; address: string | null; notes: string | null; status: string }
  companies: Co[]; people: Pe[]; jobs: { id: string; title: string; service: string; status: string; due_date: string | null }[]; invoices: { id: string; number: string; currency: string; amount: string; status: string; due_date: string; overdue: boolean }[]; requests: { id: string; tax_year: number; status: string; sent_to: string; company: string | null; submitted_at: string | null }[] }
const { data, refresh } = await useFetch<D>('/api/services/clients/' + id)
useHead({ title: () => data.value?.client.name ?? 'Client' })
const tab = ref<'companies' | 'people' | 'jobs' | 'invoices' | 'messages' | 'details'>('companies')
const msg = ref(''); const ok = ref('')
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done: string) { msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } }
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp (Inc)', s_corp: 'S-Corp', ltd: 'Limited (Ltd)', plc: 'PLC', other: 'Other' }
const ROLES: Record<string, string> = { contact: 'Contact', owner: 'Owner or shareholder', director: 'Director', officer: 'Officer', other: 'Other' }
const blankCo = () => ({ id: '', name: '', entity_type: 'llc', jurisdiction: 'Delaware', country: 'United States', registration_number: '', ein: '', formation_date: '', fiscal_year_end: '12-31', address: '', registered_agent: 'ours', agent_renewal: '', virtual_office: false, mailbox: false, status: 'active', notes: '' })
const co = reactive(blankCo()); const editingCo = ref(false)
function editCo(c?: Co) { Object.assign(co, blankCo(), c ? { ...c, jurisdiction: c.jurisdiction ?? '', registration_number: c.registration_number ?? '', ein: c.ein ?? '', formation_date: c.formation_date ?? '', fiscal_year_end: c.fiscal_year_end ?? '', address: c.address ?? '', agent_renewal: c.agent_renewal ?? '', notes: c.notes ?? '' } : {}); editingCo.value = true }
const saveCo = () => run(async () => { await $fetch('/api/services/clients/' + id + '/companies', { method: 'POST', body: { ...co, id: co.id || undefined } }); editingCo.value = false }, 'Company saved.')
const blankPe = () => ({ id: '', name: '', email: '', phone: '', role: 'contact', ownership_pct: '' as string | number, company_id: '', address: '', nationality: '', portal_access: false })
const pe = reactive(blankPe()); const editingPe = ref(false)
function editPe(p?: Pe) { Object.assign(pe, blankPe(), p ? { ...p, email: p.email ?? '', phone: p.phone ?? '', ownership_pct: p.ownership_pct ?? '', company_id: p.company_id ?? '', address: p.address ?? '', nationality: p.nationality ?? '' } : {}); editingPe.value = true }
const savePe = () => run(async () => { await $fetch('/api/services/clients/' + id + '/people', { method: 'POST', body: { ...pe, id: pe.id || undefined } }); editingPe.value = false }, 'Person saved.')
const cl = reactive({ name: '', kind: 'company', contact_name: '', email: '', phone: '', country: '', address: '', notes: '', status: 'active' })
watchEffect(() => { const c = data.value?.client; if (c) Object.assign(cl, { name: c.name, kind: c.kind, contact_name: c.contact_name, email: c.email, phone: c.phone ?? '', country: c.country ?? '', address: c.address ?? '', notes: c.notes ?? '', status: c.status }) })
const saveCl = () => run(() => $fetch('/api/services/clients', { method: 'POST', body: { id, ...cl } }), 'Client saved.')
const money = (v: string, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v))
const rq = reactive({ company_id: '', tax_year: new Date().getFullYear() - 1, email: '' })
const sentLink = ref('')
function askTax(c: Co) { rq.company_id = c.id; rq.email = data.value?.client.email ?? ''; sentLink.value = '' }
const sendTax = () => run(async () => { const r = await $fetch<{ link: string; emailed: boolean }>('/api/services/requests', { method: 'POST', body: { client_id: id, ...rq } }); sentLink.value = r.link; rq.company_id = '' }, 'Tax information request sent.')
const RQ: Record<string, string> = { sent: 'Sent', in_progress: 'In progress', submitted: 'Submitted', cancelled: 'Cancelled' }
const invite = (p: Pe, send: boolean) => run(() => $fetch('/api/services/clients/' + id + '/finvry', { method: 'POST', body: { person_id: p.id, send } }), send ? p.name + ' has a Finvry account and was emailed.' : p.name + ' can now sign in to Finvry with their email.')
const { data: msgs, refresh: rmsgs } = await useFetch<{ id: string; from_team: boolean; body: string; created_at: string; author: string | null; read_by_client: string | null }[]>('/api/services/clients/' + id + '/messages')
const reply = ref('')
const sendMsg = () => run(async () => { await $fetch('/api/services/clients/' + id + '/messages', { method: 'POST', body: { body: reply.value } }); reply.value = ''; await rmsgs() }, 'Message sent.')
</script>

<template>
  <section v-if="data">
    <CsNav />
    <div class="dh"><div><h1>{{ data.client.name }}</h1><p class="muted">{{ data.client.contact_name }} · {{ data.client.email }}{{ data.client.country ? ' · ' + data.client.country : '' }}</p></div>
      <div class="row"><NuxtLink :to="'/services/invoices/new?client=' + id" class="btn">New invoice</NuxtLink><DeleteButton type="client" :id="id" :name="data.client.name" to="/services/clients" /></div></div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="tabs"><button v-for="t in (['companies', 'people', 'jobs', 'invoices', 'messages', 'details'] as const)" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t === 'companies' ? 'Companies (' + data.companies.length + ')' : t === 'people' ? 'People (' + data.people.length + ')' : t === 'jobs' ? 'Jobs (' + data.jobs.length + ')' : t === 'invoices' ? 'Invoices (' + data.invoices.length + ')' : t === 'messages' ? 'Messages' + (msgs?.filter((m) => !m.from_team).length ? ' (' + msgs.filter((m) => !m.from_team).length + ')' : '') : 'Details' }}</button></div>

    <template v-if="tab === 'companies'">
      <table v-if="data.companies.length" class="table"><thead><tr><th>Company</th><th>Registration</th><th>Services</th><th>Status</th><th /></tr></thead>
        <tbody><tr v-for="c in data.companies" :key="c.id"><td><b class="co">{{ c.name }}</b><span class="sub">{{ TYPES[c.entity_type] }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}</span></td>
          <td class="sm">{{ c.ein ? 'EIN ' + c.ein : 'No EIN yet' }}<span class="sub">{{ c.formation_date ? 'Formed ' + c.formation_date : '' }}{{ c.fiscal_year_end ? ' · FYE ' + c.fiscal_year_end : '' }}</span></td>
          <td class="sm">{{ [c.registered_agent === 'ours' ? 'Registered agent' + (c.agent_renewal ? ' (renews ' + c.agent_renewal + ')' : '') : '', c.virtual_office ? 'Virtual office' : '', c.mailbox ? 'Mailbox' : ''].filter(Boolean).join(' · ') || '—' }}</td>
          <td><span class="st">{{ c.status }}</span></td><td class="acts"><button class="link" @click="askTax(c)">Request tax info</button> · <button class="link" @click="editCo(c)">Edit</button><DeleteButton type="cs_company" :id="c.id" :name="c.name" link @deleted="refresh()" /></td></tr></tbody></table>
      <EmptyState v-else compact icon="services" title="No companies yet" />
      <form v-if="rq.company_id" class="card frm" @submit.prevent="sendTax">
        <h2 class="wide">Request tax filing information</h2>
        <label class="label">Tax year<input v-model="rq.tax_year" inputmode="numeric" required></label>
        <label class="label">Send to<input v-model="rq.email" type="email" required maxlength="254"></label>
        <div class="row"><button class="btn" type="submit">Send link</button><button class="btn secondary" type="button" @click="rq.company_id = ''">Cancel</button></div>
        <p class="muted sm wide">The client gets a no-login link to answer the {{ rq.tax_year }} questions and upload their documents. A job is opened and waits on them.</p>
      </form>
      <p v-if="sentLink" class="sm">Link (also emailed): <a :href="sentLink" target="_blank" rel="noopener">{{ sentLink }}</a></p>
      <template v-if="data.requests.length"><h2 class="sub2">Tax information requests</h2>
        <table class="table"><tbody><tr v-for="r in data.requests" :key="r.id"><td><NuxtLink :to="'/services/requests/' + r.id" class="co">{{ r.tax_year }} · {{ r.company ?? 'Company' }}</NuxtLink><span class="sub">{{ r.sent_to }}</span></td><td><span class="st" :class="r.status === 'submitted' ? 'paid' : r.status === 'cancelled' ? 'void' : 'sent'">{{ RQ[r.status] }}</span></td></tr></tbody></table></template>
      <button v-if="!editingCo" class="btn secondary" @click="editCo()">Add company</button>
      <form v-else class="card frm" @submit.prevent="saveCo">
        <label class="label">Company name<input v-model="co.name" required maxlength="200"></label>
        <label class="label">Type<select v-model="co.entity_type"><option v-for="(l, k) in TYPES" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Status<select v-model="co.status"><option value="forming">Forming</option><option value="active">Active</option><option value="dissolved">Dissolved</option></select></label>
        <label class="label">State or jurisdiction<input v-model="co.jurisdiction" maxlength="100" placeholder="Delaware"></label>
        <label class="label">Country<CountrySelect v-model="co.country" /></label>
        <label class="label">EIN<input v-model="co.ein" maxlength="10" placeholder="12-3456789"></label>
        <label class="label">Registration or file number<input v-model="co.registration_number" maxlength="60"></label>
        <label class="label">Formation date<input v-model="co.formation_date" type="date"></label>
        <label class="label">Fiscal year end<input v-model="co.fiscal_year_end" maxlength="10" placeholder="12-31"></label>
        <label class="label">Registered agent<select v-model="co.registered_agent"><option value="ours">Provided by us</option><option value="theirs">Their own</option><option value="none">None</option></select></label>
        <label v-if="co.registered_agent === 'ours'" class="label">Agent renewal<input v-model="co.agent_renewal" type="date"></label>
        <div class="flags"><label class="chk"><input v-model="co.virtual_office" type="checkbox"> Virtual office</label><label class="chk"><input v-model="co.mailbox" type="checkbox"> Mailbox</label></div>
        <label class="label wide">Official address<input v-model="co.address" maxlength="500"></label>
        <label class="label wide">Notes<textarea v-model="co.notes" rows="2" maxlength="3000" /></label>
        <div class="wide row"><button class="btn" type="submit">Save company</button><button class="btn secondary" type="button" @click="editingCo = false">Cancel</button></div>
      </form>
    </template>

    <template v-else-if="tab === 'people'">
      <table v-if="data.people.length" class="table"><thead><tr><th>Name</th><th>Role</th><th>Company</th><th>Portal</th><th /></tr></thead>
        <tbody><tr v-for="p in data.people" :key="p.id"><td><b class="co">{{ p.name }}</b><span class="sub">{{ [p.email, p.phone].filter(Boolean).join(' · ') }}</span></td>
          <td>{{ ROLES[p.role] }}<span v-if="p.ownership_pct" class="sub">{{ Number(p.ownership_pct) }}% ownership</span></td><td>{{ p.company ?? '—' }}</td><td class="sm">{{ p.portal_access ? 'Finvry access' : '—' }}<template v-if="p.email"><br><button class="link" @click="invite(p, true)">{{ p.portal_access ? 'Email them again' : 'Give Finvry access + email' }}</button><template v-if="!p.portal_access"> · <button class="link" @click="invite(p, false)">Give access quietly</button></template></template></td>
          <td class="acts"><button class="link" @click="editPe(p)">Edit</button><DeleteButton type="cs_person" :id="p.id" :name="p.name" link @deleted="refresh()" /></td></tr></tbody></table>
      <EmptyState v-else compact icon="services" title="No people yet" />
      <button v-if="!editingPe" class="btn secondary" @click="editPe()">Add person</button>
      <form v-else class="card frm" @submit.prevent="savePe">
        <label class="label">Name<input v-model="pe.name" required maxlength="200"></label>
        <label class="label">Role<select v-model="pe.role"><option v-for="(l, k) in ROLES" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Company<select v-model="pe.company_id"><option value="">—</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <label class="label">Email<input v-model="pe.email" type="email" maxlength="254"></label>
        <label class="label">Phone<input v-model="pe.phone" maxlength="40"></label>
        <label class="label">Ownership (%)<input v-model="pe.ownership_pct" inputmode="decimal"></label>
        <label class="label">Nationality<input v-model="pe.nationality" maxlength="100"></label>
        <label class="label wide">Address<input v-model="pe.address" maxlength="500"></label>
        <div class="wide row"><button class="btn" type="submit">Save person</button><button class="btn secondary" type="button" @click="editingPe = false">Cancel</button></div>
      </form>
    </template>

    <template v-else-if="tab === 'messages'">
      <form class="card frm" @submit.prevent="sendMsg"><label class="label wide">Message to the client<textarea v-model="reply" rows="3" maxlength="5000" required /></label>
        <div class="wide row"><button class="btn" type="submit">Send</button><span class="muted sm">Clients on Finvry see it under Services and get an email; otherwise it goes to their main email.</span></div></form>
      <div class="thread"><div v-for="m in msgs ?? []" :key="m.id" class="msg" :class="{ team: m.from_team }"><span class="sub">{{ m.from_team ? (m.author ?? 'Team') : (m.author ?? 'Client') }} · {{ new Date(m.created_at).toLocaleString('en-GB') }}{{ m.from_team && m.read_by_client ? ' · read' : '' }}</span><p>{{ m.body }}</p></div>
        <EmptyState v-if="!msgs?.length" compact icon="services" title="No messages yet" /></div>
    </template>
    <template v-else-if="tab === 'jobs'">
      <table v-if="data.jobs.length" class="table"><thead><tr><th>Job</th><th>Status</th><th>Due</th></tr></thead>
        <tbody><tr v-for="j in data.jobs" :key="j.id"><td><NuxtLink :to="'/services/' + j.id" class="co">{{ j.title }}</NuxtLink></td><td class="st">{{ j.status.replace('_', ' ') }}</td><td>{{ j.due_date ?? '—' }}</td></tr></tbody></table>
      <EmptyState v-else compact icon="services" title="No jobs yet. Create one from Jobs" />
    </template>

    <template v-else-if="tab === 'invoices'">
      <table v-if="data.invoices.length" class="table"><thead><tr><th>Invoice</th><th>Due</th><th class="n">Amount</th><th>Status</th></tr></thead>
        <tbody><tr v-for="i in data.invoices" :key="i.id"><td><NuxtLink :to="'/services/invoices/' + i.id" class="co">{{ i.number }}</NuxtLink></td><td>{{ i.due_date }}</td><td class="n">{{ money(i.amount, i.currency) }}</td><td><span class="st" :class="i.overdue ? 'overdue' : i.status">{{ i.overdue ? 'overdue' : i.status }}</span></td></tr></tbody></table>
      <EmptyState v-else compact icon="services" title="No invoices yet" />
    </template>

    <form v-else class="card frm" @submit.prevent="saveCl">
      <label class="label">Client name<input v-model="cl.name" required maxlength="200"></label>
      <label class="label">Type<select v-model="cl.kind"><option value="company">Company</option><option value="individual">Individual</option></select></label>
      <label class="label">Status<select v-model="cl.status"><option value="active">Active</option><option value="lead">Lead</option><option value="inactive">Inactive</option></select></label>
      <label class="label">Main contact<input v-model="cl.contact_name" required maxlength="200"></label>
      <label class="label">Email<input v-model="cl.email" type="email" required maxlength="254"></label>
      <label class="label">Phone<input v-model="cl.phone" maxlength="40"></label>
      <label class="label">Country<CountrySelect v-model="cl.country" /></label>
      <label class="label wide">Address<input v-model="cl.address" maxlength="500"></label>
      <label class="label wide">Notes<textarea v-model="cl.notes" rows="3" maxlength="3000" /></label>
      <div class="wide row"><button class="btn" type="submit">Save</button></div>
    </form>
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

.tabs { margin: 14px 0 12px; } .tabs button { font: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 2px; margin-right: 20px; cursor: pointer; color: var(--c-muted); } .tabs button.on { color: var(--c-navy); border-bottom-color: var(--c-navy); }
.flags { display: flex; flex-direction: column; gap: 6px; } .acts { white-space: nowrap; } .sm { font-size: 13px; } .sub2 { font-size: 18px; margin: 18px 0 8px; }
.thread { display: flex; flex-direction: column; gap: 8px; } .msg { background: #fff; border: 1px solid var(--c-rule); padding: 10px 14px; max-width: 80%; } .msg.team { align-self: flex-end; border-right: 3px solid var(--c-blue-deep); } .msg p { margin: 4px 0 0; white-space: pre-wrap; }
</style>
