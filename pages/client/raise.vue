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
const n = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0
const feeEst = computed(() => Math.round(n(f.target) * Number(data.value?.fee_pct ?? 0) / 100))
const left = computed(() => Math.max(0, n(f.target) - n(f.raised_so_far)))
const plain = (s: string) => s.replace(/<[^>]+>|[#*_>`\-]/g, '').trim()
const checks = computed(() => [
  { t: 'Amount and round', ok: n(f.target) > 0 && !!f.round && !!f.instrument },
  { t: 'Use of funds', ok: plain(f.use_of_funds).length > 20 },
  { t: 'Traction', ok: plain(f.traction).length > 20 },
  { t: 'Deck or deck link', ok: true },
  { t: 'Target investors', ok: plain(f.target_investors).length > 3 },
  { t: 'Timeline', ok: !!f.timeline.trim() },
])
const done = computed(() => checks.value.filter((c) => c.ok).length)
const STEPS = [
  { h: 'Share your brief', p: 'Tell us how much you are raising, on what terms, and why. You can edit it any time.' },
  { h: 'We build your list', p: 'Our team matches you with investors who back your stage, sector and cheque size.' },
  { h: 'Intros and meetings', p: 'We make warm introductions and book meetings. You see each one here, with reminders.' },
  { h: 'Close the round', p: 'We help with follow-ups, terms and paperwork until the money lands.' },
]
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric' })
const mon = (s: string) => new Date(s).toLocaleDateString('en-GB', { month: 'short' })
const time = (s: string) => new Date(s).toLocaleTimeString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const ST: Record<string, string> = { intake: 'Getting started', active: 'In progress', paused: 'Paused', closed: 'Closed' }
</script>
<template>
  <section v-if="data" class="rz">
    <p class="label">Investors</p>
    <div class="hd"><div><h1>Fundraise with us</h1><p class="lead">A team that runs your raise end to end, while you keep building.</p></div><button v-if="data.enabled && !editing && data.programs?.length" class="btn" @click="start">+ Start a new raise</button></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-if="!data.enabled" class="card off"><h2>Managed fundraising is not on for your company yet</h2><p>Message our team from Inbox and we will switch it on and set up a call about your round.</p><NuxtLink to="/client/messages" class="btn secondary">Message our team</NuxtLink></div>
    <template v-else-if="editing || !data.programs?.length">
      <div v-if="!f.id" class="hero">
        <div class="hx"><h2>How it works</h2><p>You tell us about the round. We find the right investors, make introductions, book meetings and help you close. Every investor and meeting shows up on this page as it happens.</p></div>
        <ol class="steps"><li v-for="(s, i) in STEPS" :key="s.h"><span class="no">{{ i + 1 }}</span><b>{{ s.h }}</b><p>{{ s.p }}</p></li></ol>
        <div class="fee"><b>{{ data.fee_pct }}%</b><span>success fee, only on money you close through us. Nothing to pay up front.</span></div>
      </div>
      <div class="lay">
        <form class="frm" @submit.prevent="submit">
          <div class="sec"><div class="sh"><span class="no">1</span><div><h3>{{ f.id ? 'Edit your round' : 'The round' }}</h3><p>The headline numbers investors ask about first.</p></div></div>
            <div class="g3"><label class="label">Amount you are raising *<input v-model="f.target" inputmode="decimal" required placeholder="e.g. 500000"></label><label class="label">Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
              <label class="label">Round *<select v-model="f.round"><option>Pre-seed</option><option>Seed</option><option>Series A</option><option>Bridge</option><option>Debt</option></select></label>
              <label class="label">Instrument *<select v-model="f.instrument"><option>SAFE</option><option>Priced equity</option><option>Convertible note</option><option>Debt</option></select></label><label class="label">Valuation or cap<input v-model="f.valuation" inputmode="decimal" placeholder="Optional"></label><label class="label">Raised so far<input v-model="f.raised_so_far" inputmode="decimal" placeholder="Committed or in the bank"></label></div></div>
          <div class="sec"><div class="sh"><span class="no">2</span><div><h3>Use of funds *</h3><p>Where the money goes and what it gets you. Investors want to see the milestones this round buys, e.g. hires, product, markets and runway in months.</p></div></div>
            <ClientOnly><RichEditor v-model="f.use_of_funds" :min-height="180" :max-length="3000" placeholder="e.g. 40% engineering (3 hires), 30% growth in Lagos and Nairobi, 30% working capital. 18 months of runway." /></ClientOnly></div>
          <div class="sec"><div class="sh"><span class="no">3</span><div><h3>Traction</h3><p>Proof it is working: revenue, users, growth rate, retention, key customers or partners. Numbers beat adjectives.</p></div></div>
            <ClientOnly><RichEditor v-model="f.traction" :min-height="180" :max-length="3000" placeholder="e.g. $40k MRR, growing 15% month on month. 1,200 paying users, 92% retained after 3 months." /></ClientOnly></div>
          <div class="sec"><div class="sh"><span class="no">4</span><div><h3>Investors and timing</h3><p>Who you would like to meet, and when you need to close. We add our own matches on top.</p></div></div>
            <ClientOnly><RichEditor v-model="f.target_investors" :min-height="140" :max-length="3000" placeholder="Funds or angels you would like an intro to, one per line, and any you have already spoken to." /></ClientOnly>
            <div class="g2"><label class="label">Deck link<input v-model="f.deck_url" maxlength="500" placeholder="Leave blank to use your deck in Decks"></label><label class="label">Timeline<input v-model="f.timeline" maxlength="200" placeholder="e.g. close by March"></label></div></div>
          <div class="sec agreebox"><label class="agree"><input v-model="f.agree_fee" type="checkbox"> <span>I agree to a success fee of <b>{{ data.fee_pct }}%</b> of the money closed through this service. No fee is due if nothing closes.</span></label>
            <div class="row"><button class="btn" :disabled="busy || !f.agree_fee">{{ busy ? 'Saving…' : f.id ? 'Save changes' : 'Start my raise' }}</button><button v-if="editing && data.programs?.length" type="button" class="btn secondary" @click="editing = false">Cancel</button></div></div>
        </form>
        <aside class="side">
          <div class="pane"><p class="cap">Your round</p><b class="big">{{ n(f.target) ? money(n(f.target), f.currency) : '—' }}</b><span class="s">{{ f.round }} · {{ f.instrument }}</span>
            <dl><div><dt>Raised so far</dt><dd>{{ money(n(f.raised_so_far), f.currency) }}</dd></div><div><dt>Still to raise</dt><dd>{{ money(left, f.currency) }}</dd></div><div><dt>Fee if fully closed</dt><dd>{{ money(feeEst, f.currency) }}</dd></div></dl></div>
          <div class="pane"><p class="cap">Brief strength · {{ done }}/{{ checks.length }}</p><div class="bar"><i :style="{ width: (done / checks.length) * 100 + '%' }" /></div>
            <ul class="ck"><li v-for="c in checks" :key="c.t" :class="{ ok: c.ok }"><span>{{ c.ok ? '✓' : '○' }}</span>{{ c.t }}</li></ul></div>
          <div class="pane tips"><p class="cap">Tips</p><ul><li>Lead with your strongest number.</li><li>Tie every use of funds to a milestone.</li><li>Name investors you already know; warm intros convert best.</li></ul></div>
        </aside>
      </div>
    </template>
    <template v-else-if="cur">
      <nav v-if="(data.programs?.length ?? 0) > 1" class="rtabs"><button v-for="p in data.programs" :key="p.program.id" :class="{ on: sel === p.program.id }" @click="sel = p.program.id">{{ p.program.round }} · {{ money(p.program.target, p.program.currency) }}</button></nav>
      <div class="banner"><div><p class="cap">{{ cur.program.round }} · {{ cur.program.instrument }}</p><h2>{{ money(cur.totals.target) }} round <span class="pst" :class="cur.program.status">{{ ST[cur.program.status] }}</span></h2>
          <div class="prog"><div class="bar big"><i :style="{ width: pct + '%' }" /></div><span>{{ money(cur.totals.committed) }} committed · {{ pct }}% of target</span></div></div>
        <div class="row"><button v-if="cur.program.status !== 'closed'" class="btn secondary" @click="edit">Edit brief</button><button class="btn secondary danger" @click="del">Delete raise</button></div></div>
      <div class="fx-stats">
        <StatTile icon="money" tone="c" label="Committed" :value="money(cur.totals.committed)" :note="pct + '% of target'" />
        <StatTile icon="check" tone="g" label="Closed" :value="money(cur.totals.closed)" note="money in the bank" />
        <StatTile icon="users" tone="b" label="Investors in play" :value="cur.totals.active" :note="cur.totals.count + ' on the list'" />
        <StatTile icon="calendar" tone="n" label="Meetings booked" :value="upcoming.length" :note="past.length + ' held'" />
        <StatTile icon="billing" tone="a" :label="'Success fee (' + cur.totals.fee_pct + '%)'" :value="money(cur.totals.fee)" note="on money closed" />
      </div>
      <div class="cols"><div class="card"><h2>Investors</h2><p class="s">Everyone we are talking to for this round and where each conversation stands.</p><RaiseTable :investors="cur.investors" :labels="data.labels ?? {}" :currency="cur.program.currency" /></div>
        <aside class="card"><h2>Meetings</h2><div v-for="m in upcoming" :key="m.id" class="mt"><span class="fx-cal"><em>{{ mon(m.starts_at) }}</em><b>{{ day(m.starts_at) }}</b></span><div class="mb"><b>{{ m.title }}</b><span class="s">{{ time(m.starts_at) }} · {{ m.minutes }} min{{ m.investor ? ' · ' + m.investor : '' }}</span><a v-if="m.location && /^https?:/.test(m.location)" :href="m.location" target="_blank">Join link →</a><span v-else-if="m.location" class="s">{{ m.location }}</span><div v-if="m.agenda" class="s ag mdb" v-html="mdRender(m.agenda)" /></div></div>
          <p v-if="!upcoming.length" class="s empty">No meetings scheduled yet. You get an email when we book one, and reminders a day and an hour before.</p>
          <details v-if="past.length"><summary>Past meetings ({{ past.length }})</summary><div v-for="m in past" :key="m.id" class="mt past"><span class="fx-cal"><em>{{ mon(m.starts_at) }}</em><b>{{ day(m.starts_at) }}</b></span><div class="mb"><b>{{ m.title }}</b><span class="s">{{ m.investor ?? '' }}</span></div></div></details></aside></div>
    </template>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } h1 { margin: 0 0 4px; } .lead { color: var(--c-ink-soft); max-width: 780px; margin: 0; } .error { color: var(--c-danger); }
.cap { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--c-muted); margin: 0 0 6px; font-weight: 600; } .s { font-size: 12.5px; color: var(--c-muted); }
.off { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-top: 16px; } .off h2 { margin: 0; font-size: 17px; } .off p { margin: 0; }
.hero { margin: 18px 0; background: #fff; border: 1px solid var(--c-rule); padding: 22px 24px; display: grid; gap: 18px; } .hx h2 { margin: 0 0 6px; font-size: 18px; } .hx p { margin: 0; color: var(--c-ink-soft); max-width: 760px; line-height: 1.5; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-top: 1px solid var(--c-rule); } .steps li { padding: 14px 16px 0 0; display: flex; flex-direction: column; gap: 4px; } .steps li + li { padding-left: 16px; border-left: 1px solid var(--c-rule); } .steps b { font-size: 14px; color: var(--c-ink); } .steps p { margin: 0; font-size: 13px; color: var(--c-muted); line-height: 1.45; }
.steps .no { width: 30px; height: 30px; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.fee { display: flex; gap: 12px; align-items: baseline; background: #f1faf4; border: 1px solid #cfe9d8; padding: 10px 14px; } .fee b { font-size: 22px; color: var(--c-ok); } .fee span { font-size: 13.5px; color: var(--c-ink-soft); }
.lay { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; margin-top: 18px; }
.frm { display: flex; flex-direction: column; gap: 0; background: #fff; border: 1px solid var(--c-rule); } .sec { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; } .sec + .sec { border-top: 1px solid var(--c-rule); }
.sh { display: flex; gap: 12px; align-items: flex-start; } .sh h3 { margin: 0 0 2px; font-size: 15.5px; } .sh p { margin: 0; font-size: 13px; color: var(--c-muted); line-height: 1.45; max-width: 640px; } .sec .no { flex: none; width: 30px; height: 30px; background: var(--c-signal-soft); color: var(--c-blue-deep); font-weight: 700; display: grid; place-items: center; font-size: 12.5px; font-weight: 600; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; box-sizing: border-box; max-width: 100%; min-width: 0; border-radius: 0; }
.agreebox { background: var(--c-paper-2); } .agree { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; line-height: 1.45; } .agree input { width: auto; margin-top: 3px; } .row { display: flex; gap: 8px; flex-wrap: wrap; }
.side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 16px; } .pane { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; } .pane .big { display: block; font-size: 26px; font-weight: 600; }
.pane dl { margin: 12px 0 0; display: flex; flex-direction: column; } .pane dl div { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .pane dt { color: var(--c-muted); } .pane dd { margin: 0; font-weight: 600; }
.ck { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .ck li { display: flex; gap: 8px; } .ck li.ok { color: var(--c-ink); } .ck li.ok span { color: var(--c-ok); font-weight: 700; }
.tips ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); display: flex; flex-direction: column; gap: 6px; }
.bar { height: 6px; background: var(--c-paper-2); } .bar.big { height: 10px; } .bar i { display: block; height: 100%; background: var(--c-ok); }
.rtabs { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 14px 0 0; width: fit-content; max-width: 100%; overflow-x: auto; } .rtabs button { background: none; border: 0; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; } .rtabs .on { background: #fff; font-weight: 600; }
.banner { margin: 14px 0 0; background: #fff; border: 1px solid var(--c-rule); padding: 18px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; } .banner > div:first-child { flex: 1; min-width: 260px; } .banner h2 { margin: 0 0 12px; font-size: 22px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.prog { display: flex; flex-direction: column; gap: 6px; max-width: 560px; } .prog span { font-size: 13px; color: var(--c-muted); }
.pst { font-size: 12px; font-weight: 600; padding: 3px 9px; background: var(--c-paper-2); } .pst.active { background: var(--c-signal-soft); color: var(--c-blue-deep); } .pst.closed { background: rgba(31,122,77,.1); color: var(--c-ok); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; align-items: start; } .cols h2 { margin: 0 0 4px; font-size: 16px; } .cols .card > .s { margin: 0 0 10px; }
.mt { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .dt { flex: none; width: 44px; border: 1px solid var(--c-rule-strong); text-align: center; display: flex; flex-direction: column; } .dt b { font-size: 17px; padding: 3px 0 0; } .dt span { font-size: 10.5px; text-transform: uppercase; background: var(--c-paper-2); padding: 2px 0; }
.mb { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .mb a { color: var(--c-blue-deep); font-size: 13px; } .empty { padding: 12px; background: var(--c-paper-2); } .past { opacity: .7; } summary { cursor: pointer; font-size: 13px; margin-top: 10px; }
@media (max-width: 1000px) { .cols, .lay, .g3, .g2, .steps { grid-template-columns: 1fr; } .steps li + li { padding-left: 0; border-left: 0; border-top: 1px solid var(--c-rule); padding-top: 12px; } .side { position: static; } }
</style>
