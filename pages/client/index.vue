<script setup lang="ts">
// Services: order done-for-you services from Aidi and follow your requests, documents and invoices.
useHead({ title: 'Services' })
interface O { due: { currency: string; amount: number; count: number }[]; jobs: { id: string; title: string; status: string; due_date: string | null; company: string | null }[]; documents: { id: string; title: string; reason: string | null; created_at: string; job: string }[]; unread: number; forms: { id: string; tax_year: number; status: string; company: string | null }[] }
interface Me { name: string; companies: { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; ein: string | null; address: string | null; registered_agent: string; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string }[] }
const { data } = await usePortalFetch<O>('/api/portal/overview')
const { data: me } = await useFetch<Me>('/api/portal/me', { key: 'portal:me' })
const wizard = ref(false); const preset = ref('')
function open(code = '') { preset.value = code; wizard.value = true }
const TILES = [{ code: 'virtual_office', t: 'Virtual office', d: 'A US business address and mail handling' }, { code: 'registered_agent', t: 'Registered agent', d: 'Required in your state of formation' }, { code: 'irs_annual', t: 'Tax filing', d: 'Federal and state returns filed for you' }, { code: 'llc_formation', t: 'Business registration', d: 'Form a US LLC or C-Corp, with EIN' }]
const ST: Record<string, [string, number]> = { new: ['Received', 25], in_progress: ['In progress', 60], waiting_client: ['Waiting on you', 60], completed: ['Completed', 100] }
const msg = ref('')
async function openForm(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/requests/' + id + '/open', { method: 'POST' }); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp (Inc)', s_corp: 'S-Corp', ltd: 'Limited', plc: 'PLC', other: 'Company' }
</script>
<template>
  <section v-if="data && me">
    <ClientTabs />
    <ServiceNotice />
    <div class="hero"><div><p class="label">Services by Aidi</p><h1>Company admin, done for you</h1><p>Virtual office, registered agent, tax filings and business registration in the US and Nigeria, handled by our team. Order here, pay online, and follow every step.</p></div>
      <button class="btn big" type="button" @click="open()">Order a service</button></div>
    <div class="tiles"><button v-for="t in TILES" :key="t.code" type="button" class="tile" @click="open(t.code)"><b>{{ t.t }}</b><span>{{ t.d }}</span><em>Get started →</em></button></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-for="f in data.forms" :key="f.id" class="card todo"><div><b>{{ f.tax_year }} tax filing information{{ f.company ? ' · ' + f.company : '' }}</b><span>We need a few details and documents to prepare your filing.</span></div><button class="btn" type="button" @click="openForm(f.id)">{{ f.status === 'sent' ? 'Start' : 'Continue' }}</button></div>
    <div class="stats">
      <NuxtLink to="/client/invoices" class="st"><span>Amount due</span><b v-if="data.due.length"><template v-for="(d, i) in data.due" :key="d.currency"><template v-if="i"> + </template><Money :value="d.amount" :currency="d.currency" /></template></b><b v-else>0</b></NuxtLink>
      <div class="st"><span>Open requests</span><b>{{ data.jobs.filter((j) => j.status !== 'completed').length }}</b></div>
      <div class="st" :class="{ warn: data.jobs.some((j) => j.status === 'waiting_client') }"><span>Waiting on you</span><b>{{ data.jobs.filter((j) => j.status === 'waiting_client').length }}</b></div>
      <NuxtLink to="/client/messages" class="st"><span>Unread messages</span><b>{{ data.unread }}</b></NuxtLink>
    </div>
    <div class="two">
      <div><div class="sh"><h2>Your requests</h2><button type="button" class="link" @click="open()">+ New request</button></div>
        <NuxtLink v-for="j in data.jobs" :key="j.id" :to="'/client/jobs/' + j.id" class="card job"><div class="jt"><b>{{ j.title }}</b><span class="pill" :class="j.status">{{ ST[j.status]?.[0] ?? j.status }}</span></div><span class="mut">{{ j.company ?? 'General' }}{{ j.due_date ? ' · due ' + day(j.due_date) : '' }}</span><div class="pb"><i :style="{ width: (ST[j.status]?.[1] ?? 10) + '%' }" :class="j.status" /></div></NuxtLink>
        <EmptyState v-if="!data.jobs.length" card icon="company_services" title="No requests yet" text="Order a service and it will show here, with every update from our team."><button class="btn" type="button" @click="open()">Order a service</button></EmptyState></div>
      <div><h2>Your companies</h2>
        <div v-for="c in me.companies" :key="c.id" class="card co"><div class="jt"><b class="cn">{{ c.name }}</b><span class="pill" :class="c.status">{{ c.status }}</span></div><span class="mut">{{ TYPES[c.entity_type] }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}{{ c.ein ? ' · EIN ' + c.ein : '' }}</span>
          <div v-if="c.address" class="addr"><span>{{ c.virtual_office || c.mailbox ? 'Virtual office address' : 'Registered address' }}</span><p>{{ c.address }}</p></div>
          <div class="chips"><span v-if="c.registered_agent === 'ours'">Registered agent</span><span v-if="c.virtual_office">Virtual office</span><span v-if="c.mailbox">Mailbox</span></div></div>
        <div v-if="!me.companies.length" class="card empty sm"><p>Your companies appear here once we form or add them for you.</p></div>
        <h2>Recent documents</h2>
        <div class="card list"><button v-for="d in data.documents" :key="d.id + d.created_at" type="button" class="doc" @click="openDoc(d.id)"><span class="ic">PDF</span><span class="dt"><b>{{ d.title.split(' — ').pop() }}</b><em>{{ d.reason || d.job }} · {{ day(d.created_at) }}</em></span><span class="dl">↓</span></button>
          <p v-if="!data.documents.length" class="mut pad">No documents yet.</p></div></div>
    </div>
    <AppModal :open="wizard" title="Order a service" wide @close="wizard = false"><OrderWizard :key="preset + String(wizard)" :preset="preset" /></AppModal>
  </section>
</template>
<style scoped>
.hero { background: linear-gradient(135deg, #0c1a2e 0%, #1c3d63 60%, #2f6494 100%); color: #fff; padding: 30px 32px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-bottom: 14px; }
.hero .label { color: rgba(255,255,255,.7); } .hero h1 { color: #fff; margin: 4px 0 8px; } .hero p { color: rgba(255,255,255,.82); max-width: 620px; margin: 0; } .btn.big { background: #fff; color: var(--c-navy); padding: 12px 22px; font-weight: 600; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; } .tile { text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 16px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; } .tile:hover { border-color: var(--c-navy); }
.tile b { font-family: var(--font-heading); font-weight: 500; font-size: 20px; color: var(--c-navy); } .tile span { font-size: 13px; color: var(--c-ink-soft); } .tile em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); margin-top: 6px; }
.todo { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 14px; border-left: 3px solid var(--c-blue-deep); } .todo div { display: flex; flex-direction: column; gap: 3px; } .todo span { font-size: 13.5px; color: var(--c-ink-soft); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; } .st { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: inherit; } .st span { font-size: 12.5px; color: var(--c-muted); } .st b, .st :deep(.mny) { font-size: 24px; font-weight: 600; } .st.warn b { color: var(--c-warn); }
.two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; } h2 { font-size: 20px; margin: 0 0 10px; } .two > div > h2:not(:first-child) { margin-top: 18px; } .sh { display: flex; justify-content: space-between; align-items: baseline; }
.job { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; text-decoration: none; color: inherit; } .job:hover { border-color: var(--c-navy); } .jt { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; } .jt b { font-weight: 600; } .cn { font-family: var(--font-heading); font-weight: 500 !important; font-size: 20px; color: var(--c-navy); }
.pb { height: 4px; background: var(--c-paper-2); } .pb i { display: block; height: 100%; background: var(--c-blue-deep); } .pb i.completed { background: var(--c-ok); } .pb i.waiting_client { background: var(--c-warn); }
.pill { font-size: 12px; padding: 3px 9px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; text-transform: capitalize; } .pill.completed, .pill.active { background: rgba(31,122,77,.1); color: var(--c-ok); } .pill.waiting_client { background: rgba(183,121,31,.12); color: var(--c-warn); } .pill.in_progress, .pill.forming { background: var(--c-signal-soft); color: var(--c-blue-deep); }
.mut { font-size: 13px; color: var(--c-muted); } .co { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; } .addr { background: var(--c-paper-2); padding: 9px 12px; } .addr span { font-size: 12px; color: var(--c-muted); } .addr p { margin: 3px 0 0; white-space: pre-line; font-size: 14px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips span { font-size: 12px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 3px 8px; }
.list { padding: 0; } .doc { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; background: none; border: 0; border-bottom: 1px solid var(--c-rule); font: inherit; text-align: left; cursor: pointer; } .doc:hover { background: var(--c-paper-2); }
.ic { width: 36px; height: 36px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 10px; font-weight: 700; flex: none; } .dt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .dt b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dt em { font-style: normal; font-size: 12px; color: var(--c-muted); } .dl { color: var(--c-blue-deep); }
.empty { text-align: center; padding: 26px; } .empty p { color: var(--c-ink-soft); margin: 6px 0 12px; } .empty.sm { padding: 16px; } .empty.sm p { margin: 0; } .pad { padding: 14px; margin: 0; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .tiles, .stats { grid-template-columns: 1fr 1fr; } .two { grid-template-columns: 1fr; } }
</style>
