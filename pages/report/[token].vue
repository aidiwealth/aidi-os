<script setup lang="ts">
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface Metric { key: string; label: string; unit: string; hint: string }
interface Data { company: string; founderName: string; period: string; periodLabel: string; quarterly?: boolean; status: string; submittedAt: string | null; expiresAt: string; metrics: Metric[]; values: Record<string, number | null>; update: Record<string, string>; cap?: Record<string, unknown>; prefill?: { values: Record<string, number | null>; from: string } | null; workspace: { name: string; firm: string; brand: string } }
const { data, error } = await useFetch<Data>('/api/public/report/' + token, { key: 'pub-report-' + token })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · ' + data.value.periodLabel + ' update — ' + data.value.workspace.firm : 'Founder update'), meta: [{ name: 'robots', content: 'noindex' }] })
const vals = reactive<Record<string, string>>({})
const upd = reactive({ highlights: '', challenges: '', asks: '' })
// Optional: new money and ownership, asked lightly so the team's records stay in line with the company's.
const cap = reactive({ new_money: '', kind: 'priced', round_name: '', amount: '', price_per_share: '', valuation_cap: '', post_money: '', fd_shares: '' })
const capOpen = ref(false)
const prefilled = ref(false)
function usePrefill() { const p = data.value?.prefill; if (!p) return; for (const [k, v] of Object.entries(p.values)) if (v !== null && v !== undefined && !vals[k]) vals[k] = String(v); prefilled.value = true }
const state = reactive({ busy: false, msg: '', ok: '', aiNote: '', submitted: false })
watchEffect(() => {
  if (!data.value) return
  for (const m of data.value.metrics) if (!(m.key in vals)) vals[m.key] = data.value.values[m.key] == null ? '' : String(data.value.values[m.key])
  upd.highlights ||= data.value.update.highlights ?? ''; upd.challenges ||= data.value.update.challenges ?? ''; upd.asks ||= data.value.update.asks ?? ''
  state.submitted = data.value.status === 'submitted'
  const c = data.value.cap ?? {}
  for (const k of Object.keys(cap) as (keyof typeof cap)[]) if (c[k] !== undefined && c[k] !== null && !cap[k]) cap[k] = String(c[k])
  if (cap.new_money || cap.fd_shares) capOpen.value = true
})
function parseNum(s: string): number | null | 'bad' {
  const t = s.trim().replace(/[$,\s%]/g, '').toLowerCase()
  if (!t) return null
  const m = t.match(/^(-?\d+(?:\.\d+)?)([km])?$/)
  if (!m) return 'bad'
  return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)
}
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Please try again.' }
async function save(submit: boolean) {
  state.msg = ''; state.ok = ''
  const values: Record<string, number | null> = {}
  for (const m of data.value?.metrics ?? []) {
    const n = parseNum(vals[m.key] ?? '')
    if (n === 'bad') { state.msg = m.label + ': use a number, e.g. 45000 or 45k.'; return }
    values[m.key] = n
  }
  if (submit && Object.values(values).every((v) => v === null)) { state.msg = 'Add at least one figure before submitting.'; return }
  const capOut: Record<string, unknown> = { new_money: cap.new_money, kind: cap.new_money === 'yes' ? cap.kind : '', round_name: cap.round_name }
  for (const k of ['amount', 'price_per_share', 'valuation_cap', 'post_money', 'fd_shares'] as const) { const n = parseNum(cap[k]); if (n === 'bad') { state.msg = 'Ownership: use numbers only, e.g. 2000000 or 2m.'; return } capOut[k] = n }
  state.busy = true
  try {
    await $fetch('/api/public/report/' + token + '/save', { method: 'POST', body: { values, update: { ...upd }, submit, cap: capOut } })
    if (submit) { state.submitted = true; window.scrollTo({ top: 0, behavior: 'smooth' }) }
    else state.ok = 'Saved. You can close this page and come back with the same link to finish.'
  } catch (e) { state.msg = errText(e) } finally { state.busy = false }
}
const fileEl = ref<HTMLInputElement | null>(null)
const over = ref(false)
async function upload(f: File | undefined) {
  if (!f) return
  state.msg = ''; state.ok = ''; state.aiNote = ''
  const fd = new FormData(); fd.append('file', f)
  state.busy = true
  try {
    const r = await $fetch<{ values: Record<string, number | null>; notes: string; update?: { highlights: string; challenges: string; asks: string } }>('/api/public/report/' + token + '/upload', { method: 'POST', body: fd })
    let found = 0
    for (const [k, v] of Object.entries(r.values)) if (v !== null && v !== undefined) { vals[k] = String(v); found++ }
    if (r.update) { if (!upd.highlights && r.update.highlights) upd.highlights = r.update.highlights; if (!upd.challenges && r.update.challenges) upd.challenges = r.update.challenges; if (!upd.asks && r.update.asks) upd.asks = r.update.asks }
    state.aiNote = found ? 'We filled in ' + found + ' figure' + (found === 1 ? '' : 's') + ' from your file. Please check them before submitting.' + (r.notes ? ' Note: ' + r.notes : '')
      : 'We could not find these figures in your file. Please type them in.'
  } catch (e) { state.msg = errText(e) } finally { state.busy = false; if (fileEl.value) fileEl.value.value = '' }
}
</script>

<template>
  <div class="wrap">
    <div v-if="error" class="card center">
      <h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1>
      <p>{{ error.statusCode === 410 ? 'Ask the team that sent it for a new one.' : 'Check you opened the full link from the email, or ask the team that sent it for a new one.' }}</p>
    </div>

    <template v-else-if="data">
      <p class="label">{{ data.quarterly ? 'Quarterly' : 'Monthly' }} update · {{ data.periodLabel }}</p>
      <h1>{{ data.company }}</h1>

      <div v-if="state.submitted" class="card done" role="status">
        <h2>Thank you, {{ data.founderName.split(' ')[0] }}.</h2>
        <p>Your {{ data.periodLabel }} update has been received by the {{ data.workspace.firm }} team. You can still change it below until the link expires on {{ new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) }}.</p>
      </div>
      <p v-else class="lead">Hi {{ data.founderName.split(' ')[0] }}, this takes about five minutes. Drop in your report (spreadsheet or PDF) and we'll fill in the figures and notes for you, or type them in below. You can save and come back to finish with the same link.</p>

      <div class="drop" :class="{ over }" role="button" tabindex="0" aria-label="Upload your report: Excel, CSV or PDF"
        @click="fileEl?.click()" @keydown.enter.prevent="fileEl?.click()" @keydown.space.prevent="fileEl?.click()"
        @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="over = false; upload($event.dataTransfer?.files?.[0])">
        <input ref="fileEl" type="file" class="sr-only" tabindex="-1" accept=".xlsx,.csv,.pdf,application/pdf" @change="upload(($event.target as HTMLInputElement).files?.[0])">
        <p><b>{{ state.busy ? 'Reading your file…' : 'Drop your report here' }}</b> (Excel, CSV or PDF, such as your investor update), or click to choose</p>
        <p class="hint">We read the {{ data.periodLabel }} figures from it. You check them before anything is sent.</p>
      </div>
      <p class="tpl">Easiest: report in the <a :href="'/api/public/report/' + token + '/template'">Aidi report template (Excel)</a>. It is read exactly as you fill it in.</p>
      <p v-if="state.aiNote" class="ai" role="status">{{ state.aiNote }}</p>

      <div v-if="data.prefill && !prefilled && !state.submitted" class="pre"><span>Your figures for {{ data.periodLabel }} are already in <b>{{ data.prefill.from }}</b>.</span><button type="button" class="btn secondary sm" @click="usePrefill">Fill them in</button></div>
      <form class="card form" @submit.prevent="save(true)">
        <h2>Key figures for {{ data.periodLabel }}</h2>
        <div class="grid">
          <label v-for="m in data.metrics" :key="m.key">
            <span class="label">{{ m.label }}<template v-if="m.unit === 'usd'"> (USD)</template><template v-else-if="m.unit === 'pct'"> (%)</template></span>
            <input v-model="vals[m.key]" inputmode="decimal" :placeholder="m.unit === 'usd' ? 'e.g. 45000 or 45k' : m.unit === 'pct' ? 'e.g. 62' : 'e.g. 12'">
            <span class="hint">{{ m.hint }}</span>
          </label>
        </div>
        <h2>In a few words</h2>
        <label><span class="label">Highlights</span><textarea v-model="upd.highlights" rows="3" maxlength="4000" placeholder="Wins, launches, hires" /></label>
        <label><span class="label">Challenges</span><textarea v-model="upd.challenges" rows="3" maxlength="4000" /></label>
        <label><span class="label">How can we help?</span><textarea v-model="upd.asks" rows="2" maxlength="4000" placeholder="Intros, hiring, fundraising" /></label>
        <div class="own">
          <button type="button" class="ownh" :aria-expanded="capOpen" @click="capOpen = !capOpen"><span><b>Ownership check</b> <em>optional · about a minute</em></span><span class="chev">{{ capOpen ? '−' : '+' }}</span></button>
          <div v-if="capOpen" class="ownb">
            <p class="hint">Helps us keep our records in line with yours. Seen only by the {{ data.workspace.firm }} team. Skip anything you'd rather not share.</p>
            <div class="seg2" role="radiogroup" aria-label="New money since your last update"><span class="label">Any new money in since your last update?</span>
              <label><input v-model="cap.new_money" type="radio" value="no"> No</label><label><input v-model="cap.new_money" type="radio" value="yes"> Yes</label><label><input v-model="cap.new_money" type="radio" value="call"> Happy to share on a call</label></div>
            <div v-if="cap.new_money === 'yes'" class="grid">
              <label><span class="label">How it came in</span><select v-model="cap.kind"><option value="priced">Priced round (shares)</option><option value="safe">SAFE</option><option value="note">Convertible note</option><option value="other">Other</option></select></label>
              <label><span class="label">Round name (optional)</span><input v-model="cap.round_name" maxlength="80" placeholder="e.g. Seed extension"></label>
              <label><span class="label">Amount raised (USD)</span><input v-model="cap.amount" inputmode="decimal" placeholder="e.g. 1.5m"></label>
              <label v-if="cap.kind === 'priced'"><span class="label">Price per share (USD)</span><input v-model="cap.price_per_share" inputmode="decimal" placeholder="e.g. 1.25"></label>
              <label v-if="cap.kind === 'priced'"><span class="label">Post-money valuation (if known)</span><input v-model="cap.post_money" inputmode="decimal" placeholder="e.g. 20m"></label>
              <label v-else><span class="label">Valuation cap (if any)</span><input v-model="cap.valuation_cap" inputmode="decimal" placeholder="e.g. 15m"></label>
            </div>
            <label class="fd"><span class="label">Fully diluted shares today (optional)</span><input v-model="cap.fd_shares" inputmode="decimal" placeholder="e.g. 12,500,000"><span class="hint">All shares plus the option pool. Lets us keep our ownership right without asking for your cap table.</span></label>
          </div>
        </div>
        <div class="row">
          <button class="btn" type="submit" :disabled="state.busy">{{ state.submitted ? 'Update submission' : 'Submit update' }}</button>
          <button v-if="!state.submitted" class="btn secondary" type="button" :disabled="state.busy" @click="save(false)">Save and continue later</button>
        </div>
        <p v-if="state.msg" class="error" role="alert">{{ state.msg }}</p>
        <p v-if="state.ok" class="ok" role="status">{{ state.ok }}</p>
      </form>
    </template>
  </div>
</template>

<style scoped>
.wrap { max-width: 760px; margin: 0 auto; }
h1 { margin: 6px 0 12px; }
.lead { color: var(--c-ink-soft); margin: 0 0 24px; max-width: 62ch; }
.center { text-align: center; } .center p { color: var(--c-muted); }
.done { margin: 0 0 24px; border-color: #b7cddf; background: #f2f6fa; } .done h2 { margin-bottom: 6px; } .done p { margin: 0; }
.drop { border: 1px dashed var(--c-rule-strong); background: var(--c-paper); padding: 22px; text-align: center; cursor: pointer; margin-bottom: 12px; }
.drop:hover, .drop.over { background: #eef4f9; border-color: var(--c-blue); }
.drop:focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
.drop p { margin: 0; } .drop b { color: var(--c-navy); }
.hint { font-size: 12px; color: var(--c-muted); margin-top: 4px; }
.ai { background: #eef4f9; border: 1px solid #cfe0ee; padding: 10px 14px; font-size: 13px; margin: 0 0 16px; }
.form { display: flex; flex-direction: column; gap: 14px; } .form h2 { margin: 6px 0 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
label { display: flex; flex-direction: column; gap: 6px; }
input, textarea { font: inherit; font-size: 15px; color: var(--c-ink); padding: 10px 12px; border: 1px solid var(--c-rule-strong); background: #fff; }
textarea { resize: vertical; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.pre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; background: #eef4f9; border: 1px solid #cfe0ee; padding: 10px 14px; font-size: 13.5px; margin: 0 0 12px; } .btn.sm { padding: 6px 12px; font-size: 13px; }
.own { border: 1px solid var(--c-rule); } .ownh { width: 100%; display: flex; justify-content: space-between; align-items: center; background: #fbfaf7; border: 0; padding: 12px 14px; font: inherit; cursor: pointer; text-align: left; } .ownh em { font-style: normal; font-size: 12.5px; color: var(--c-muted); margin-left: 6px; } .chev { color: var(--c-muted); font-size: 18px; }
.ownb { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 14px; } .ownb .hint { margin: 0; } .seg2 { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; } .seg2 .label { width: 100%; } .seg2 label { flex-direction: row; align-items: center; gap: 6px; font-size: 14px; } .seg2 input { width: auto; }
select { font: inherit; font-size: 15px; color: var(--c-ink); padding: 10px 12px; border: 1px solid var(--c-rule-strong); background: #fff; } .fd { max-width: 360px; }
.error { color: var(--c-danger); margin: 0; } .ok { color: var(--c-ok); margin: 0; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.tpl { margin: 8px 0 0; font-size: 13px; color: var(--c-ink-soft); } .tpl a { color: var(--c-blue-deep); }
</style>
