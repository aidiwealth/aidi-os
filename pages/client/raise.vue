<script setup lang="ts">
// Founder: managed fundraising — the brief, then progress (investors, meetings, totals).
useHead({ title: 'Fundraise with us' })
interface V { enabled: boolean; program?: { id: string; status: string; currency: string; target: string | null; round: string | null; instrument: string | null; fee_pct: string; intake_at: string | null }; investors?: never[]; meetings?: { id: string; title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null }[]; totals?: { target: number; committed: number; closed: number; pipeline: number; fee: number; fee_pct: number; count: number; active: number }; labels?: Record<string, string> }
const { data, refresh } = await useFetch<V>('/api/portal/raise')
const f = reactive({ target: '' as string | number, currency: 'USD', round: 'Pre-seed', instrument: 'SAFE', valuation: '' as string | number, raised_so_far: '' as string | number, use_of_funds: '', traction: '', deck_url: '', target_investors: '', timeline: '', agree_fee: false })
const msg = ref(''); const busy = ref(false)
async function submit() { busy.value = true; msg.value = ''; try { await $fetch('/api/portal/raise/intake', { method: 'POST', body: f }); await refresh() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { busy.value = false } }
const money = (v: number | string | null | undefined) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.program?.currency ?? 'USD', maximumFractionDigits: 0 }).format(Number(v ?? 0))
const upcoming = computed(() => (data.value?.meetings ?? []).filter((m) => new Date(m.starts_at) > new Date()))
const past = computed(() => (data.value?.meetings ?? []).filter((m) => new Date(m.starts_at) <= new Date()).reverse())
const pct = computed(() => (data.value?.totals?.target ? Math.min(100, Math.round((data.value.totals.committed / data.value.totals.target) * 100)) : 0))
const when = (s: string) => new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p><h1>Fundraise with us</h1>
    <div v-if="!data.enabled" class="card"><p>Managed fundraising isn't switched on for your company. Message our team from Inbox if you'd like us to run your raise.</p></div>
    <template v-else-if="data.program && !data.program.intake_at">
      <p class="lead">Our team runs your raise: we build the investor list, make introductions, set up meetings and help you close. You see every step here. Our success fee is {{ Number(data.program.fee_pct) }}% of the money you close through us.</p>
      <form class="card frm" @submit.prevent="submit"><h2>Your raise</h2>
        <div class="g3"><label class="label">Amount you are raising *<input v-model="f.target" inputmode="decimal" required placeholder="e.g. 500000"></label><label class="label">Currency<select v-model="f.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
          <label class="label">Round *<select v-model="f.round"><option>Pre-seed</option><option>Seed</option><option>Series A</option><option>Bridge</option><option>Debt</option></select></label>
          <label class="label">Instrument *<select v-model="f.instrument"><option>SAFE</option><option>Priced equity</option><option>Convertible note</option><option>Debt</option></select></label><label class="label">Valuation or cap<input v-model="f.valuation" inputmode="decimal"></label><label class="label">Raised so far<input v-model="f.raised_so_far" inputmode="decimal"></label></div>
        <label class="label">How you will use the money *<textarea v-model="f.use_of_funds" rows="3" required maxlength="3000" /></label>
        <label class="label">Traction (revenue, users, growth)<textarea v-model="f.traction" rows="3" maxlength="3000" /></label>
        <div class="g2"><label class="label">Deck link<input v-model="f.deck_url" maxlength="500" placeholder="Leave blank to use your deck in Documents"></label><label class="label">Timeline<input v-model="f.timeline" maxlength="200" placeholder="e.g. close by March"></label></div>
        <label class="label">Investors you would like us to approach<textarea v-model="f.target_investors" rows="2" maxlength="3000" /></label>
        <label class="agree"><input v-model="f.agree_fee" type="checkbox"> I agree to a success fee of {{ Number(data.program.fee_pct) }}% of the money closed through this service.</label>
        <button class="btn" :disabled="busy || !f.agree_fee">{{ busy ? 'Sending…' : 'Start my raise' }}</button><p v-if="msg" class="error">{{ msg }}</p></form>
    </template>
    <template v-else-if="data.program && data.totals">
      <p class="lead">{{ data.program.round }} · {{ data.program.instrument }} · status: <b>{{ { active: 'In progress', paused: 'Paused', closed: 'Closed', intake: 'Getting started' }[data.program.status] }}</b></p>
      <div class="kp"><div class="k"><span>Target</span><b>{{ money(data.totals.target) }}</b></div><div class="k"><span>Committed</span><b>{{ money(data.totals.committed) }}</b><div class="bar"><i :style="{ width: pct + '%' }" /></div><em>{{ pct }}% of target</em></div><div class="k"><span>Closed</span><b>{{ money(data.totals.closed) }}</b></div><div class="k"><span>Investors in play</span><b>{{ data.totals.active }}</b><em>{{ data.totals.count }} on the list</em></div><div class="k"><span>Success fee ({{ data.totals.fee_pct }}%)</span><b>{{ money(data.totals.fee) }}</b><em>on money closed</em></div></div>
      <div class="cols"><div class="card"><h2>Investors</h2><RaiseTable :investors="data.investors ?? []" :labels="data.labels ?? {}" :currency="data.program.currency" /></div>
        <aside class="card"><h2>Meetings</h2><div v-for="m in upcoming" :key="m.id" class="mt"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }} ({{ m.minutes }} min)</span><a v-if="m.location && /^https?:/.test(m.location)" :href="m.location" target="_blank">Join link</a><span v-else-if="m.location" class="s">{{ m.location }}</span><span v-if="m.agenda" class="s">{{ m.agenda }}</span></div>
          <p v-if="!upcoming.length" class="s">No meetings scheduled yet. You get an email when we book one, and reminders a day and an hour before.</p>
          <details v-if="past.length"><summary>Past meetings ({{ past.length }})</summary><div v-for="m in past" :key="m.id" class="mt past"><b>{{ when(m.starts_at) }}</b><span>{{ m.title }}{{ m.investor ? ' · ' + m.investor : '' }}</span></div></details></aside></div>
    </template>
  </section>
</template>
<style scoped>
h1 { margin: 0 0 6px; } .lead { color: var(--c-ink-soft); max-width: 780px; } .frm { display: flex; flex-direction: column; gap: 12px; max-width: 900px; } .frm h2 { margin: 0; }
.g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.agree { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .agree input { width: auto; } .btn { align-self: flex-start; } .error { color: var(--c-danger); }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 14px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 4px; } .k span { font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; } .k em { font-style: normal; font-size: 12px; color: var(--c-muted); } .bar { height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-ok); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; } .cols h2 { margin: 0 0 8px; font-size: 16px; } .mt { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .mt a { color: var(--c-blue-deep); font-size: 13px; } .s { font-size: 12.5px; color: var(--c-muted); } .past { opacity: .7; }
@media (max-width: 1000px) { .cols, .g3, .g2 { grid-template-columns: 1fr; } }
</style>
