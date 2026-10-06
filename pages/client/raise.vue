<script setup lang="ts">
import { mdRender } from '~/shared/markdown'
// Founder: managed fundraising — one or more raises; each shows progress (investors, meetings, totals). Briefs can be
// edited and raises deleted (before money is committed).
useHead({ title: 'Fundraise with us' })
interface P { program: { id: string; status: string; currency: string; target: string | null; round: string | null; instrument: string | null; fee_pct: string; intake: Record<string, unknown>; intake_at: string | null }; investors: never[]; meetings: { id: string; title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null }[]; totals: { target: number; committed: number; closed: number; pipeline: number; fee: number; fee_pct: number; count: number; active: number } }
const { data, refresh } = await useFetch<{ enabled: boolean; fee_pct?: number; programs?: P[]; labels?: Record<string, string> }>('/api/portal/raise')
const sel = ref(''); watchEffect(() => { if (data.value?.programs?.length && !data.value.programs.some((p) => p.program.id === sel.value)) sel.value = data.value.programs[0]!.program.id })
const cur = computed(() => data.value?.programs?.find((p) => p.program.id === sel.value) ?? null)
const blank = () => ({ id: '', target: '' as string | number, currency: 'USD', round: 'Pre-seed', instrument: 'SAFE', valuation: '' as string | number, raised_so_far: '' as string | number, use_of_funds: '', traction: '', deck_url: '', target_investors: '', timeline: '', agree_fee: false })
const f = reactive(blank()); const editing = ref(false)
function start() { Object.assign(f, blank()); editing.value = true }
function edit() { const i = (cur.value?.program.intake ?? {}) as Record<string, unknown>; Object.assign(f, blank(), Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v ?? ''])), { id: cur.value!.program.id, agree_fee: true }); editing.value = true }
const msg = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function submit() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/portal/raise/intake', { method: 'POST', body: { ...f, id: f.id || undefined } }); editing.value = false; await refresh(); sel.value = r.id } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function del() { if (!cur.value || !confirm('Delete this raise? Our team stops work on it.')) return; msg.value = ''; try { await $fetch('/api/portal/raise/' + cur.value.program.id, { method: 'DELETE' }); sel.value = ''; await refresh() } catch (e) { msg.value = err(e) } }
const money = (v: number | string | null | undefined, c?: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c ?? cur.value?.program.currency ?? 'USD', maximumFractionDigits: 0 }).format(Number(v ?? 0))
const upcoming = computed(() => (cur.value?.meetings ?? []).filter((m) => new Date(m.starts_at) > new Date()))
const past = computed(() => (cur.value?.meetings ?? []).filter((m) => new Date(m.starts_at) <= new Date()).reverse())
const pct = computed(() => (cur.value?.totals.target ? Math.min(100, Math.round((cur.value.totals.committed / cur.value.totals.target) * 100)) : 0))
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ST: Record<string, string> = { intake: 'Getting started', active: 'In progress', paused: 'Paused', closed: 'Closed' }
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><h1>Fundraise with us</h1><button v-if="data.enabled && !editing && data.programs?.length" class="btn" @click="start">+ Start a new raise</button></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-if="!data.enabled" class="card"><p>Managed fundraising isn't switched on for your company. Message our team from Inbox if you'd like us to run your raise.</p></div>
    <template v-else-if="editing || !data.programs?.length">
      <p class="lead">Our team runs your raise: we build the investor list, make introductions, set up meetings and help you close. You see every step here. Our success fee is {{ data.fee_pct }}% of the money you close through us.</p>
      <form class="card frm" @submit.prevent="submit"><h2>{{ f.id ? 'Edit your raise' : 'Your raise' }}</h2>
        <div class="g3"><label class="label">Amount you are raising *<input v-model="f.target" inputmode="decimal" required placeholder="e.g. 500000"></label><label class="label">Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
          <label class="label">Round *<select v-model="f.round"><option>Pre-seed</option><option>Seed</option><option>Series A</option><option>Bridge</option><option>Debt</option></select></label>
          <label class="label">Instrument *<select v-model="f.instrument"><option>SAFE</option><option>Priced equity</option><option>Convertible note</option><option>Debt</option></select></label><label class="label">Valuation or cap<input v-model="f.valuation" inputmode="decimal"></label><label class="label">Raised so far<input v-model="f.raised_so_far" inputmode="decimal"></label></div>
        <div class="label">How you will use the money *<ClientOnly><RichEditor v-model="f.use_of_funds" compact :min-height="110" :max-length="3000" placeholder="e.g. a list of where the money goes" /></ClientOnly></div>
        <div class="label">Traction (revenue, users, growth)<ClientOnly><RichEditor v-model="f.traction" compact :min-height="110" :max-length="3000" placeholder="Revenue, growth, customers, retention…" /></ClientOnly></div>
        <div class="g2"><label class="label">Deck link<input v-model="f.deck_url" maxlength="500" placeholder="Leave blank to use your deck in Decks"></label><label class="label">Timeline<input v-model="f.timeline" maxlength="200" placeholder="e.g. close by March"></label></div>
        <div class="label">Investors you would like us to approach<ClientOnly><RichEditor v-model="f.target_investors" compact :min-height="80" :max-length="3000" placeholder="One per line, or a short note" /></ClientOnly></div>
        <label class="agree"><input v-model="f.agree_fee" type="checkbox"> I agree to a success fee of {{ data.fee_pct }}% of the money closed through this service.</label>
        <div class="row"><button class="btn" :disabled="busy || !f.agree_fee">{{ busy ? 'Saving…' : f.id ? 'Save changes' : 'Start my raise' }}</button><button v-if="editing && data.programs?.length" type="button" class="btn secondary" @click="editing = false">Cancel</button></div></form>
    </template>
    <template v-else-if="cur">
      <nav v-if="(data.programs?.length ?? 0) > 1" class="rtabs"><button v-for="p in data.programs" :key="p.program.id" :class="{ on: sel === p.program.id }" @click="sel = p.program.id">{{ p.program.round }} · {{ money(p.program.target, p.program.currency) }}</button></nav>
      <div class="sub"><p class="lead">{{ cur.program.round }} · {{ cur.program.instrument }} · <span class="pst" :class="cur.program.status">{{ ST[cur.program.status] }}</span></p>
        <div class="row"><button v-if="cur.program.status !== 'closed'" class="btn secondary" @click="edit">Edit brief</button><button class="btn secondary danger" @click="del">Delete raise</button></div></div>
      <div class="kp"><div class="k"><span>Target</span><b>{{ money(cur.totals.target) }}</b></div><div class="k"><span>Committed</span><b>{{ money(cur.totals.committed) }}</b><div class="bar"><i :style="{ width: pct + '%' }" /></div><em>{{ pct }}% of target</em></div><div class="k"><span>Closed</span><b>{{ money(cur.totals.closed) }}</b></div><div class="k"><span>Investors in play</span><b>{{ cur.totals.active }}</b><em>{{ cur.totals.count }} on the list</em></div><div class="k"><span>Success fee ({{ cur.totals.fee_pct }}%)</span><b>{{ money(cur.totals.fee) }}</b><em>on money closed</em></div></div>
      <div class="cols"><div class="card"><h2>Investors</h2><RaiseTable :investors="cur.investors" :labels="data.labels ?? {}" :currency="cur.program.currency" /></div>
        <aside class="card"><h2>Meetings</h2><div v-for="m in upcoming" :key="m.id" class="mt"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }} ({{ m.minutes }} min)</span><a v-if="m.location && /^https?:/.test(m.location)" :href="m.location" target="_blank">Join link</a><span v-else-if="m.location" class="s">{{ m.location }}</span><div v-if="m.agenda" class="s ag" v-html="mdRender(m.agenda)" /></div>
          <p v-if="!upcoming.length" class="s">No meetings scheduled yet. You get an email when we book one, and reminders a day and an hour before.</p>
          <details v-if="past.length"><summary>Past meetings ({{ past.length }})</summary><div v-for="m in past" :key="m.id" class="mt past"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }}</span></div></details></aside></div>
    </template>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 12px; } h1 { margin: 0 0 6px; } .lead { color: var(--c-ink-soft); max-width: 780px; } .frm { display: flex; flex-direction: column; gap: 12px; max-width: 900px; } .frm h2 { margin: 0; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.agree { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .agree input { width: auto; } .row { display: flex; gap: 8px; } .error { color: var(--c-danger); }
.rtabs { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 10px 0; width: fit-content; max-width: 100%; overflow-x: auto; } .rtabs button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; } .rtabs .on { background: #fff; font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); }
.sub { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; } .pst { font-size: 12.5px; font-weight: 600; padding: 3px 9px; background: var(--c-paper-2); } .pst.active { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pst.closed { background: rgba(31,122,77,.1); color: var(--c-ok); }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 14px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 4px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .bar { height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-ok); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; } .cols h2 { margin: 0 0 8px; font-size: 16px; } .mt { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .mt a { color: var(--c-blue-deep); font-size: 13px; } .s { font-size: 12.5px; color: var(--c-muted); } .past { opacity: .7; }
@media (max-width: 1000px) { .cols, .g3, .g2 { grid-template-columns: 1fr; } }
div.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
/* fields fit */
input, select, textarea { box-sizing: border-box; max-width: 100%; min-width: 0; }
</style>
