<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Home' })
interface O { due: { currency: string; amount: number; count: number }[]; jobs: { id: string; title: string; status: string; due_date: string | null; company: string | null }[]; documents: { id: string; title: string; reason: string | null; created_at: string; job: string }[]; unread: number; forms: { id: string; tax_year: number; status: string; company: string | null }[] }
interface Me { name: string; companies: { id: string; name: string; entity_type: string; jurisdiction: string | null; country: string; ein: string | null; address: string | null; registered_agent: string; agent_renewal: string | null; virtual_office: boolean; mailbox: boolean; status: string }[] }
const { data } = await usePortalFetch<O>('/api/portal/overview')
const { data: me } = await useFetch<Me>('/api/portal/me', { key: 'portal:me' })
const ST: Record<string, string> = { new: 'Received', in_progress: 'In progress', waiting_client: 'Waiting on you', completed: 'Completed' }
const TYPES: Record<string, string> = { llc: 'LLC', c_corp: 'C-Corp (Inc)', s_corp: 'S-Corp', ltd: 'Limited', plc: 'PLC', other: 'Company' }
const msg = ref('')
async function openForm(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/requests/' + id + '/open', { method: 'POST' }); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <section v-if="data && me">
    <h1>Hello, {{ me.name.split(' ')[0] }}</h1>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="cards">
      <NuxtLink to="/client/invoices" class="card k"><span class="l">Amount due</span><b v-if="data.due.length"><template v-for="(d, i) in data.due" :key="d.currency"><span v-if="i" class="pl"> + </span><Money :value="d.amount" :currency="d.currency" /></template></b><b v-else>Nothing due</b><span class="s">{{ data.due.reduce((t, d) => t + d.count, 0) }} unpaid invoice{{ data.due.reduce((t, d) => t + d.count, 0) === 1 ? '' : 's' }}</span></NuxtLink>
      <div class="card k"><span class="l">Open requests</span><b>{{ data.jobs.filter((j) => j.status !== 'completed').length }}</b><span class="s">{{ data.jobs.filter((j) => j.status === 'waiting_client').length }} waiting on you</span></div>
      <NuxtLink to="/client/messages" class="card k"><span class="l">Messages</span><b>{{ data.unread }}</b><span class="s">{{ data.unread ? 'unread from our team' : 'all read' }}</span></NuxtLink>
    </div>
    <div v-for="f in data.forms" :key="f.id" class="card todo"><div><b>{{ f.tax_year }} tax filing information{{ f.company ? ' · ' + f.company : '' }}</b><span>{{ f.status === 'sent' ? 'Not started' : 'In progress' }}: we need your details and documents to prepare the filing.</span></div><button class="btn" type="button" @click="openForm(f.id)">{{ f.status === 'sent' ? 'Start' : 'Continue' }}</button></div>
    <h2>Your companies</h2>
    <div class="cos">
      <div v-for="c in me.companies" :key="c.id" class="card co">
        <div class="ch"><b>{{ c.name }}</b><span class="tag" :class="c.status">{{ c.status }}</span></div>
        <span class="mut">{{ TYPES[c.entity_type] }} · {{ [c.jurisdiction, c.country].filter(Boolean).join(', ') }}{{ c.ein ? ' · EIN ' + c.ein : '' }}</span>
        <div v-if="c.address" class="addr"><span class="l">{{ c.virtual_office || c.mailbox ? 'Your virtual office address' : 'Registered address' }}</span><p>{{ c.address }}</p></div>
        <div class="svc"><span v-if="c.registered_agent === 'ours'">Registered agent{{ c.agent_renewal ? ' · renews ' + day(c.agent_renewal) : '' }}</span><span v-if="c.virtual_office">Virtual office</span><span v-if="c.mailbox">Mailbox</span></div>
      </div>
      <p v-if="!me.companies.length" class="mut">No companies yet.</p>
    </div>
    <div class="two">
      <div><h2>Your requests</h2>
        <div class="card list"><NuxtLink v-for="j in data.jobs" :key="j.id" :to="'/client/jobs/' + j.id" class="row"><span><b>{{ j.title }}</b><em v-if="j.company">{{ j.company }}</em></span><span class="tag" :class="j.status">{{ ST[j.status] ?? j.status }}</span></NuxtLink>
          <p v-if="!data.jobs.length" class="mut pad">No requests yet.</p></div></div>
      <div><h2>Recent documents</h2>
        <div class="card list"><button v-for="d in data.documents" :key="d.id + d.created_at" type="button" class="row" @click="openDoc(d.id)"><span><b>{{ d.title.split(' — ').pop() }}</b><em>{{ d.reason || d.job }} · {{ day(d.created_at) }}</em></span><span class="dl">Download</span></button>
          <p v-if="!data.documents.length" class="mut pad">No documents yet.</p><NuxtLink to="/client/documents" class="more">All documents →</NuxtLink></div></div>
    </div>
  </section>
</template>

<style scoped>
h1 { margin: 0 0 18px; } h2 { font-size: 20px; margin: 26px 0 10px; } .error { color: var(--c-danger); }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .k { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; } a.k:hover { border-color: var(--c-blue-deep); }
.l { font-size: 13px; color: var(--c-muted); } .k b { font-size: 30px; font-weight: 600; color: var(--c-ink); } .pl { color: var(--c-muted); font-weight: 400; } .s { font-size: 13px; color: var(--c-muted); }
.todo { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 12px; border-left: 3px solid var(--c-blue-deep); } .todo div { display: flex; flex-direction: column; gap: 4px; } .todo span { font-size: 13.5px; color: var(--c-ink-soft); }
.cos { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; } .co { display: flex; flex-direction: column; gap: 8px; } .ch { display: flex; justify-content: space-between; gap: 10px; } .ch b { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); }
.mut { color: var(--c-muted); font-size: 13.5px; } .addr { background: var(--c-paper-2); padding: 10px 12px; } .addr p { margin: 4px 0 0; white-space: pre-line; font-size: 14px; }
.svc { display: flex; gap: 6px; flex-wrap: wrap; } .svc span { font-size: 12px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 3px 8px; }
.tag { font-size: 12px; padding: 3px 9px; background: var(--c-paper-2); color: var(--c-ink-soft); text-transform: capitalize; white-space: nowrap; height: fit-content; } .tag.completed, .tag.active { color: var(--c-ok); background: rgba(31,122,77,.1); } .tag.waiting_client { color: var(--c-warn); background: rgba(183,121,31,.1); } .tag.forming { color: var(--c-blue-deep); background: var(--c-signal-soft); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .list { padding: 0; } .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--c-rule); text-decoration: none; color: inherit; width: 100%; background: none; border-left: 0; border-right: 0; border-top: 0; font: inherit; text-align: left; cursor: pointer; }
.row:hover { background: var(--c-paper-2); } .row span:first-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .row b { font-weight: 500; } .row em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .dl { font-size: 13px; color: var(--c-blue-deep); } .pad { padding: 14px 16px; margin: 0; } .more { display: block; padding: 12px 16px; font-size: 13px; }
@media (max-width: 860px) { .cards, .two { grid-template-columns: 1fr; } }
</style>
