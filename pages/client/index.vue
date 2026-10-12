<script setup lang="ts">
// Services: order done-for-you services from Aidi and follow your requests, documents and invoices.
useHead({ title: 'Services' })
interface O { deadlines: { id: string; title: string; next_due: string; days_left: number; service_code: string | null }[]; due: { currency: string; amount: number; count: number }[]; jobs: { id: string; title: string; status: string; due_date: string | null; created_at: string; company: string | null; items?: string[] }[]; documents: { id: string; title: string; reason: string | null; created_at: string; job: string }[]; unread: number; forms: { id: string; tax_year: number; status: string; company: string | null }[] }
interface Me { name: string; client: string; companies: { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; ein: string | null; address: string | null; registered_agent: string; agent_name?: string | null; agent_resigned_on?: string | null; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string }[] }
const { data } = await usePortalFetch<O>('/api/portal/overview')
const { data: me } = await useFetch<Me>('/api/portal/me', { key: 'portal:me' })
const { data: wl } = await useFetch<{ subscriptions: { id: string; code?: string; kind: string; name: string; amount_minor: number; currency: string; interval: string; status: string; next_charge_at: string; started_on?: string | null; details?: Record<string, string>; failures: number; last_error: string | null }[] }>('/api/wallet', { key: 'client-home-wallet', server: false, lazy: true })
const services = computed(() => (wl.value?.subscriptions ?? []).filter((x) => x.kind === 'service'))
const wizard = ref(false); const preset = ref('')
function open(code = '') { preset.value = code; wizard.value = true }
const TILES = [{ code: 'virtual_office', t: 'Virtual office', d: 'A US business address and mail handling' }, { code: 'registered_agent', t: 'Registered agent', d: 'Required in your state of formation' }, { code: 'irs_annual', t: 'Tax filing', d: 'Federal and state returns filed for you' }, { code: 'llc_formation', t: 'Business registration', d: 'Form a US LLC or C-Corp, with EIN' }]
const ST: Record<string, [string, number]> = { new: ['Received', 25], in_progress: ['In progress', 60], waiting_client: ['Waiting on you', 60], completed: ['Completed', 100] }
const msg = ref('')
async function openForm(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/requests/' + id + '/open', { method: 'POST' }); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp (Inc)', s_corp: 'S-Corp', ltd: 'Limited', plc: 'PLC', other: 'Company' }
const { data: coP } = await useFetch<{ country?: string; currency?: string }>('/api/company/profile', { key: 'company-profile' })
const ngCo = computed(() => /nigeria/i.test(coP.value?.country ?? '') || coP.value?.currency === 'NGN')
const first = computed(() => (me.value?.name ?? '').split(/[\s@]/)[0] || 'there')
const openJobs = computed(() => (data.value?.jobs ?? []).filter((j) => j.status !== 'completed'))
const done = computed(() => (data.value?.jobs ?? []).filter((j) => j.status === 'completed'))
const waiting = computed(() => openJobs.value.filter((j) => j.status === 'waiting_client'))
const dueTotal = computed(() => (data.value?.due ?? []).reduce((n, d) => n + d.count, 0))
const todo = computed(() => waiting.value.length + (data.value?.forms.length ?? 0) + dueTotal.value)
const summary = computed(() => { const p: string[] = []; if (openJobs.value.length) p.push(openJobs.value.length + ' request' + (openJobs.value.length === 1 ? '' : 's') + ' in progress'); if (dueTotal.value) p.push(dueTotal.value + ' invoice' + (dueTotal.value === 1 ? '' : 's') + ' to pay'); return p.length ? p.join(' · ') : 'Everything is up to date.' })
const STEP = (s: string) => (s === 'completed' ? 3 : s === 'new' ? 1 : 2)
const tone = (n: number) => (n < 0 ? 'red' : n <= 14 ? 'amber' : n <= 45 ? 'blue' : 'grey')
const dleft = (n: number) => (n < 0 ? Math.abs(n) + ' days overdue' : n === 0 ? 'Due today' : 'In ' + n + ' days')
const mon = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' }); const dd = (d: string) => new Date(d + 'T12:00:00').getDate()
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
// Long lists stay short: a few rows each, "Show all" for the rest. Companies fold into one list; tap one for details.
const more = reactive({ jobs: false, done: false, deadlines: false, services: false, companies: false, todo: false })
const jfilter = ref<'all' | 'waiting_client' | 'in_progress' | 'new'>('all')
const jobsShown = computed(() => { const l = jfilter.value === 'all' ? openJobs.value : openJobs.value.filter((j) => j.status === jfilter.value); return more.jobs ? l : l.slice(0, 4) })
const jobsCount = computed(() => (jfilter.value === 'all' ? openJobs.value : openJobs.value.filter((j) => j.status === jfilter.value)).length)
const jcount = (s: string) => openJobs.value.filter((j) => j.status === s).length
const coOpen = ref(''); watch(() => me.value?.companies, (l) => { if (l?.length === 1) coOpen.value = l[0]!.id }, { immediate: true })
const cap = <T,>(l: T[], on: boolean, n: number) => (on ? l : l.slice(0, n))
const ext = (n: string) => { const e = (n.split('.').pop() ?? '').toLowerCase(); return e === 'pdf' ? 'PDF' : ['png', 'jpg', 'jpeg', 'webp'].includes(e) ? 'IMG' : ['xls', 'xlsx', 'csv'].includes(e) ? 'XLS' : 'DOC' }
</script>
<template>
  <section v-if="data && me" class="ch">
    <ClientTabs />
    <header class="hello">
      <div><p class="eyebrow">{{ me.client }}</p><h1>Welcome back, {{ first }}</h1><p class="lead">{{ summary }}</p></div>
      <div class="hb"><NuxtLink to="/client/messages" class="btn secondary">Message us</NuxtLink><button class="btn" type="button" @click="open()">Order a service</button></div>
    </header>
    <p v-if="msg" class="error">{{ msg }}</p>

    <div v-if="todo" class="todo card">
      <h2>Needs your attention</h2>
      <div v-for="j in cap(waiting, more.todo, 3)" :key="j.id" class="ti"><span class="tdot red" /><div><b>{{ j.company ?? j.title }}</b><span>We need something from you to continue.</span></div><NuxtLink :to="'/client/jobs/' + j.id" class="btn sm">Open request</NuxtLink></div>
      <button v-if="waiting.length > 3" type="button" class="link ml" @click="more.todo = !more.todo">{{ more.todo ? 'Show less' : 'Show ' + (waiting.length - 3) + ' more waiting on you' }}</button>
      <div v-for="f in data.forms" :key="f.id" class="ti"><span class="tdot blue" /><div><b>{{ f.tax_year }} tax filing information{{ f.company ? ' · ' + f.company : '' }}</b><span>A few details and documents so we can prepare your filing.</span></div><button class="btn sm" type="button" @click="openForm(f.id)">{{ f.status === 'sent' ? 'Start' : 'Continue' }}</button></div>
      <div v-if="dueTotal" class="ti"><span class="tdot amber" /><div><b>{{ dueTotal }} invoice{{ dueTotal === 1 ? '' : 's' }} to pay</b><span><template v-for="(d, i) in data.due" :key="d.currency"><template v-if="i"> + </template><Money :value="d.amount" :currency="d.currency" /></template> outstanding</span></div><NuxtLink to="/client/invoices" class="btn sm">Pay now</NuxtLink></div>
    </div>
    <div v-else class="allset"><span class="ck">✓</span><div><b>You're all set</b><span>Nothing needs your attention right now. We'll email you when something does.</span></div></div>

    <div class="fx-stats">
      <StatTile to="/client/invoices" label="Amount due" icon="billing" tone="b"><template v-if="data.due.length"><template v-for="(d, i) in data.due" :key="d.currency"><template v-if="i"> + </template><Money :value="d.amount" :currency="d.currency" /></template></template><template v-else>$0</template></StatTile>
      <StatTile to="/client/jobs" label="Open requests" :value="openJobs.length" icon="briefcase" tone="n" />
      <StatTile label="Waiting on you" :value="waiting.length" icon="clock" :tone="waiting.length ? 'r' : 'g'" :red="!!waiting.length" />
      <StatTile to="/client/messages" label="Unread messages" :value="data.unread" icon="chat" tone="c" />
    </div>

    <div class="two">
      <div class="col">
        <div class="card">
          <div class="sh"><h2>Your requests <span v-if="openJobs.length" class="n">{{ openJobs.length }}</span></h2><button type="button" class="link" @click="open()">+ New request</button></div>
          <div v-if="openJobs.length > 4" class="seg"><button v-for="f in ([['all', 'All'], ['waiting_client', 'Waiting on you'], ['in_progress', 'In progress'], ['new', 'Received']] as const)" v-show="f[0] === 'all' || jcount(f[0])" :key="f[0]" type="button" :class="{ on: jfilter === f[0] }" @click="jfilter = f[0]; more.jobs = false">{{ f[1] }} <em>{{ f[0] === 'all' ? openJobs.length : jcount(f[0]) }}</em></button></div>
          <NuxtLink v-for="j in jobsShown" :key="j.id" :to="'/client/jobs/' + j.id" class="jr">
            <div class="jx"><b>{{ j.company ?? j.title }}</b><span class="mut">{{ j.items?.length ? j.items.join(' · ') : j.title }}<template v-if="j.due_date"> · Target {{ day(j.due_date) }}</template></span></div>
            <div class="stp" :title="['Received', 'In progress', 'Completed'][STEP(j.status) - 1]"><span v-for="n in 3" :key="n" :class="{ on: n <= STEP(j.status), warn: j.status === 'waiting_client' && n === 2 }" /></div>
            <span class="pill" :class="j.status">{{ ST[j.status]?.[0] ?? j.status }}</span>
          </NuxtLink>
          <button v-if="jobsCount > 4" type="button" class="link sa" @click="more.jobs = !more.jobs">{{ more.jobs ? 'Show less' : 'Show all ' + jobsCount }}</button>
          <div v-if="!openJobs.length" class="empty"><p>No open requests.</p><button class="btn secondary sm" type="button" @click="open()">Order a service</button></div>
          <details v-if="done.length" class="past"><summary>Completed ({{ done.length }})</summary>
            <NuxtLink v-for="j in cap(done, more.done, 6)" :key="j.id" :to="'/client/jobs/' + j.id" class="pj"><span class="ck sm">✓</span><span>{{ j.company ?? j.title }}<em>{{ j.items?.join(' · ') || j.title }}</em></span></NuxtLink>
            <NuxtLink v-if="done.length > 6" to="/client/jobs" class="link sa">All {{ done.length }} completed →</NuxtLink></details>
        </div>
        <div class="card">
          <div class="sh"><h2>Upcoming deadlines</h2><NuxtLink to="/compliance" class="link">Compliance calendar →</NuxtLink></div>
          <div v-for="o in cap(data.deadlines, more.deadlines, 4)" :key="o.id" class="dl"><span class="cal" :class="tone(o.days_left)"><em>{{ mon(o.next_due) }}</em><b>{{ dd(o.next_due) }}</b></span><div><b>{{ o.title }}</b><span class="mut">{{ o.service_code ? 'We handle this for you' : 'Reminder' }}</span></div><span class="pill d" :class="tone(o.days_left)">{{ dleft(o.days_left) }}</span></div>
          <button v-if="data.deadlines.length > 4" type="button" class="link sa" @click="more.deadlines = !more.deadlines">{{ more.deadlines ? 'Show less' : 'Show all ' + data.deadlines.length }}</button>
          <p v-if="!data.deadlines.length" class="mut">No deadlines on your calendar yet.</p>
        </div>
      </div>
      <div class="col">
        <div v-if="services.length" class="card">
          <div class="sh"><h2>Your services</h2><NuxtLink to="/wallet" class="link">Billing &amp; renewals →</NuxtLink></div>
          <RenewalCard v-for="x in cap(services, more.services, 3)" :key="x.id" class="flat" :r="{ code: x.code ?? x.kind, name: x.name, amount_minor: x.amount_minor, currency: x.currency, interval: x.interval, status: x.status, next: x.next_charge_at, started: x.started_on, details: x.details, failures: x.failures, last_error: x.last_error }" />
          <button v-if="services.length > 3" type="button" class="link sa" @click="more.services = !more.services">{{ more.services ? 'Show less' : 'Show all ' + services.length }}</button>
        </div>
        <div v-if="me.companies.length" class="card cos">
          <div class="sh"><h2>Your companies <span class="n">{{ me.companies.length }}</span></h2></div>
          <div v-for="c in cap(me.companies, more.companies, 5)" :key="c.id" class="co" :class="{ open: coOpen === c.id }">
          <button type="button" class="coh" :aria-expanded="coOpen === c.id" @click="coOpen = coOpen === c.id ? '' : c.id"><span class="mono">{{ initials(c.name) }}</span><div><b>{{ c.name }}</b><span class="mut">{{ TYPES[c.entity_type] ?? 'Company' }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}</span></div><span class="pill" :class="c.status">{{ c.status }}</span><span class="chev" aria-hidden="true">›</span></button>
          <div v-if="coOpen === c.id" class="cob"><dl class="kv"><template v-if="c.ein"><dt>EIN</dt><dd class="mono2">{{ c.ein }}</dd></template>
            <template v-if="c.address"><dt>{{ c.virtual_office || c.mailbox ? 'Business address' : 'Registered address' }}</dt><dd class="pre">{{ c.address }}</dd></template></dl>
          <div class="svc"><span v-if="c.agent_resigned_on" class="sv off">✕ Registered agent resigned {{ day(c.agent_resigned_on) }}<em>renewal unpaid · message us to restore it</em></span><span v-else class="sv" :class="{ on: c.registered_agent === 'ours' }">{{ c.registered_agent === 'ours' ? '✓' : '—' }} Registered agent<em v-if="c.registered_agent === 'ours' && c.agent_name">{{ c.agent_name }}</em><em v-if="c.registered_agent === 'ours' && c.agent_renewal">renews {{ day(c.agent_renewal) }}</em></span><span class="sv" :class="{ on: c.virtual_office || c.mailbox }">{{ c.virtual_office || c.mailbox ? '✓' : '—' }} Virtual office</span></div></div>
          </div>
          <button v-if="me.companies.length > 5" type="button" class="link sa" @click="more.companies = !more.companies">{{ more.companies ? 'Show less' : 'Show all ' + me.companies.length }}</button>
        </div>
        <div v-if="!me.companies.length" class="card empty"><p>Your companies appear here once we form or add them for you.</p><button class="btn secondary sm" type="button" @click="open('llc_formation')">Form a company</button></div>
        <div class="card">
          <div class="sh"><h2>Recent documents</h2><NuxtLink to="/client/documents" class="link">All →</NuxtLink></div>
          <button v-for="d in data.documents" :key="d.id + d.created_at" type="button" class="doc" @click="openDoc(d.id)"><FileBadge :name="d.title" :mime="(d as any).mime_type" /><span class="dt"><b>{{ d.title.split(' — ').pop() }}</b><em>{{ d.reason || d.job }} · {{ day(d.created_at) }}</em></span><span class="dlx">↓</span></button>
          <p v-if="!data.documents.length" class="mut">Documents we share with you appear here.</p>
        </div>
      </div>
    </div>

    <div class="more">
      <div class="mh"><h2>Services by Finvry</h2><p class="mut">Done for you by our team. Order here, pay online, and follow every step.</p></div>
      <div class="tiles"><button v-for="(t, i) in TILES" :key="t.code" type="button" class="tile" @click="open(t.code)"><span class="ti2"><AppIcon :name="['customers', 'professionals', 'compliance', 'entities'][i] ?? 'company_services'" /></span><b>{{ t.t }}</b><span class="td">{{ t.d }}</span><em>Get started →</em></button></div>
    </div>
    <AppModal :open="wizard" title="Order a service" wide @close="wizard = false"><OrderWizard :key="preset + String(wizard)" :preset="preset" /></AppModal>
  </section>
</template>
<style scoped>
.hello { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 6px 0 18px; } .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--c-muted); } .hello h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); letter-spacing: -.02em; } .lead { margin: 6px 0 0; color: var(--c-ink-soft); } .hb { display: flex; gap: 8px; }
.card { border-radius: 0; } h2 { margin: 0; font-size: 17px; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); }
.todo { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; border-color: #f3c7cf; background: linear-gradient(0deg, #fff, #fff8f9); } .todo h2 { margin-bottom: 6px; }
.ti { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--c-rule); } .ti > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .ti span { font-size: 13px; color: var(--c-ink-soft); }
.tdot { width: 9px; height: 9px; border-radius: 50%; flex: none; } .tdot.red { background: var(--c-danger); } .tdot.blue { background: var(--c-blue-deep); } .tdot.amber { background: var(--c-warn); }
.allset { display: flex; gap: 14px; align-items: center; background: #f1faf4; border: 1px solid #cfe9d8; border-radius: 0; padding: 14px 18px; margin-bottom: 16px; } .allset div { display: flex; flex-direction: column; gap: 2px; } .allset span:not(.ck) { font-size: 13.5px; color: var(--c-ink-soft); }
.ck { width: 30px; height: 30px; border-radius: 50%; background: var(--c-ok); color: #fff; display: grid; place-items: center; font-weight: 700; flex: none; } .ck.sm { width: 20px; height: 20px; font-size: 11px; }
.two { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.sh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; } .link { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.stp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; } .stp span { height: 5px; border-radius: 0; background: var(--c-paper-2); } .stp span.on { background: var(--c-blue-deep); } .stp span.warn { background: var(--c-warn); }
.pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 0; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; text-transform: capitalize; }
.pill.new { background: #eef4ff; color: #2c5cc5; } .pill.in_progress, .pill.forming { background: #fff6e6; color: #a5650b; } .pill.waiting_client { background: #fdecef; color: #b4234a; } .pill.completed, .pill.active { background: #e9f6ee; color: #23784a; }
.pill.d.red { background: #fdecef; color: #b4234a; } .pill.d.amber { background: #fff6e6; color: #a5650b; } .pill.d.blue { background: #eef4ff; color: #2c5cc5; } .pill.d { text-transform: none; }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; } .empty p { margin: 0; color: var(--c-ink-soft); }
.past summary { cursor: pointer; font-size: 13.5px; color: var(--c-muted); margin-top: 4px; } .pj { display: flex; gap: 10px; align-items: center; padding: 8px 0; text-decoration: none; color: var(--c-ink); font-size: 14px; } .pj span:last-child { display: flex; flex-direction: column; } .pj em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.dl { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--c-rule); } .dl > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .dl b { font-weight: 500; }
.cal { width: 44px; flex: none; border: 1px solid var(--c-rule-strong); border-radius: 0; overflow: hidden; text-align: center; display: flex; flex-direction: column; } .cal em { font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 0; background: var(--c-paper-2); color: var(--c-muted); } .cal b { font-size: 16px; padding: 2px 0 3px; }
.cal.red em { background: var(--c-danger); color: #fff; } .cal.amber em { background: var(--c-warn); color: #fff; } .cal.blue em { background: var(--c-blue-deep); color: #fff; }
.co { border-top: 1px solid var(--c-rule); } .coh { display: flex; gap: 12px; align-items: center; width: 100%; padding: 10px 0; background: none; border: 0; font: inherit; text-align: left; cursor: pointer; color: inherit; } .coh > div { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; } .coh b { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .coh:hover b { color: var(--c-blue-deep); }
.chev { color: var(--c-muted); font-size: 18px; transition: transform .15s; width: 12px; } .co.open .chev { transform: rotate(90deg); } .cob { display: flex; flex-direction: column; gap: 12px; padding: 2px 0 14px 50px; } .co .mono { width: 38px; height: 38px; font-size: 13px; }
.n { font-size: 12px; font-weight: 600; color: var(--c-muted); background: var(--c-paper-2); padding: 1px 7px; margin-left: 6px; vertical-align: 2px; }
.jr { display: grid; grid-template-columns: minmax(0, 1fr) 72px auto; gap: 14px; align-items: center; padding: 11px 0; border-top: 1px solid var(--c-rule); text-decoration: none; color: inherit; } .jr:first-of-type { border-top: 0; } .jr:hover b { color: var(--c-blue-deep); } .jx { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .jx b { font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .jx .mut { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seg { display: flex; gap: 4px; flex-wrap: wrap; margin: -2px 0 8px; } .seg button { background: #fff; border: 1px solid var(--c-rule); padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--c-ink-soft); } .seg button em { font-style: normal; color: var(--c-muted); margin-left: 3px; } .seg .on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .seg .on em { color: #c9d4e6; }
.sa { display: block; margin-top: 8px; font-size: 13px; } .ml { align-self: flex-start; font-size: 13px; padding: 4px 0 6px 21px; }
.mono { width: 44px; height: 44px; border-radius: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; flex: none; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 8px 12px; margin: 0; font-size: 14px; } .kv dt { color: var(--c-muted); font-size: 13px; } .kv dd { margin: 0; } .pre { white-space: pre-line; } .mono2 { font-family: ui-monospace, Menlo, monospace; }
.svc { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--c-rule); } .sv { font-size: 13.5px; color: var(--c-muted); } .sv.on { color: var(--c-ok); font-weight: 500; } .sv.off { color: var(--c-danger); font-weight: 500; } .sv em { font-style: normal; color: var(--c-muted); font-weight: 400; margin-left: 6px; font-size: 12.5px; }
.doc { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 0; background: none; border: 0; border-top: 1px solid var(--c-rule); font: inherit; text-align: left; cursor: pointer; } .doc:hover .dt b { color: var(--c-blue-deep); }
.ft { width: 32px; height: 36px; border-radius: 0; display: grid; place-items: center; font-size: 9.5px; font-weight: 700; color: #fff; background: #2f6fd6; flex: none; } .ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="IMG"] { background: #8a5cd1; } .ft[data-t="XLS"] { background: #23854f; }
.dt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .dt b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dt em { font-style: normal; font-size: 12px; color: var(--c-muted); } .dlx { color: var(--c-blue-deep); }
.more { margin-top: 28px; } .mh { margin-bottom: 12px; } .mh p { margin: 4px 0 0; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .tile { text-align: left; background: #fff; border: 1px solid var(--c-rule); border-radius: 0; padding: 16px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: border-color .12s, box-shadow .12s; } .tile:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); }
.ti2 { width: 38px; height: 38px; border-radius: 0; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; } .ti2 :deep(svg) { width: 20px; height: 20px; } .tile b { font-size: 15px; } .tile .td { font-size: 13px; color: var(--c-ink-soft); flex: 1; } .tile em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); font-weight: 500; }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; display: inline-flex; align-items: center; text-decoration: none; }
@media (max-width: 1000px) { .tiles { grid-template-columns: 1fr 1fr; } .two { grid-template-columns: 1fr; } }
.flat { border: 0 !important; padding: 12px 0 !important; border-top: 1px solid var(--c-rule) !important; }
</style>
