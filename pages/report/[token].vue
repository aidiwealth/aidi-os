<script setup lang="ts">
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
interface Metric { key: string; label: string; unit: string; hint: string }
interface Data { company: string; founderName: string; period: string; periodLabel: string; status: string; submittedAt: string | null; expiresAt: string; metrics: Metric[]; values: Record<string, number | null>; update: Record<string, string> }
const { data, error } = await useFetch<Data>('/api/public/report/' + token)
useHead({ title: () => (data.value ? data.value.company + ' · ' + data.value.periodLabel + ' update' : 'Monthly update') + ' — Aidi Ventures', meta: [{ name: 'robots', content: 'noindex' }] })
const vals = reactive<Record<string, string>>({})
const upd = reactive({ highlights: '', challenges: '', asks: '' })
const state = reactive({ busy: false, msg: '', ok: '', aiNote: '', submitted: false })
watchEffect(() => {
  if (!data.value) return
  for (const m of data.value.metrics) if (!(m.key in vals)) vals[m.key] = data.value.values[m.key] == null ? '' : String(data.value.values[m.key])
  upd.highlights ||= data.value.update.highlights ?? ''; upd.challenges ||= data.value.update.challenges ?? ''; upd.asks ||= data.value.update.asks ?? ''
  state.submitted = data.value.status === 'submitted'
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
  state.busy = true
  try {
    await $fetch('/api/public/report/' + token + '/save', { method: 'POST', body: { values, update: { ...upd }, submit } })
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
    const r = await $fetch<{ values: Record<string, number | null>; notes: string }>('/api/public/report/' + token + '/upload', { method: 'POST', body: fd })
    let found = 0
    for (const [k, v] of Object.entries(r.values)) if (v !== null && v !== undefined) { vals[k] = String(v); found++ }
    state.aiNote = found ? 'We filled in ' + found + ' figure' + (found === 1 ? '' : 's') + ' from your file. Please check them before submitting.' + (r.notes ? ' Note: ' + r.notes : '')
      : 'We could not find these figures in your file. Please type them in.'
  } catch (e) { state.msg = errText(e) } finally { state.busy = false; if (fileEl.value) fileEl.value.value = '' }
}
</script>

<template>
  <div class="wrap">
    <div v-if="error" class="card center">
      <h1>{{ error.statusCode === 410 ? 'This link has expired' : 'This link is not valid' }}</h1>
      <p>{{ error.statusCode === 410 ? 'Ask the Aidi Ventures team to send you a new one.' : 'Check you opened the full link from the email, or ask the Aidi Ventures team for a new one.' }}</p>
    </div>

    <template v-else-if="data">
      <p class="label">Monthly update · {{ data.periodLabel }}</p>
      <h1>{{ data.company }}</h1>

      <div v-if="state.submitted" class="card done" role="status">
        <h2>Thank you, {{ data.founderName.split(' ')[0] }}.</h2>
        <p>Your {{ data.periodLabel }} update has been received by the Aidi Ventures team. You can still change it below until the link expires on {{ new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) }}.</p>
      </div>
      <p v-else class="lead">Hi {{ data.founderName.split(' ')[0] }}, this takes about five minutes. Type your figures, or upload your spreadsheet and we'll fill them in for you. You can save and come back to finish with the same link.</p>

      <div class="drop" :class="{ over }" role="button" tabindex="0" aria-label="Upload an Excel or CSV file"
        @click="fileEl?.click()" @keydown.enter.prevent="fileEl?.click()" @keydown.space.prevent="fileEl?.click()"
        @dragenter.prevent="over = true" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="over = false; upload($event.dataTransfer?.files?.[0])">
        <input ref="fileEl" type="file" class="sr-only" tabindex="-1" accept=".xlsx,.csv" @change="upload(($event.target as HTMLInputElement).files?.[0])">
        <p><b>{{ state.busy ? 'Reading your file…' : 'Upload your Excel or CSV' }}</b> — drop it here or click to choose</p>
        <p class="hint">We read the {{ data.periodLabel }} figures from it. You check them before anything is sent.</p>
      </div>
      <p v-if="state.aiNote" class="ai" role="status">{{ state.aiNote }}</p>

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
.done { margin: 0 0 24px; border-color: #b7dfc9; background: #f2faf5; } .done h2 { margin-bottom: 6px; } .done p { margin: 0; }
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
.error { color: var(--c-danger); margin: 0; } .ok { color: var(--c-ok); margin: 0; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
