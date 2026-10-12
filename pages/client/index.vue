<script setup lang="ts">
// Services: order done-for-you services from Aidi and follow your requests, documents and invoices.
useHead({ title: 'Services' })
interface O { deadlines: { id: string; title: string; next_due: string; days_left: number; service_code: string | null }[]; due: { currency: string; amount: number; count: number }[]; jobs: { id: string; title: string; status: string; due_date: string | null; created_at: string; company: string | null; items?: string[] }[]; documents: { id: string; title: string; reason: string | null; created_at: string; job: string }[]; unread: number; forms: { id: string; tax_year: number; status: string; company: string | null }[] }
interface Me { name: string; client: string; companies: { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; ein: string | null; address: string | null; registered_agent: string; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string }[] }
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
      <div v-for="j in waiting" :key="j.id" class="ti"><span class="tdot red" /><div><b>{{ j.company ?? j.title }}</b><span>We need something from you to continue.</span></div><NuxtLink :to="'/client/jobs/' + j.id" class="btn sm">Open request</NuxtLink></div>
      <div v-for="f in data.forms" :key="f.id" class="ti"><span class="tdot blue" /><div><b>{{ f.tax_year }} tax filing information{{ f.company ? ' · ' + f.company : '' }}</b><span>A few details and documents so we can prepare your filing.</span></div><button class="btn sm" type="button" @click="openForm(f.id)">{{ f.status === 'sent' ? 'Start' : 'Continue' }}</button></div>
      <div v-if="dueTotal" class="ti"><span class="tdot amber" /><div><b>{{ dueTotal }} invoice{{ dueTotal === 1 ? '' : 's' }} to pay</b><span><template v-for="(d, i) in data.due" :key="d.currency"><template v-if="i"> + </template><Money :value="d.amount" :currency="d.currency" /></template> outstanding</span></div><NuxtLink to="/client/invoices" class="btn sm">Pay now</NuxtLink></div>
    </div>
    <div v-else class="allset"><span class="ck">✓</span><div><b>You're all set</b><span>Nothing needs your attention right now. We'll email you when something does.</span></div></div>

    <div class="stats">
      <NuxtLink to="/client/invoices" class="st"><span class="si b"><AppIcon name="billing" /></span><span class="sx"><em>Amount due</em><b v-if="data.due.length"><template v-for="(d, i) in data.due" :key="d.currency"><template v-if="i"> + </template><Money :value="d.amount" :currency="d.currency" /></template></b><b v-else>$0</b></span></NuxtLink>
      <NuxtLink to="/client/jobs" class="st"><span class="si n"><AppIcon name="company_services" /></span><span class="sx"><em>Open requests</em><b>{{ openJobs.length }}</b></span></NuxtLink>
      <div class="st"><span class="si" :class="waiting.length ? 'r' : 'g'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><span class="sx"><em>Waiting on you</em><b :class="{ red: waiting.length }">{{ waiting.length }}</b></span></div>
      <NuxtLink to="/client/messages" class="st"><span class="si c"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v11H8l-4 4V5Z" /></svg></span><span class="sx"><em>Unread messages</em><b>{{ data.unread }}</b></span></NuxtLink>
    </div>

    <div class="two">
      <div class="col">
        <div class="card">
          <div class="sh"><h2>Your requests</h2><button type="button" class="link" @click="open()">+ New request</button></div>
          <NuxtLink v-for="j in openJobs" :key="j.id" :to="'/client/jobs/' + j.id" class="job">
            <div class="jt"><div><b>{{ j.company ?? j.title }}</b><span class="mut">{{ j.items?.length ? j.items.join(' · ') : j.title }}</span></div><span class="pill" :class="j.status">{{ ST[j.status]?.[0] ?? j.status }}</span></div>
            <div class="stp"><span v-for="n in 3" :key="n" :class="{ on: n <= STEP(j.status), warn: j.status === 'waiting_client' && n === 2 }" /></div>
            <div class="jm"><span>{{ ['Received', 'In progress', 'Completed'][STEP(j.status) - 1] }}</span><span v-if="j.due_date">Target {{ day(j.due_date) }}</span></div>
          </NuxtLink>
          <div v-if="!openJobs.length" class="empty"><p>No open requests.</p><button class="btn secondary sm" type="button" @click="open()">Order a service</button></div>
          <details v-if="done.length" class="past"><summary>Completed ({{ done.length }})</summary>
            <NuxtLink v-for="j in done" :key="j.id" :to="'/client/jobs/' + j.id" class="pj"><span class="ck sm">✓</span><span>{{ j.company ?? j.title }}<em>{{ j.items?.join(' · ') || j.title }}</em></span></NuxtLink></details>
        </div>
        <div class="card">
          <div class="sh"><h2>Upcoming deadlines</h2><NuxtLink to="/compliance" class="link">Compliance calendar →</NuxtLink></div>
          <div v-for="o in data.deadlines" :key="o.id" class="dl"><span class="cal" :class="tone(o.days_left)"><em>{{ mon(o.next_due) }}</em><b>{{ dd(o.next_due) }}</b></span><div><b>{{ o.title }}</b><span class="mut">{{ o.service_code ? 'We handle this for you' : 'Reminder' }}</span></div><span class="pill d" :class="tone(o.days_left)">{{ dleft(o.days_left) }}</span></div>
          <p v-if="!data.deadlines.length" class="mut">No deadlines on your calendar yet.</p>
        </div>
      </div>
      <div class="col">
        <div v-for="c in me.companies" :key="c.id" class="card co">
          <div class="coh"><span class="mono">{{ initials(c.name) }}</span><div><b>{{ c.name }}</b><span class="mut">{{ TYPES[c.entity_type] ?? 'Company' }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}</span></div><span class="pill" :class="c.status">{{ c.status }}</span></div>
          <dl class="kv"><template v-if="c.ein"><dt>EIN</dt><dd class="mono2">{{ c.ein }}</dd></template>
            <template v-if="c.address"><dt>{{ c.virtual_office || c.mailbox ? 'Business address' : 'Registered address' }}</dt><dd class="pre">{{ c.address }}</dd></template></dl>
          <div class="svc"><span class="sv" :class="{ on: c.registered_agent === 'ours' }">{{ c.registered_agent === 'ours' ? '✓' : '—' }} Registered agent<em v-if="c.registered_agent === 'ours' && c.agent_renewal">renews {{ day(c.agent_renewal) }}</em></span><span class="sv" :class="{ on: c.virtual_office || c.mailbox }">{{ c.virtual_office || c.mailbox ? '✓' : '—' }} Virtual office</span></div>
        </div>
        <div v-if="!me.companies.length" class="card empty"><p>Your companies appear here once we form or add them for you.</p><button class="btn secondary sm" type="button" @click="open('llc_formation')">Form a company</button></div>
        <div class="card">
          <div class="sh"><h2>Recent documents</h2><NuxtLink to="/client/documents" class="link">All →</NuxtLink></div>
          <button v-for="d in data.documents" :key="d.id + d.created_at" type="button" class="doc" @click="openDoc(d.id)"><span class="ft" :data-t="ext(d.title)">{{ ext(d.title) }}</span><span class="dt"><b>{{ d.title.split(' — ').pop() }}</b><em>{{ d.reason || d.job }} · {{ day(d.created_at) }}</em></span><span class="dlx">↓</span></button>
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
.card { border-radius: 12px; } h2 { margin: 0; font-size: 17px; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); }
.todo { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; border-color: #f3c7cf; background: linear-gradient(0deg, #fff, #fff8f9); } .todo h2 { margin-bottom: 6px; }
.ti { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--c-rule); } .ti > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .ti span { font-size: 13px; color: var(--c-ink-soft); }
.tdot { width: 9px; height: 9px; border-radius: 50%; flex: none; } .tdot.red { background: var(--c-danger); } .tdot.blue { background: var(--c-blue-deep); } .tdot.amber { background: var(--c-warn); }
.allset { display: flex; gap: 14px; align-items: center; background: #f1faf4; border: 1px solid #cfe9d8; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; } .allset div { display: flex; flex-direction: column; gap: 2px; } .allset span:not(.ck) { font-size: 13.5px; color: var(--c-ink-soft); }
.ck { width: 30px; height: 30px; border-radius: 50%; background: var(--c-ok); color: #fff; display: grid; place-items: center; font-weight: 700; flex: none; } .ck.sm { width: 20px; height: 20px; font-size: 11px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; } .st { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--c-rule); border-radius: 12px; padding: 16px; text-decoration: none; color: inherit; transition: border-color .12s; } a.st:hover { border-color: var(--c-navy); }
.si { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none; } .si :deep(svg), .si svg { width: 21px; height: 21px; } .si.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .si.n { background: #eef0f6; color: var(--c-navy); } .si.r { background: #fdecef; color: var(--c-danger); } .si.g { background: #e9f6ee; color: var(--c-ok); } .si.c { background: #e6f6fa; color: #0e7490; }
.sx { display: flex; flex-direction: column; } .sx em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .sx b, .sx :deep(.mny) { font-size: 22px; font-weight: 600; letter-spacing: -.01em; } .sx b.red { color: var(--c-danger); }
.two { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.sh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; } .link { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; text-decoration: none; }
.job { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--c-rule); border-radius: 10px; margin-bottom: 10px; text-decoration: none; color: inherit; transition: border-color .12s, box-shadow .12s; } .job:hover { border-color: var(--c-navy); box-shadow: 0 6px 18px rgba(12,26,46,.06); }
.jt { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; } .jt > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .jt b { font-weight: 600; font-size: 15px; }
.stp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; } .stp span { height: 5px; border-radius: 999px; background: var(--c-paper-2); } .stp span.on { background: var(--c-blue-deep); } .stp span.warn { background: var(--c-warn); }
.jm { display: flex; justify-content: space-between; font-size: 12px; color: var(--c-muted); }
.pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; text-transform: capitalize; }
.pill.new { background: #eef4ff; color: #2c5cc5; } .pill.in_progress, .pill.forming { background: #fff6e6; color: #a5650b; } .pill.waiting_client { background: #fdecef; color: #b4234a; } .pill.completed, .pill.active { background: #e9f6ee; color: #23784a; }
.pill.d.red { background: #fdecef; color: #b4234a; } .pill.d.amber { background: #fff6e6; color: #a5650b; } .pill.d.blue { background: #eef4ff; color: #2c5cc5; } .pill.d { text-transform: none; }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; } .empty p { margin: 0; color: var(--c-ink-soft); }
.past summary { cursor: pointer; font-size: 13.5px; color: var(--c-muted); margin-top: 4px; } .pj { display: flex; gap: 10px; align-items: center; padding: 8px 0; text-decoration: none; color: var(--c-ink); font-size: 14px; } .pj span:last-child { display: flex; flex-direction: column; } .pj em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.dl { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--c-rule); } .dl > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .dl b { font-weight: 500; }
.cal { width: 44px; flex: none; border: 1px solid var(--c-rule-strong); border-radius: 8px; overflow: hidden; text-align: center; display: flex; flex-direction: column; } .cal em { font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 0; background: var(--c-paper-2); color: var(--c-muted); } .cal b { font-size: 16px; padding: 2px 0 3px; }
.cal.red em { background: var(--c-danger); color: #fff; } .cal.amber em { background: var(--c-warn); color: #fff; } .cal.blue em { background: var(--c-blue-deep); color: #fff; }
.co { display: flex; flex-direction: column; gap: 12px; } .coh { display: flex; gap: 12px; align-items: center; } .coh > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .coh b { font-size: 17px; }
.mono { width: 44px; height: 44px; border-radius: 10px; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; flex: none; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 8px 12px; margin: 0; font-size: 14px; } .kv dt { color: var(--c-muted); font-size: 13px; } .kv dd { margin: 0; } .pre { white-space: pre-line; } .mono2 { font-family: ui-monospace, Menlo, monospace; }
.svc { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--c-rule); } .sv { font-size: 13.5px; color: var(--c-muted); } .sv.on { color: var(--c-ok); font-weight: 500; } .sv em { font-style: normal; color: var(--c-muted); font-weight: 400; margin-left: 6px; font-size: 12.5px; }
.doc { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 0; background: none; border: 0; border-top: 1px solid var(--c-rule); font: inherit; text-align: left; cursor: pointer; } .doc:hover .dt b { color: var(--c-blue-deep); }
.ft { width: 32px; height: 36px; border-radius: 6px; display: grid; place-items: center; font-size: 9.5px; font-weight: 700; color: #fff; background: #2f6fd6; flex: none; } .ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="IMG"] { background: #8a5cd1; } .ft[data-t="XLS"] { background: #23854f; }
.dt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .dt b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dt em { font-style: normal; font-size: 12px; color: var(--c-muted); } .dlx { color: var(--c-blue-deep); }
.more { margin-top: 28px; } .mh { margin-bottom: 12px; } .mh p { margin: 4px 0 0; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; } .tile { text-align: left; background: #fff; border: 1px solid var(--c-rule); border-radius: 12px; padding: 16px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: border-color .12s, box-shadow .12s; } .tile:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); }
.ti2 { width: 38px; height: 38px; border-radius: 10px; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; } .ti2 :deep(svg) { width: 20px; height: 20px; } .tile b { font-size: 15px; } .tile .td { font-size: 13px; color: var(--c-ink-soft); flex: 1; } .tile em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); font-weight: 500; }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; display: inline-flex; align-items: center; text-decoration: none; }
@media (max-width: 1000px) { .stats, .tiles { grid-template-columns: 1fr 1fr; } .two { grid-template-columns: 1fr; } }
</style>
