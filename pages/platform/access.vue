<script setup lang="ts">
// Finvry access: who asked for an account, approving them in batches within the weekly cap, the sign-up mode and caps,
// and how far approved companies have got.
useHead({ title: 'Finvry · Access requests' })
interface R { id: string; name: string; email: string; company: string; website: string | null; country: string; stage: string; team_size: string; needs: string[]; needs_note: string | null; source: string | null; community: string | null; want_demo: boolean; flags: string[]; status: string; notes: string | null; created: string; invited: string | null; expired: boolean | null; signed_up_org: string | null; org_name: string | null; org_status: string | null; plan_code: string | null; has_figures: boolean; paying: boolean }
interface D { settings: { mode: 'invite_only' | 'open' | 'closed'; weekly_cap: number; services_month_cap: number; demo_url: string }; week: number; items: R[]; funnel: { requests: number; pending: number; approved: number; signed_up: number; with_figures: number; paying: number } }
const status = ref('pending')
const { data, refresh } = await useFetch<D>('/api/platform/access', { query: { status } })
const st = reactive({ mode: 'invite_only' as D['settings']['mode'], weekly_cap: 25, services_month_cap: 20, demo_url: '' })
watch(() => data.value?.settings, (s) => { if (s) Object.assign(st, s) }, { immediate: true })
const q = ref(''), stage = ref(''), country = ref(''), demoOnly = ref(false), sel = ref<string[]>([])
const STAGE: Record<string, string> = { idea: 'Idea', pre_seed: 'Pre-seed', seed: 'Seed', series_a: 'Series A+', established: 'Established' }
const NEED: Record<string, string> = { reporting: 'Reporting', investors: 'Investor relations', fundraising: 'Fundraising', cap_table: 'Cap table', forecast: 'Forecasts', customers: 'Customers', group: 'Group', compliance: 'Compliance', services: 'Services' }
const FLAG: Record<string, string> = { regulated: 'Regulated activity?', personal_email: 'Personal email', idea_stage: 'No company yet' }
const items = computed(() => (data.value?.items ?? []).filter((r) => (!stage.value || r.stage === stage.value) && (!country.value || r.country === country.value) && (!demoOnly.value || r.want_demo || r.status === 'demo')
  && (!q.value || (r.company + ' ' + r.name + ' ' + r.email + ' ' + (r.community ?? '') + ' ' + (r.source ?? '')).toLowerCase().includes(q.value.toLowerCase()))))
const countries = computed(() => [...new Set((data.value?.items ?? []).map((r) => r.country))].sort())
const allOn = computed(() => items.value.length > 0 && items.value.every((r) => sel.value.includes(r.id)))
function toggleAll() { sel.value = allOn.value ? [] : items.value.filter((r) => !r.signed_up_org).map((r) => r.id) }
const left = computed(() => (data.value?.settings.weekly_cap ? Math.max(0, data.value.settings.weekly_cap - data.value.week) : null))
const msg = ref(''), ok = ref(''), busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not do that.'
async function act(action: 'approve' | 'reject' | 'demo' | 'reopen', ids = sel.value) {
  if (!ids.length) return
  let email = false
  if (action === 'reject') { if (!await askConfirm('Reject ' + ids.length + ' request' + (ids.length === 1 ? '' : 's') + '?')) return; email = await askConfirm('Also email them a polite "not right now"?', { ok: 'Email them', cancel: 'No email' }) }
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ sent?: number; failed?: number }>('/api/platform/access/action', { method: 'POST', body: { ids, action, email } }); ok.value = action === 'approve' ? (r.sent ?? 0) + ' invitation' + (r.sent === 1 ? '' : 's') + ' sent.' + (r.failed ? ' ' + r.failed + ' could not be emailed: approved, so use Resend.' : '') : 'Done.'; sel.value = []; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const noteFor = ref<R | null>(null), noteText = ref('')
async function saveNote() { if (!noteFor.value) return; await $fetch('/api/platform/access/action', { method: 'POST', body: { ids: [noteFor.value.id], action: 'note', notes: noteText.value } }); noteFor.value = null; await refresh() }
const smsg = ref('')
async function saveSettings() { smsg.value = ''; try { await $fetch('/api/platform/access/settings', { method: 'POST', body: st }); smsg.value = 'Saved.'; await refresh() } catch (e) { smsg.value = err(e) } }
const stageOf = (r: R) => r.paying ? 'Paying' : r.has_figures ? 'Added figures' : r.signed_up_org ? (r.org_status === 'trial' ? 'On trial' : 'Signed up') : r.status === 'approved' ? (r.expired ? 'Invitation expired' : 'Invited ' + (r.invited ?? '')) : r.status === 'demo' ? 'Demo first' : r.status === 'rejected' ? 'Rejected' : 'Waiting'
</script>

<template>
  <section v-if="data" class="ac">
    <p class="label">Finvry platform</p>
    <h1>Access requests</h1>
    <div class="fx-stats">
      <StatTile label="Sign-up" :value="st.mode === 'invite_only' ? 'Invite-only' : st.mode === 'open' ? 'Open' : 'Closed'" :note="st.mode === 'invite_only' ? 'Request access; partner codes skip the queue' : st.mode === 'open' ? 'Anyone can sign up' : 'Requests kept, nobody new gets in'" />
      <StatTile label="Approved this week" :value="data.week + (data.settings.weekly_cap ? ' of ' + data.settings.weekly_cap : '')" :note="left === null ? 'No weekly cap' : left + ' left this week (Monday to Sunday)'" :red="left === 0" />
      <StatTile label="Waiting" :value="String(data.funnel.pending)" note="Pending or demo first" />
      <StatTile label="From request to paying" :value="data.funnel.paying + ' paying'" :note="data.funnel.requests + ' asked · ' + data.funnel.approved + ' invited · ' + data.funnel.signed_up + ' signed up · ' + data.funnel.with_figures + ' added figures'" full />
    </div>

    <details class="card set"><summary><b>Sign-up mode and caps</b><span class="mut">{{ st.mode.replace('_', '-') }} · {{ st.weekly_cap || 'no' }} a week · {{ st.services_month_cap || 'no' }} service orders a month</span></summary>
      <form class="sf" @submit.prevent="saveSettings">
        <fieldset class="md"><legend>Sign-up</legend>
          <label><input v-model="st.mode" type="radio" value="invite_only"> <b>Invite-only</b> <em>People request access; you approve. Partner and community codes skip the queue (within the cap).</em></label>
          <label><input v-model="st.mode" type="radio" value="open"> <b>Open</b> <em>Anyone can sign up, as before. The request form is hidden.</em></label>
          <label><input v-model="st.mode" type="radio" value="closed"> <b>Closed</b> <em>Requests are kept; nobody new gets in, not even with a code. For holidays or when the desk is full.</em></label></fieldset>
        <div class="g3"><label>New accounts a week<input v-model.number="st.weekly_cap" type="number" min="0"><span class="hint">Invitations plus partner-code sign-ups. Suggested: 25. 0 = no cap.</span></label>
          <label>New service orders a month<input v-model.number="st.services_month_cap" type="number" min="0"><span class="hint">Across all clients; past it, orders wait for next month. Suggested: 20. 0 = no cap.</span></label>
          <label>Demo booking link<input v-model="st.demo_url" type="url" placeholder="https://calendly.com/…"><span class="hint">Sent with the invitation to anyone who asked for a demo.</span></label></div>
        <div class="row"><button class="btn" type="submit">Save</button><span v-if="smsg" class="mut">{{ smsg }}</span></div>
      </form></details>

    <div class="bar">
      <nav class="seg"><button v-for="s in ['pending', 'demo', 'approved', 'rejected', 'all']" :key="s" type="button" :class="{ on: status === s }" @click="status = s; sel = []">{{ s === 'demo' ? 'Demo first' : s[0]!.toUpperCase() + s.slice(1) }}</button></nav>
      <input v-model="q" placeholder="Search company, name, community" class="srch"><select v-model="stage"><option value="">Any stage</option><option v-for="(l, k) in STAGE" :key="k" :value="k">{{ l }}</option></select>
      <select v-model="country"><option value="">Any country</option><option v-for="c in countries" :key="c">{{ c }}</option></select><label class="chk"><input v-model="demoOnly" type="checkbox"> Wants a demo</label>
    </div>
    <div v-if="sel.length" class="batch"><b>{{ sel.length }} selected</b><button class="btn sm" :disabled="busy" @click="act('approve')">Approve and invite</button><button class="btn secondary sm" :disabled="busy" @click="act('demo')">Demo first</button><button class="btn secondary sm" :disabled="busy" @click="act('reject')">Reject</button><span v-if="left !== null" class="mut">{{ left }} left this week</span></div>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div class="card pad0"><table class="t" data-nosearch>
      <thead><tr><th class="c"><input type="checkbox" :checked="allOn" aria-label="Select all" @change="toggleAll"></th><th>Company</th><th>Stage · team</th><th>Needs</th><th>From</th><th>Asked</th><th>Where they are</th><th /></tr></thead>
      <tbody><tr v-for="r in items" :key="r.id">
        <td class="c"><input v-model="sel" type="checkbox" :value="r.id" :disabled="!!r.signed_up_org" :aria-label="'Select ' + r.company"></td>
        <td><b>{{ r.company }}</b><span class="sub">{{ r.name }} · {{ r.email }}</span><span class="sub">{{ r.country }}<template v-if="r.website"> · <a :href="r.website.startsWith('http') ? r.website : 'https://' + r.website" target="_blank" rel="noopener">{{ r.website.replace(/^https?:\/\//, '') }}</a></template></span>
          <span v-if="r.flags.length" class="flags"><i v-for="f in r.flags" :key="f">{{ FLAG[f] ?? f }}</i></span></td>
        <td>{{ STAGE[r.stage] ?? r.stage }}<span class="sub">{{ r.team_size }} people</span></td>
        <td>{{ r.needs.map((n) => NEED[n] ?? n).join(', ') }}<span v-if="r.needs_note" class="sub" :title="r.needs_note">{{ r.needs_note.slice(0, 90) }}{{ r.needs_note.length > 90 ? '…' : '' }}</span></td>
        <td>{{ r.community || r.source || '—' }}<span v-if="r.want_demo" class="sub">Wants a demo</span></td>
        <td class="nw">{{ r.created }}</td>
        <td class="nw">{{ stageOf(r) }}<span v-if="r.org_name" class="sub"><NuxtLink :to="'/platform/customers/' + r.signed_up_org">{{ r.org_name }}</NuxtLink></span><span v-if="r.notes" class="sub note" :title="r.notes">Note: {{ r.notes.slice(0, 60) }}</span></td>
        <td class="acts"><template v-if="!r.signed_up_org"><button v-if="r.status !== 'approved'" class="lk" :disabled="busy" @click="act('approve', [r.id])">Approve</button><button v-else class="lk" :disabled="busy" @click="act('approve', [r.id])">Resend</button>
          <button v-if="r.status === 'rejected'" class="lk" @click="act('reopen', [r.id])">Reopen</button></template><button class="lk" @click="noteFor = r; noteText = r.notes ?? ''">Note</button></td></tr>
        <tr v-if="!items.length"><td colspan="8" class="none">Nothing here.</td></tr></tbody></table></div>
    <AppModal :open="!!noteFor" :title="'Note on ' + (noteFor?.company ?? '')" @close="noteFor = null"><form class="sf" @submit.prevent="saveNote"><textarea v-model="noteText" rows="5" maxlength="5000" /><div class="row"><button class="btn" type="submit">Save note</button></div></form></AppModal>
  </section>
</template>

<style scoped>
.ac { display: flex; flex-direction: column; gap: 14px; } .ac h1 { margin: 0; }
.mut { color: var(--c-muted); font-size: 13px; } .hint { font-size: 12px; color: var(--c-muted); font-weight: 400; }
.set summary { display: flex; gap: 14px; align-items: baseline; cursor: pointer; flex-wrap: wrap; } .set summary b { font-size: 15px; }
.sf { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; } .md { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; } .md legend { font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); margin-bottom: 4px; }
.md label { display: flex; gap: 8px; align-items: baseline; font-size: 14px; flex-wrap: wrap; } .md em { font-style: normal; color: var(--c-muted); font-size: 13px; flex-basis: 100%; padding-left: 22px; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } .g3 label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--c-ink-soft); }
.sf input:not([type="radio"]):not([type="checkbox"]), .sf textarea, .bar input, .bar select { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; }
.row { display: flex; gap: 12px; align-items: center; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .srch { min-width: 240px; } .chk { display: flex; gap: 6px; align-items: center; font-size: 13.5px; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { font: inherit; font-size: 13px; padding: 7px 12px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.batch { display: flex; gap: 10px; align-items: center; padding: 10px 14px; background: #f4f6f9; border: 1px solid var(--c-rule); } .btn.sm { height: 32px; padding: 0 12px; font-size: 13px; }
.pad0 { padding: 0; overflow-x: auto; } .t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; color: var(--c-muted); padding: 10px 12px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; white-space: nowrap; }
.t td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t .c { width: 32px; } .nw { white-space: nowrap; } .sub { display: block; font-size: 12px; color: var(--c-muted); margin-top: 2px; } .sub.note { font-style: italic; }
.flags { display: flex; gap: 6px; margin-top: 5px; flex-wrap: wrap; } .flags i { font-style: normal; font-size: 11px; padding: 1px 6px; background: #fdf0ee; color: var(--c-danger); border: 1px solid #f3d3cd; }
.acts { white-space: nowrap; text-align: right; } .lk { background: none; border: 0; padding: 0; margin-left: 12px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .none { color: var(--c-muted); text-align: center; padding: 24px; }
.okm { color: var(--c-navy); margin: 0; } .error { color: var(--c-danger); margin: 0; }
.sf textarea { width: 100%; }
@media (max-width: 900px) { .g3 { grid-template-columns: 1fr; } }
</style>
