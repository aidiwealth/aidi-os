<script setup lang="ts">
const id = useRoute().params.id as string
interface Metric { key: string; label: string; unit: string }
interface Raw { founder: number | null; override: number | null; note: string | null; by: string | null }
interface Month { period: string; values: Record<string, number | null>; raw: Record<string, Raw> }
interface Data {
  company: { id: string; name: string; founder_name: string; founder_email: string; deal_id: string | null; holder: string | null; relationship: string }
  metrics: Metric[]; months: Month[]
  analysis: { headline: string[]; flags: { level: string; text: string }[]; runwayMonths: number | null }
  updates: { period: string; highlights: string | null; challenges: string | null; asks: string | null }[]
  requests: { period: string; status: string; sent_at: string; opened_at: string | null; submitted_at: string | null; expires_at: string; file_document_id: string | null }[]
}
const { data, error, refresh } = await useFetch<Data>('/api/portfolio/' + id)
useHead({ title: () => (data.value?.company.name ?? 'Company') })
const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
const req = reactive({ period: lastMonth, link: '', msg: '', busy: false })
async function sendRequest() {
  req.busy = true; req.msg = ''; req.link = ''
  try {
    const r = await $fetch<{ link: string; emailed: boolean }>('/api/portfolio/' + id + '/request', { method: 'POST', body: { period: req.period } })
    req.link = r.link; req.msg = r.emailed ? 'Sent to ' + data.value?.company.founder_email + '.' : 'Link created, but the email did not send. Copy the link below and send it yourself.'
    await refresh()
  } catch (e) { req.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { req.busy = false }
}
const series = (key: string) => (data.value?.months ?? []).map((m) => ({ period: m.period, value: m.values[key] ?? null }))
const editing = ref<{ period: string; metric: string; value: string; note: string } | null>(null)
const oMsg = ref('')
async function saveOverride(clear = false) {
  if (!editing.value) return
  oMsg.value = ''
  const v = editing.value.value.replace(/[$,\s%]/g, '')
  try {
    await $fetch('/api/portfolio/' + id + '/override', { method: 'POST', body: { period: editing.value.period.slice(0, 7), metric: editing.value.metric, value: clear || v === '' ? null : Number(v), note: editing.value.note } })
    editing.value = null; await refresh()
  } catch (e) { oMsg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
const fmt = (n: number | null | undefined, unit: string) => n == null ? '—' : unit === 'usd' ? '$' + Math.round(n).toLocaleString('en-US') : unit === 'pct' ? n.toFixed(0) + '%' : Math.round(n).toLocaleString('en-US')
const mon = (p: string) => new Date(p.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const STATUS: Record<string, string> = { sent: 'Sent', in_progress: 'Started', submitted: 'Submitted' }
const rows = computed(() => [...(data.value?.months ?? [])].reverse())
async function openDoc(docId: string) { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/portfolio" class="back">← Portfolio</NuxtLink>
    <p class="label">{{ data.company.holder ?? 'No holder' }} · {{ data.company.relationship }} · {{ data.company.founder_name }} · {{ data.company.founder_email }}<template v-if="data.company.deal_id"> · <NuxtLink :to="'/pipeline/' + data.company.deal_id">deal record</NuxtLink></template></p>
    <div class="dh"><h1>{{ data.company.name }}</h1><DeleteButton type="company" :id="id" :name="data.company.name" to="/portfolio" /></div>

    <div class="top">
      <div class="card insight">
        <h2>What the numbers say</h2>
        <ul class="flags"><li v-for="(f, i) in data.analysis.flags" :key="i" :data-level="f.level">{{ f.text }}</li></ul>
        <p v-for="(h, i) in data.analysis.headline" :key="i" class="hl">{{ h }}</p>
        <p v-if="!data.analysis.headline.length" class="muted">Send the founder a link to get their first figures.</p>
      </div>
      <form class="card send" @submit.prevent="sendRequest">
        <h2>Ask for an update</h2>
        <label class="label">Month<input v-model="req.period" type="month" required></label>
        <button class="btn" type="submit" :disabled="req.busy">{{ req.busy ? 'Sending…' : 'Email the link to ' + data.company.founder_name.split(' ')[0] }}</button>
        <p class="muted small">No login for the founder. The link works for 30 days; they can save and come back, or upload a spreadsheet.</p>
        <p v-if="req.msg" class="small">{{ req.msg }}</p>
        <input v-if="req.link" :value="req.link" readonly class="linkbox" aria-label="Report link" @focus="($event.target as HTMLInputElement).select()">
      </form>
    </div>

    <div class="charts"><MetricChart v-for="m in data.metrics" :key="m.key" :label="m.label" :unit="m.unit" :points="series(m.key)" /></div>

    <div class="card">
      <h2>Reported figures</h2>
      <p class="muted small">Click a figure to correct it. The founder's number is kept; corrections show in blue with who made them and why.</p>
      <div class="scroll">
        <table class="table">
          <thead><tr><th>Month</th><th v-for="m in data.metrics" :key="m.key">{{ m.label }}</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.period">
              <td>{{ mon(row.period) }}</td>
              <td v-for="m in data.metrics" :key="m.key">
                <button type="button" class="cell" :class="{ over: row.raw[m.key]?.override != null }"
                  :title="row.raw[m.key]?.override != null ? 'Corrected by ' + row.raw[m.key]?.by + ': ' + row.raw[m.key]?.note + ' (founder reported ' + fmt(row.raw[m.key]?.founder, m.unit) + ')' : 'Click to correct'"
                  @click="editing = { period: row.period, metric: m.key, value: row.raw[m.key]?.override != null ? String(row.raw[m.key]?.override) : '', note: row.raw[m.key]?.note ?? '' }">
                  {{ fmt(row.values[m.key], m.unit) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form v-if="editing" class="edit" @submit.prevent="saveOverride()">
        <b>Correct {{ data.metrics.find((m) => m.key === editing!.metric)?.label }} for {{ mon(editing.period) }}</b>
        <input v-model="editing.value" inputmode="decimal" placeholder="Corrected value" aria-label="Corrected value">
        <input v-model="editing.note" maxlength="500" placeholder="Why (required)" aria-label="Reason">
        <button class="btn sm" type="submit">Save</button>
        <button class="btn secondary sm" type="button" @click="saveOverride(true)">Remove correction</button>
        <button class="link" type="button" @click="editing = null">Cancel</button>
        <span v-if="oMsg" class="error">{{ oMsg }}</span>
      </form>
    </div>

    <div class="two">
      <div class="card">
        <h2>Founder notes</h2>
        <div v-for="u in data.updates" :key="u.period" class="upd">
          <p class="label">{{ mon(u.period) }}</p>
          <p v-if="u.highlights"><b>Highlights.</b> {{ u.highlights }}</p>
          <p v-if="u.challenges"><b>Challenges.</b> {{ u.challenges }}</p>
          <p v-if="u.asks"><b>Asks.</b> {{ u.asks }}</p>
        </div>
        <EmptyState v-if="!data.updates.length" compact icon="portfolio" title="None yet" />
      </div>
      <div class="card">
        <h2>Requests</h2>
        <ul class="reqs">
          <li v-for="(r, i) in data.requests" :key="i">
            <b>{{ mon(r.period) }}</b> · {{ STATUS[r.status] }}<template v-if="r.opened_at && r.status === 'sent'"> · opened</template>
            <span class="muted">sent {{ new Date(r.sent_at).toLocaleDateString('en-GB') }}<template v-if="new Date(r.expires_at) < new Date() && r.status !== 'submitted'"> · expired</template></span>
            <button v-if="r.file_document_id" type="button" class="link" @click="openDoc(r.file_document_id)">Spreadsheet</button>
          </li>
        </ul>
        <EmptyState v-if="!data.requests.length" compact icon="portfolio" title="No links sent yet" />
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Company not found.' : 'Could not load this company.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 20px; } h2 { margin-bottom: 12px; }
.top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; margin-bottom: 20px; }
.flags { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 6px; }
.flags li { padding: 8px 12px; font-size: 13.5px; border-left: 3px solid var(--c-rule-strong); background: var(--c-paper); }
.flags li[data-level="red"] { border-color: var(--c-danger); background: #fdf1f0; } .flags li[data-level="amber"] { border-color: var(--c-warn); background: #fdf6ec; } .flags li[data-level="green"] { border-color: var(--c-ok); background: #f2faf5; }
.hl { margin: 0 0 6px; }
.send { display: flex; flex-direction: column; gap: 10px; } .send label { display: flex; flex-direction: column; gap: 6px; }
input { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.linkbox { font-size: 12px; }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
.scroll { overflow-x: auto; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
td { padding: 6px 12px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.cell { background: none; border: 1px solid transparent; font: inherit; padding: 4px 6px; cursor: pointer; color: var(--c-ink-soft); }
.cell:hover { border-color: var(--c-rule-strong); } .cell.over { color: var(--c-blue); font-weight: 600; }
.edit { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; padding: 12px; background: var(--c-paper); border: 1px solid var(--c-rule); border-radius: var(--radius); }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
.upd { padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .upd p { margin: 4px 0; }
.reqs { list-style: none; padding: 0; margin: 0; } .reqs li { padding: 8px 0; border-bottom: 1px solid var(--c-rule); display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .small { font-size: 12.5px; margin: 0; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .top, .two { grid-template-columns: 1fr; } .charts { grid-template-columns: 1fr 1fr; } }
</style>
