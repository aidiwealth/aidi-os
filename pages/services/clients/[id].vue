<script setup lang="ts">
import { US_STATES } from '~/shared/countries'
const id = useRoute().params.id as string
interface Co { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; registration_number: string | null; ein: string | null; formation_date: string | null; fiscal_year_end: string | null; address: string | null; registered_agent: string; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string; notes: string | null }
interface Pe { id: string; name: string; email: string | null; phone: string | null; role: string; ownership_pct: string | null; company_id: string | null; company: string | null; address: string | null; nationality: string | null; portal_access: boolean }
interface D { client: { id: string; name: string; kind: string; contact_name: string; email: string; phone: string | null; country: string | null; address: string | null; notes: string | null; status: string; emails_muted?: boolean; on_finvry?: boolean }
  companies: Co[]; people: Pe[]; jobs: { id: string; title: string; service: string; status: string; due_date: string | null }[]; invoices: { id: string; number: string; currency: string; amount: string; status: string; due_date: string; overdue: boolean }[]; requests: { id: string; tax_year: number; status: string; sent_to: string; company: string | null; submitted_at: string | null }[] }
const { data, refresh } = await useFetch<D>('/api/services/clients/' + id)
useHead({ title: () => data.value?.client.name ?? 'Client' })
const TABS = ['companies', 'people', 'jobs', 'invoices', 'renewals', 'messages', 'details'] as const
const qTab = String(useRoute().query.tab ?? '') as typeof TABS[number]
const tab = ref<typeof TABS[number]>(TABS.includes(qTab) ? qTab : 'companies')
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
const { data: me } = await useFetch<{ platform: boolean }>('/api/auth/me', { key: 'me' })
// Recurring services (virtual office, registered agent): correct when they started and the next renewal date.
interface Rn { code: string; name: string; sub: { id: string; interval: string; amount_minor: number; currency: string; status: string; next_charge_at: string; started_on: string | null; details?: Record<string, string> } | null; obligation: { id: string; next_due: string; recurrence: string } | null }
const { data: ren, refresh: rren } = await useFetch<{ workspace: boolean; items: Rn[] }>('/api/services/clients/' + id + '/renewals', { lazy: true, server: false })
const rd = reactive<Record<string, { started_on: string; next_date: string; country: string; state: string; address: string }>>({})
watch(ren, (v) => { for (const r of v?.items ?? []) rd[r.code] = { started_on: r.sub?.started_on ?? '', next_date: r.sub?.next_charge_at ?? r.obligation?.next_due ?? '', country: r.sub?.details?.country ?? 'United States', state: r.sub?.details?.state ?? '', address: r.sub?.details?.address ?? '' } }, { immediate: true })
const todayIso = new Date().toISOString().slice(0, 10)
const saveRen = (code: string, extra: Record<string, unknown> = {}) => run(async () => { const x = rd[code]!; const r = await $fetch<{ next: string | null }>('/api/services/clients/' + id + '/renewals', { method: 'POST', body: { code, ...extra, ...(extra.status ? {} : { started_on: x.started_on || undefined, next_date: x.next_date || undefined, ...(code === 'virtual_office' ? { details: { country: x.country, state: x.country === 'Nigeria' ? 'Lagos' : x.state, address: x.address } } : {}) }) } }); await rren(); return r }, extra.status === 'cancelled' ? 'Renewal cancelled.' : extra.status === 'suspended' ? 'Renewal paused.' : extra.status === 'active' ? 'Renewal resumed.' : 'Saved. The wallet renewal and the compliance calendar now match.')
function confirmCancel(r: Rn) { return window.confirm('Cancel ' + r.name + ' for this client? It stops renewing and leaves their calendar.') }
const saveRen2 = (r: Rn, v: { started_on: string; next_date: string; country: string; state: string; address: string }) => { rd[r.code] = { ...v }; return saveRen(r.code) }
function cancelRen(r: Rn) { if (window.confirm('Cancel ' + r.name + ' renewals for this client?')) saveRen(r.code, { status: 'cancelled' }) }
function fromStart(r: Rn) { const x = rd[r.code]!; if (!x.started_on) return; const m = (r.sub ? r.sub.interval === 'month' : r.obligation?.recurrence === 'monthly') ? 1 : 12; const b = new Date(x.started_on + 'T00:00:00Z'); for (let k = 1; k < 1200; k++) { const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + m * k, Math.min(b.getUTCDate(), 28))); const iso = d.toISOString().slice(0, 10); if (iso >= todayIso) { x.next_date = iso; break } } }
const signing = ref(false)
async function signInAs() {
  if (!confirm('Sign in to ' + (data.value?.client.name ?? 'this client') + '\'s Finvry account as the owner? Their account is set up if needed, without emailing them. You act as them until you return to the console. This is recorded.')) return
  signing.value = true
  try { const r = await $fetch<{ redirect?: string }>('/api/services/clients/' + id + '/signin', { method: 'POST' }); window.location.href = r.redirect || '/' } catch (e) { msg.value = err(e); signing.value = false }
}
const invite = (p: Pe, send: boolean) => run(() => $fetch('/api/services/clients/' + id + '/finvry', { method: 'POST', body: { person_id: p.id, send } }), send ? p.name + ' has a Finvry account and was emailed.' : p.name + ' can now sign in to Finvry with their email.')
const { data: msgs, refresh: rmsgs } = await useFetch<{ id: string; from_team: boolean; body: string | null; created_at: string; author: string | null; read_by_client: string | null; doc_id: string | null; doc_name: string | null; doc_size: number | null }[]>('/api/services/clients/' + id + '/messages')
const reply = ref('')
const sending = ref(false)
async function sendMsg(body: string, documentId: string | null) { sending.value = true; msg.value = ''; ok.value = ''; try { const r = await $fetch<{ emailed: number }>('/api/services/clients/' + id + '/messages', { method: 'POST', body: { body, document_id: documentId ?? undefined } }); ok.value = data.value?.client.emails_muted ? 'Message saved. Emails to this client are off, so they see it next time they sign in.' : r.emailed ? 'Message sent.' : 'Message saved.'; await rmsgs() } catch (e) { msg.value = err(e) } finally { sending.value = false } }
const toggleEmails = () => run(async () => { await $fetch('/api/services/clients/' + id + '/emails', { method: 'POST', body: { muted: !data.value?.client.emails_muted } }) }, data.value?.client.emails_muted ? 'Emails to the client are back on.' : 'Emails to this client are off. Messages and updates still appear in their account.')
const unpaid = computed(() => (data.value?.invoices ?? []).filter((i: { status: string }) => i.status === 'sent').length)
const openJobs = computed(() => (data.value?.jobs ?? []).filter((j: { status: string }) => !['completed', 'cancelled'].includes(j.status)).length)
const inits = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
</script>

<template>
  <section v-if="data">
    <CsNav />
    <div class="dh"><div class="who"><span class="mono">{{ inits(data.client.name) }}</span><div><h1>{{ data.client.name }}</h1>
        <p class="muted"><b>{{ data.client.contact_name }}</b> · <a :href="'mailto:' + data.client.email">{{ data.client.email }}</a>{{ data.client.phone ? ' · ' + data.client.phone : '' }}{{ data.client.country ? ' · ' + data.client.country : '' }}</p>
        <div class="tagl"><span class="tg" :class="data.client.status">{{ data.client.status }}</span><span class="tg" :class="{ on: data.client.on_finvry }">{{ data.client.on_finvry ? 'On Finvry' : 'No Finvry account' }}</span><button type="button" class="tg sw" :class="{ off: data.client.emails_muted }" :title="data.client.emails_muted ? 'Turn emails back on' : 'Stop emailing this client'" @click="toggleEmails">{{ data.client.emails_muted ? 'Emails off' : 'Emails on' }}</button></div></div></div>
      <div class="row"><button v-if="me?.platform" type="button" class="btn secondary" :disabled="signing" :title="'Set up ' + data.client.name + '\'s Finvry account without emailing them, and sign in as the owner'" @click="signInAs">{{ signing ? 'Opening…' : 'Sign in as owner' }}</button><NuxtLink :to="'/services/order?client=' + id" class="btn">New order</NuxtLink><NuxtLink :to="'/services/invoices/new?client=' + id" class="btn secondary">New invoice</NuxtLink><DeleteButton type="client" :id="id" :name="data.client.name" to="/services/clients" /></div></div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="fx-stats">
      <StatTile clickable icon="briefcase" tone="n" label="Open jobs" :value="openJobs" :on="tab === 'jobs'" @click="tab = 'jobs'" />
      <StatTile clickable icon="billing" :tone="unpaid ? 'r' : 'b'" label="Unpaid invoices" :value="unpaid" :red="!!unpaid" :on="tab === 'invoices'" @click="tab = 'invoices'" />
      <StatTile clickable icon="building" tone="g" label="Companies" :value="data.companies.length" :on="tab === 'companies'" @click="tab = 'companies'" />
      <StatTile clickable icon="chat" tone="c" label="Messages" :value="msgs?.length ?? 0" :on="tab === 'messages'" @click="tab = 'messages'" />
    </div>
    <div class="tabs"><button v-for="t in TABS" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t === 'companies' ? 'Companies (' + data.companies.length + ')' : t === 'people' ? 'People (' + data.people.length + ')' : t === 'jobs' ? 'Jobs (' + data.jobs.length + ')' : t === 'invoices' ? 'Invoices (' + data.invoices.length + ')' : t === 'renewals' ? 'Renewals' : t === 'messages' ? 'Messages' + (msgs?.filter((m) => !m.from_team).length ? ' (' + msgs.filter((m) => !m.from_team).length + ')' : '') : 'Details' }}</button></div>

    <template v-if="tab === 'companies'">
      <table v-if="data.companies.length" class="table"><thead><tr><th>Company</th><th>Registration</th><th>Services</th><th>Status</th><th /></tr></thead>
        <tbody><tr v-for="c in data.companies" :key="c.id"><td><b class="co">{{ c.name }}</b><span class="sub">{{ TYPES[c.entity_type] }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}</span></td>
          <td class="sm">{{ c.ein ? 'EIN ' + c.ein : 'No EIN yet' }}<span class="sub">{{ c.formation_date ? 'Formed ' + c.formation_date : '' }}{{ c.fiscal_year_end ? ' · FYE ' + c.fiscal_year_end : '' }}</span></td>
          <td class="sm">{{ [c.registered_agent === 'ours' ? 'Registered agent' + (c.agent_renewal ? ' (renews ' + c.agent_renewal + ')' : '') : '', c.virtual_office || c.mailbox ? 'Virtual office' : ''].filter(Boolean).join(' · ') || '—' }}</td>
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
        <div class="flags"><label class="chk"><input v-model="co.virtual_office" type="checkbox"> Virtual office</label></div>
        <label class="label wide">Official address<input v-model="co.address" maxlength="500"></label>
        <label class="label wide">Notes<textarea v-model="co.notes" rows="2" maxlength="3000" /></label>
        <div class="wide row"><button class="btn" type="submit">Save company</button><button class="btn secondary" type="button" @click="editingCo = false">Cancel</button><span v-if="msg" class="error" role="alert">{{ msg }}</span></div>
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
        <div class="wide row"><button class="btn" type="submit">Save person</button><button class="btn secondary" type="button" @click="editingPe = false">Cancel</button><span v-if="msg" class="error" role="alert">{{ msg }}</span></div>
      </form>
    </template>

    <template v-else-if="tab === 'messages'">
      <div class="mhd"><p class="muted">{{ data.client.on_finvry ? 'They see these under Messages in Finvry' : 'They get these by email (no Finvry account yet)' }}{{ data.client.emails_muted ? ' — emails are off, so nothing is emailed right now.' : ' and get an email for each one.' }} Attach files with the paperclip or by dragging them in.</p></div>
      <div class="card chat"><ChatThread :messages="msgs ?? []" side="team" :busy="sending" :upload-url="'/api/services/inbox/file?client=' + id" download-base="/api/services/inbox/doc/" :placeholder="'Write to ' + (data.client.contact_name || data.client.name) + '… (⌘/Ctrl + Enter to send)'" @send="sendMsg">
        <template #empty><p v-if="!msgs?.length" class="none">No messages yet. Start the conversation below.</p></template></ChatThread></div>
    </template>
    <template v-else-if="tab === 'jobs'">
      <table v-if="data.jobs.length" class="table"><thead><tr><th>Job</th><th>Status</th><th>Due</th></tr></thead>
        <tbody><tr v-for="j in data.jobs" :key="j.id"><td><NuxtLink :to="'/services/' + j.id" class="co">{{ j.title }}</NuxtLink></td><td class="st">{{ j.status.replace('_', ' ') }}</td><td>{{ j.due_date ?? '—' }}</td></tr></tbody></table>
      <EmptyState v-else compact icon="services" title="No jobs yet. Create one from Jobs" />
    </template>

    <template v-else-if="tab === 'renewals'">
      <p class="muted rh">Recurring services renew automatically from the client's wallet (or card) and appear on their compliance calendar. For an old order you logged today, set when the service really started — the next renewal is worked out from it.</p>
      <p v-if="ren && !ren.workspace" class="muted">This client has no Finvry account yet, so there are no renewals. Use "Sign in as owner" to set one up quietly.</p>
      <div v-else-if="ren?.items.length" class="rens">
        <RenewalCard v-for="r in ren.items" :key="r.code" editable :r="{ code: r.code, name: r.name, amount_minor: r.sub?.amount_minor, currency: r.sub?.currency, interval: r.sub?.interval ?? (r.obligation?.recurrence === 'monthly' ? 'month' : 'year'), status: r.sub?.status ?? null, next: r.sub?.next_charge_at ?? r.obligation?.next_due ?? null, started: r.sub?.started_on ?? null, details: r.sub?.details ?? null, calendarOnly: !r.sub }"
          @save="(v) => saveRen2(r, v)" @status="(st) => (st !== 'cancelled' || confirmCancel(r)) && saveRen(r.code, { status: st })" />
      </div>
      <EmptyState v-else-if="ren" compact icon="services" title="No recurring services yet" />
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
.rh { max-width: 760px; margin: 0 0 14px; font-size: 14px; } .rens { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; } .ren { display: flex; flex-direction: column; gap: 12px; }
.ren .rt { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; } .ren .rt .muted { font-size: 13px; } .rg { display: grid; grid-template-columns: 200px 200px auto; gap: 12px; align-items: end; } .rg .btn { justify-self: start; }
.rg.vo { grid-template-columns: 200px 200px 1fr; } .rg.vo textarea, .rg input, .rg select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .ra { display: flex; gap: 16px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
@media (max-width: 640px) { .rg { grid-template-columns: 1fr; } }
.who { display: flex; gap: 16px; align-items: flex-start; } .who .mono { flex: none; width: 52px; height: 52px; background: #eef0f6; color: var(--c-navy); display: grid; place-items: center; font-weight: 700; font-size: 18px; } .who h1 { margin: 0 0 4px; } .who .muted a { color: var(--c-blue-deep); text-decoration: none; }
.tagl { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; } .tg { font: inherit; font-size: 12px; font-weight: 600; padding: 3px 10px; background: var(--c-paper-2); color: var(--c-ink-soft); border: 0; text-transform: capitalize; } .tg.active, .tg.on { background: #e9f6ee; color: #23784a; } .tg.lead { background: #eef4ff; color: #2c5cc5; }
.tg.sw { cursor: pointer; background: #e9f6ee; color: #23784a; } .tg.sw.off { background: #fdecef; color: #b4234a; }
.kst { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 6px; } .kst button { font: inherit; text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; } .kst button:hover { border-color: var(--c-navy); } .kst em { font-style: normal; font-size: 12px; color: var(--c-muted); } .kst b { font-size: 22px; font-weight: 600; } .kst b.red { color: var(--c-danger); }
.mhd .muted { margin: 0 0 10px; font-size: 13.5px; } .chat { padding: 0 !important; height: 560px; display: flex; flex-direction: column; overflow: hidden; } .none { color: var(--c-muted); text-align: center; margin: auto; }
@media (max-width: 760px) { .kst { grid-template-columns: 1fr 1fr; } }
</style>
