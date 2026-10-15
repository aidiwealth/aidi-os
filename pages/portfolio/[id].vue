<script setup lang="ts">
// One portfolio company: headline figures, then Overview, Figures, Notes, Reports and Requests. Figures stay at the period
// they were reported for: quarterly reporters are read quarter by quarter, never spread into months.
import { periods, granularity, periodName, quarterLabel, lastClosedQuarter, type Granularity } from '~/shared/portfolio-periods'
import { compactNum } from '~/shared/compact'
const id = useRoute().params.id as string
const route = useRoute(), router = useRouter()
interface Metric { key: string; label: string; unit: string }
interface Raw { founder: number | null; override: number | null; note: string | null; by: string | null }
interface Row { period: string; span: number; values: Record<string, number | null>; raw: Record<string, Raw> }
interface Data {
  company: { id: string; name: string; founder_name: string; founder_email: string; deal_id: string | null; holder: string | null; relationship: string }
  metrics: Metric[]; months: Row[]
  analysis: { headline: string[]; flags: { level: string; text: string }[]; runwayMonths: number | null; latestLabel: string | null; previousLabel: string | null; granularity: Granularity; revenueGrowthPct: number | null; burnGrowthPct: number | null }
  updates: { period: string; highlights: string | null; challenges: string | null; asks: string | null }[]
  schedule: { cadence: 'off' | 'monthly' | 'quarterly'; day: number; next: { date: string; label: string; soon: boolean } | null }
  requests: { period: string; months: number; status: string; sent_at: string; opened_at: string | null; submitted_at: string | null; expires_at: string; file_document_id: string | null }[]
}
const { data, error, refresh } = await useFetch<Data>('/api/portfolio/' + id)
const { data: meP } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canUpload = computed(() => (meP.value?.roles ?? []).some((r) => ['admin', 'gp'].includes(r)))
useHead({ title: () => (data.value?.company.name ?? 'Company') })

const TABS = [['overview', 'Overview'], ['figures', 'Figures'], ['notes', 'Notes'], ['reports', 'Reports'], ['requests', 'Requests']] as const
const tab = computed(() => (TABS.some((t) => t[0] === route.query.t) ? String(route.query.t) : 'overview'))
const go = (t: string) => router.replace({ query: { ...route.query, t } })

// ---- periods ----
const rows = computed<Row[]>(() => data.value?.months ?? [])
const g = computed<Granularity>(() => granularity(rows.value))
const unitWord = computed(() => (g.value === 'quarter' ? 'quarter' : 'month'))
const list = computed(() => periods(rows.value, g.value))
const cur = computed(() => list.value[list.value.length - 1] ?? null)
const usd = (n: number | null | undefined) => n == null ? '—' : (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US')
const short = (n: number | null | undefined) => n == null ? '—' : (n < 0 ? '-$' : '$') + (compactNum(Math.abs(n)) ?? Math.round(Math.abs(n)).toLocaleString('en-US'))
const pctTxt = (p: number | null | undefined, vs: string | null | undefined) => (p == null || !vs ? '' : (p > 0 ? '+' : '') + p.toFixed(0) + '% on ' + vs)
const nameOf = (p: string) => (g.value === 'quarter' && Number(p.slice(5, 7)) % 3 === 0 ? quarterLabel(p) : periodName(p, 1))
const reportedBy = computed(() => (g.value === 'quarter' ? 'Reports quarterly' : 'Reports monthly'))
const lastBalance = (k: string) => { for (let i = list.value.length - 1; i >= 0; i--) { const v = list.value[i]!.values[k]; if (v != null) return { v, label: list.value[i]!.label } } return null }
const cashNow = computed(() => lastBalance('cash'))
const burnNow = computed(() => lastBalance('net_burn'))

// ---- overview charts: revenue, cash and burn by period; others only when reported ----
const pts = (k: string) => list.value.map((p) => ({ label: p.label.replace(/ 20(\d\d)$/, " '$1"), value: p.values[k] ?? null, partial: k === 'revenue' && p.monthsIn < (g.value === 'quarter' ? 3 : 1) }))
const extra = computed(() => (data.value?.metrics ?? []).filter((m) => ['gross_margin', 'customers', 'headcount'].includes(m.key) && list.value.some((p) => p.values[m.key] != null)))
const SHORT: Record<string, string> = { revenue: 'Revenue', gross_margin: 'Gross margin', net_burn: 'Net burn / month', cash: 'Cash', customers: 'Customers', headcount: 'Headcount' }

// ---- figures table ----
const view = ref<'period' | 'reported'>('period')
const tableRows = computed(() => (view.value === 'period' ? list.value : periods(rows.value, 'month')).slice().reverse())
const cols = computed(() => (data.value?.metrics ?? []).filter((m) => tableRows.value.some((r) => r.values[m.key] != null)))
const hidden = computed(() => (data.value?.metrics ?? []).filter((m) => !cols.value.includes(m)).map((m) => SHORT[m.key]!.toLowerCase()))
const stored = (period: string) => rows.value.find((r) => r.period === period)
// A cell can be corrected when it is a stored figure (a reported month or quarter), not a sum of months.
const editable = (r: { period: string; span: number; monthsIn: number }) => { const s = stored(r.period); return !!s && (view.value === 'reported' || s.span === r.span) }
const fmt = (n: number | null | undefined, unit: string) => n == null ? '—' : unit === 'usd' ? usd(n) : unit === 'pct' ? n.toFixed(0) + '%' : Math.round(n).toLocaleString('en-US')
const colHead = (k: string) => k === 'revenue' ? (view.value === 'period' && g.value === 'quarter' ? 'Revenue (quarter)' : 'Revenue (period)') : k === 'net_burn' ? 'Net burn / month' : k === 'cash' ? 'Cash (end)' : SHORT[k]!
const editing = ref<{ period: string; metric: string; value: string; note: string; months: 1 | 3; label: string } | null>(null)
const oMsg = ref('')
function edit(r: { period: string; span: number; label: string }, m: Metric) {
  const raw = stored(r.period)?.raw[m.key]
  editing.value = { period: r.period, metric: m.key, value: raw?.override != null ? String(raw.override) : '', note: raw?.note ?? '', months: r.span === 3 ? 3 : 1, label: r.label }
}
async function saveOverride(clear = false) {
  if (!editing.value) return
  oMsg.value = ''
  const v = editing.value.value.replace(/[$,\s%]/g, '')
  try {
    await $fetch('/api/portfolio/' + id + '/override', { method: 'POST', body: { period: editing.value.period.slice(0, 7), metric: editing.value.metric, value: clear || v === '' ? null : Number(v), note: editing.value.note, months: editing.value.months } })
    editing.value = null; await refresh()
  } catch (e) { oMsg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}

const RANK: Record<string, number> = { red: 0, amber: 1, green: 2 }
const flags = computed(() => [...(data.value?.analysis.flags ?? [])].sort((a, b) => (RANK[a.level] ?? 3) - (RANK[b.level] ?? 3)))

// ---- notes ----
const latestNote = computed(() => data.value?.updates[0] ?? null)

// ---- requests ----
const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
const quarters = (() => { const out: string[] = []; let q = lastClosedQuarter(); for (let i = 0; i < 6; i++) { out.push(q.slice(0, 7)); const d = new Date(q + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 3); q = d.toISOString().slice(0, 10) } return out })()
const req = reactive({ kind: 'month' as 'month' | 'quarter', month: lastMonth, quarter: quarters[0]!, link: '', msg: '', busy: false })
watch(g, (v) => { req.kind = v === 'quarter' ? 'quarter' : 'month' }, { immediate: true })
async function sendRequest() {
  req.busy = true; req.msg = ''; req.link = ''
  try {
    const r = await $fetch<{ link: string; emailed: boolean }>('/api/portfolio/' + id + '/request', { method: 'POST', body: { period: req.kind === 'quarter' ? req.quarter : req.month, months: req.kind === 'quarter' ? 3 : 1 } })
    req.link = r.link; req.msg = r.emailed ? 'Sent to ' + data.value?.company.founder_email + '.' : 'Link created, but the email did not send. Copy the link below and send it yourself.'
    await refresh()
  } catch (e) { req.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send.' } finally { req.busy = false }
}
const sch = reactive({ cadence: 'off' as 'off' | 'monthly' | 'quarterly', day: 5, busy: false, msg: '' })
watchEffect(() => { if (data.value?.schedule) { sch.cadence = data.value.schedule.cadence; sch.day = data.value.schedule.day } })
async function saveSchedule() {
  sch.busy = true; sch.msg = ''
  try { await $fetch('/api/portfolio/' + id + '/schedule', { method: 'POST', body: { cadence: sch.cadence, day: Number(sch.day) } }); await refresh(); sch.msg = 'Saved.' }
  catch (e) { sch.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } finally { sch.busy = false }
}
const fmtDay = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const STATUS: Record<string, string> = { sent: 'Sent', in_progress: 'Started', submitted: 'Submitted' }
const reqStatus = (r: Data['requests'][number]) => r.status !== 'submitted' && new Date(r.expires_at) < new Date() ? 'Expired' : r.status === 'sent' && r.opened_at ? 'Opened' : STATUS[r.status] ?? r.status
const first = computed(() => data.value?.company.founder_name.split(' ')[0] ?? 'the founder')
async function openDoc(docId: string) { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url }
const REL: Record<string, string> = { investment: 'Investment', subsidiary: 'Subsidiary', affiliate: 'Affiliate' }
</script>

<template>
  <section v-if="data" class="pco">
    <NuxtLink to="/portfolio" class="back">← Portfolio</NuxtLink>
    <div class="hd">
      <div class="ti">
        <h1>{{ data.company.name }}</h1>
        <p class="meta">
          <span>{{ REL[data.company.relationship] ?? data.company.relationship }}<template v-if="data.company.holder"> · {{ data.company.holder }}</template></span>
          <span>{{ data.company.founder_name }} · <a :href="'mailto:' + data.company.founder_email">{{ data.company.founder_email }}</a></span>
          <NuxtLink v-if="data.company.deal_id" :to="'/pipeline/' + data.company.deal_id">Deal record</NuxtLink>
        </p>
      </div>
      <div class="acts">
        <button v-if="canUpload" type="button" class="btn secondary" @click="go('reports')">Upload reports</button>
        <button type="button" class="btn" @click="go('requests')">Ask for an update</button>
        <DeleteButton type="company" :id="id" :name="data.company.name" to="/portfolio" />
      </div>
    </div>

    <div class="fx-stats five">
      <StatTile icon="chart" tone="b" :label="'Revenue · ' + (cur?.label ?? '—')" :value="cur?.values.revenue == null ? '—' : usd(cur.values.revenue)" :note="pctTxt(data.analysis.revenueGrowthPct, data.analysis.previousLabel) || (g === 'quarter' ? 'Quarter total' : 'For the month')" />
      <StatTile icon="billing" tone="a" label="Net burn / month" :value="burnNow ? usd(burnNow.v) : '—'" :note="pctTxt(data.analysis.burnGrowthPct, data.analysis.previousLabel) || (burnNow ? burnNow.label : 'Not reported')" />
      <StatTile icon="money" tone="n" label="Cash" :value="cashNow ? usd(cashNow.v) : '—'" :note="cashNow ? 'End of ' + cashNow.label : 'Not reported'" />
      <StatTile icon="clock" tone="c" label="Runway" full :value="data.analysis.runwayMonths == null ? '—' : data.analysis.runwayMonths.toFixed(1) + ' mo'" :red="data.analysis.runwayMonths != null && data.analysis.runwayMonths < 6" :note="data.analysis.runwayMonths == null ? 'Needs cash and burn' : 'At current burn'" />
      <StatTile icon="doc" tone="n" label="Latest figures" full :value="cur?.label ?? '—'" :note="list.length ? reportedBy : 'None yet'" />
    </div>

    <nav class="tabs" aria-label="Company"><button v-for="t in TABS" :key="t[0]" type="button" :class="{ on: tab === t[0] }" @click="go(t[0])">{{ t[1] }}<span v-if="t[0] === 'notes' && data.updates.length" class="ct">{{ data.updates.length }}</span><span v-if="t[0] === 'requests' && data.requests.length" class="ct">{{ data.requests.length }}</span></button></nav>

    <!-- Overview -->
    <div v-if="tab === 'overview'" class="ov">
      <div class="two">
        <PortfolioBars :title="g === 'quarter' ? 'Revenue by quarter' : 'Revenue by month'" :sub="g === 'quarter' ? 'Quarter totals, US dollars' : 'US dollars'" unit="usd" :points="pts('revenue')" />
        <div class="card ins">
          <h3>What stands out</h3>
          <ul v-if="flags.length" class="flags"><li v-for="(f, i) in flags" :key="i"><i class="dot" :data-l="f.level" />{{ f.text }}</li></ul>
          <ul v-if="data.analysis.headline.length" class="hl"><li v-for="(h, i) in data.analysis.headline" :key="i">{{ h }}</li></ul>
          <p v-if="!data.analysis.headline.length" class="mut">No figures yet. Ask {{ first }} for an update, or upload past reports.</p>
        </div>
      </div>
      <div class="grid3">
        <PortfolioBars title="Cash" :sub="'End of each ' + unitWord" unit="usd" :points="pts('cash')" />
        <PortfolioBars title="Net burn per month" :sub="g === 'quarter' ? 'Average in each quarter' : 'Each month'" unit="usd" :points="pts('net_burn')" />
        <PortfolioBars v-for="m in extra" :key="m.key" :title="SHORT[m.key]!" :unit="m.unit" :points="pts(m.key)" />
      </div>
      <div v-if="latestNote" class="card nt">
        <div class="fx-sh"><h3>Latest notes · {{ nameOf(latestNote.period) }}</h3><button type="button" class="lk" @click="go('notes')">All notes</button></div>
        <div class="n3 clip">
          <div v-if="latestNote.highlights"><em>Highlights</em><p>{{ latestNote.highlights }}</p></div>
          <div v-if="latestNote.challenges"><em>Challenges</em><p>{{ latestNote.challenges }}</p></div>
          <div v-if="latestNote.asks"><em>Asks</em><p>{{ latestNote.asks }}</p></div>
        </div>
      </div>
    </div>

    <!-- Figures -->
    <div v-else-if="tab === 'figures'" class="card fg">
      <div class="fh">
        <div><h3>Reported figures</h3><p class="mut">US dollars. Click a figure to correct it: the founder's number is kept and corrections show in blue, with who made them and why.</p></div>
        <div class="seg"><button type="button" :class="{ on: view === 'period' }" @click="view = 'period'">{{ g === 'quarter' ? 'By quarter' : 'By month' }}</button><button type="button" :class="{ on: view === 'reported' }" @click="view = 'reported'">As reported</button></div>
      </div>
      <div v-if="tableRows.length" class="scroll">
        <table class="ft" data-nosearch>
          <thead><tr><th>Period</th><th v-for="m in cols" :key="m.key" class="r">{{ colHead(m.key) }}</th></tr></thead>
          <tbody>
            <tr v-for="r in tableRows" :key="r.period + r.span">
              <td class="pl"><b>{{ r.label }}</b><span v-if="view === 'period' && g === 'quarter' && r.monthsIn < 3" class="sub">{{ r.monthsIn }} of 3 months</span><span v-else-if="view === 'reported' && r.span > 1" class="sub">Reported as a quarter</span></td>
              <td v-for="m in cols" :key="m.key" class="r">
                <button v-if="editable(r)" type="button" class="cell" :class="{ over: stored(r.period)?.raw[m.key]?.override != null }"
                  :title="stored(r.period)?.raw[m.key]?.override != null ? 'Corrected by ' + stored(r.period)?.raw[m.key]?.by + ': ' + stored(r.period)?.raw[m.key]?.note + ' (founder reported ' + fmt(stored(r.period)?.raw[m.key]?.founder, m.unit) + ')' : 'Click to correct'"
                  @click="edit(r, m)">{{ fmt(r.values[m.key], m.unit) }}</button>
                <span v-else class="cell ro" title="Made up of monthly figures. Switch to As reported to correct a month.">{{ fmt(r.values[m.key], m.unit) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else compact icon="portfolio" title="No figures yet" :text="'Ask ' + first + ' for an update, or upload past reports.'" />
      <p v-if="tableRows.length && hidden.length" class="mut sm">Not reported yet: {{ hidden.join(', ') }}.</p>
      <form v-if="editing" class="edit" @submit.prevent="saveOverride()">
        <b>Correct {{ SHORT[editing.metric] }} for {{ editing.label }}</b>
        <input v-model="editing.value" inputmode="decimal" placeholder="Corrected value" aria-label="Corrected value">
        <input v-model="editing.note" maxlength="500" placeholder="Why (required)" aria-label="Reason">
        <button class="btn sm" type="submit">Save</button>
        <button class="btn secondary sm" type="button" @click="saveOverride(true)">Remove correction</button>
        <button class="lk" type="button" @click="editing = null">Cancel</button>
        <span v-if="oMsg" class="error">{{ oMsg }}</span>
      </form>
    </div>

    <!-- Notes -->
    <div v-else-if="tab === 'notes'" class="nl">
      <div v-for="u in data.updates" :key="u.period" class="card nt">
        <h3>{{ nameOf(u.period) }}</h3>
        <div class="n3">
          <div><em>Highlights</em><p>{{ u.highlights || '—' }}</p></div>
          <div><em>Challenges</em><p>{{ u.challenges || '—' }}</p></div>
          <div><em>Asks</em><p>{{ u.asks || '—' }}</p></div>
        </div>
      </div>
      <EmptyState v-if="!data.updates.length" card icon="portfolio" title="No notes yet" :text="'Notes come in with each update from ' + first + ' and from reports you import.'" />
    </div>

    <!-- Reports -->
    <div v-else-if="tab === 'reports'" class="rp">
      <PortfolioReports :company-id="id" :company-name="data.company.name" :can-upload="canUpload" @imported="refresh" />
      <PortfolioFinvry :company-id="id" @imported="refresh" />
    </div>

    <!-- Requests -->
    <div v-else class="rq">
      <div class="side">
        <form class="card fm" @submit.prevent="sendRequest">
          <h3>Ask for an update</h3>
          <div class="seg"><button type="button" :class="{ on: req.kind === 'quarter' }" @click="req.kind = 'quarter'">Quarter</button><button type="button" :class="{ on: req.kind === 'month' }" @click="req.kind = 'month'">Month</button></div>
          <label v-if="req.kind === 'quarter'" class="lb">Quarter<select v-model="req.quarter"><option v-for="q in quarters" :key="q" :value="q">{{ quarterLabel(q + '-01') }}</option></select></label>
          <label v-else class="lb">Month<input v-model="req.month" type="month" required></label>
          <button class="btn" type="submit" :disabled="req.busy">{{ req.busy ? 'Sending…' : 'Email the link to ' + first }}</button>
          <p class="mut sm">No login for the founder. The link works for 30 days; they can save and come back, or upload a spreadsheet.{{ req.kind === 'quarter' ? ' They report the quarter as a whole.' : '' }}</p>
          <p v-if="req.msg" class="sm">{{ req.msg }}</p>
          <input v-if="req.link" :value="req.link" readonly class="linkbox" aria-label="Report link" @focus="($event.target as HTMLInputElement).select()">
        </form>
        <div class="card fm">
          <h3>Automatic requests</h3>
          <div class="seg"><button v-for="o in (['off', 'monthly', 'quarterly'] as const)" :key="o" type="button" :class="{ on: sch.cadence === o }" @click="sch.cadence = o">{{ o === 'off' ? 'Off' : o === 'monthly' ? 'Monthly' : 'Quarterly' }}</button></div>
          <label v-if="sch.cadence !== 'off'" class="lb">Send on day<select v-model.number="sch.day"><option v-for="n in 28" :key="n" :value="n">{{ n }}</option></select></label>
          <p class="mut sm">{{ sch.cadence === 'off' ? 'No automatic requests.' : sch.cadence === 'monthly' ? 'Each month, ' + first + ' gets a link for the month before.' : 'In January, April, July and October, ' + first + ' gets a link for the quarter just ended.' }}</p>
          <p v-if="data.schedule.next" class="sm">Next: <b>{{ data.schedule.next.label }}</b>, {{ data.schedule.next.soon ? 'on the next daily run (07:00 UTC)' : 'sent ' + fmtDay(data.schedule.next.date) }}</p>
          <button class="btn secondary" type="button" :disabled="sch.busy || (sch.cadence === data.schedule.cadence && sch.day === data.schedule.day)" @click="saveSchedule">{{ sch.busy ? 'Saving…' : 'Save schedule' }}</button>
          <p v-if="sch.msg" class="sm">{{ sch.msg }}</p>
        </div>
      </div>
      <div class="card rl">
        <h3>Links sent</h3>
        <table v-if="data.requests.length" class="ft" data-nosearch>
          <thead><tr><th>Period</th><th>Status</th><th>Sent</th><th>Link expires</th><th /></tr></thead>
          <tbody><tr v-for="(r, i) in data.requests" :key="i">
            <td><b>{{ r.months === 3 ? quarterLabel(r.period) : periodName(r.period, 1) }}</b></td>
            <td><span class="st" :data-s="reqStatus(r)">{{ reqStatus(r) }}</span></td>
            <td class="mut">{{ fmtDay(r.sent_at) }}</td><td class="mut">{{ fmtDay(r.expires_at) }}</td>
            <td class="r"><button v-if="r.file_document_id" type="button" class="lk" @click="openDoc(r.file_document_id)">Spreadsheet</button></td>
          </tr></tbody>
        </table>
        <EmptyState v-else compact icon="portfolio" title="No links sent yet" />
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Company not found.' : 'Could not load this company.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 13.5px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .hd h1 { margin: 0 0 6px; }
.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 13.5px; color: var(--c-muted); } .meta a { color: var(--c-blue-deep); text-decoration: none; }
.acts { display: flex; gap: 8px; align-items: center; }
.five { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; } .five :deep(.fx-sx b) { font-size: 24px; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 18px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; font-size: 14.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ct { font-size: 11px; font-weight: 600; padding: 0 6px; background: var(--c-paper-2); color: var(--c-muted); }
h3 { margin: 0; font-size: 15px; }
.ov, .nl, .rp { display: flex; flex-direction: column; gap: 16px; }
.two { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; }
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.ins { display: flex; flex-direction: column; gap: 12px; }
.flags, .hl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.flags li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; color: var(--c-ink); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 6px; background: var(--c-blue-deep); } .dot[data-l="red"] { background: var(--c-danger); } .dot[data-l="amber"] { background: var(--c-warn); }
.hl li { padding: 6px 0; font-size: 13.5px; color: var(--c-ink-soft); } .flags + .hl { border-top: 1px solid var(--c-rule); padding-top: 6px; }
.nt { display: flex; flex-direction: column; gap: 12px; } .nt .fx-sh { margin: 0; }
.n3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; } .n3 em { display: block; font-style: normal; font-size: 12px; font-weight: 600; color: var(--c-muted); margin-bottom: 6px; }
.n3 p { margin: 0; white-space: pre-line; font-size: 13.5px; line-height: 1.6; color: var(--c-ink-soft); }
.clip p { display: -webkit-box; -webkit-line-clamp: 7; -webkit-box-orient: vertical; overflow: hidden; }
.fg { display: flex; flex-direction: column; gap: 14px; } .fh { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; } .fh h3 { margin-bottom: 4px; }
.seg { display: flex; width: fit-content; } .seg button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 0; } .seg .on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.scroll { overflow-x: auto; border: 1px solid var(--c-rule); }
.ft { width: 100%; border-collapse: collapse; font-size: 13.5px; } .ft th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 9px 14px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.ft td { padding: 8px 14px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; vertical-align: middle; } .ft tbody tr:last-child td { border-bottom: 0; } .ft .r { text-align: right; }
.pl b { font-weight: 600; color: var(--c-ink); } .sub { display: block; font-size: 11.5px; color: var(--c-muted); }
.cell { background: none; border: 1px solid transparent; font: inherit; padding: 3px 6px; cursor: pointer; color: var(--c-ink-soft); font-variant-numeric: tabular-nums; } .cell:hover { border-color: var(--c-rule-strong); } .cell.over { color: var(--c-blue); font-weight: 600; } .cell.ro { cursor: default; display: inline-block; }
.edit { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; background: var(--c-paper-2); border: 1px solid var(--c-rule); }
.edit input, .fm input, .fm select { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.rq { display: grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); gap: 16px; align-items: start; } .side { display: flex; flex-direction: column; gap: 16px; }
.fm { display: flex; flex-direction: column; gap: 12px; } .lb { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .linkbox { font-size: 12px !important; }
.rl { display: flex; flex-direction: column; gap: 12px; } .rl .ft { border: 1px solid var(--c-rule); }
.st { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); } .st[data-s="Submitted"] { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st[data-s="Expired"] { color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm { font-size: 12.5px; margin: 0; } .error { color: var(--c-danger); }
@media (max-width: 1100px) { .five { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
@media (max-width: 800px) { .two, .rq, .n3 { grid-template-columns: 1fr; } .five { grid-template-columns: 1fr 1fr !important; } }
</style>
