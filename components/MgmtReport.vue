<script setup lang="ts">
// The monthly management report: choose the month and what goes in (remembered for next month), add comments and
// priorities, then download it as a PDF or Excel file for the executive team.
const props = defineProps<{ open: boolean; subject: string; company: string }>()
const emit = defineEmits<{ close: []; done: [msg: string] }>()
interface Sec { key: string; title: string; desc: string; on: boolean; available: boolean }
const opts = ref<{ months: string[]; sections: Sec[]; about: string; chart: string; pies: boolean } | null>(null)
const about0 = ref('')
const f = reactive({ chart: 'area', pies: true, update: false, about: '', month: '', picked: [] as string[], format: 'pdf', comments: '', priorities: '', room: false, busy: false, msg: '', loading: false })
async function load() {
  f.loading = true; f.msg = ''
  try {
    const o = await $fetch<{ months: string[]; sections: Sec[]; about: string; chart: string; pies: boolean }>('/api/financials/mgmt-report', { query: { subject: props.subject } })
    opts.value = o; f.month = o.months[0] ?? ''; f.about = o.about; about0.value = o.about; f.chart = o.chart; f.pies = o.pies
    f.picked = o.sections.filter((s) => s.on && s.available).map((s) => s.key)
  } catch (e) { f.msg = err(e, 'Could not load the report options.') } finally { f.loading = false }
}
watch(() => props.open, (o) => { if (o) void load() }, { immediate: true })
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
const mon = (d: string) => new Date(d.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const all = computed(() => (opts.value?.sections ?? []).filter((s) => s.available))
function toggleAll(on: boolean) { f.picked = on ? all.value.map((s) => s.key) : [] }
async function draft() {
  f.msg = ''
  try { const a = await $fetch<{ headline: string; insights: { title: string; detail: string }[]; flags: { item: string; why: string }[] } | null>('/api/financials/analysis', { query: { subject: props.subject } }); if (a) { f.comments = [a.headline, ...a.insights.map((i) => i.title + '. ' + i.detail)].join('\n\n'); if (!f.priorities) f.priorities = a.flags.slice(0, 4).map((x) => '• ' + x.item).join('\n') } }
  catch (e) { f.msg = err(e, 'Could not draft comments.') }
}
async function make() {
  f.busy = true; f.msg = ''
  try {
    const res = await fetch('/api/financials/mgmt-report', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: props.subject, month: f.month, sections: MR_ORDER.value.filter((k) => f.picked.includes(k)), format: f.format, comments: f.comments, priorities: f.priorities, about: f.about !== about0.value ? f.about : undefined, room: f.room, update: f.update && canUpd.value, chart: f.chart, pies: f.pies }) })
    if (!res.ok) { const j = await res.json().catch(() => null) as { data?: { error?: { message?: string } } } | null; throw new Error(j?.data?.error?.message ?? 'Could not make the report.') }
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]) ?? 'management-report.' + f.format; a.click(); URL.revokeObjectURL(a.href)
    const upd = res.headers.get('x-update-id')
    emit('done', 'Management report for ' + mon(f.month) + ' downloaded' + (f.room ? ' and added to the data room (Financials folder)' : '') + '.' + (upd ? ' A draft investor update with these numbers is ready in Investor updates.' : ''))
  } catch (e) { f.msg = (e as Error).message } finally { f.busy = false }
}
const { data: mods } = useNuxtData<{ code: string; usable?: boolean }[]>('modules')
const canUpd = computed(() => !!mods.value?.find((m) => m.code === 'updates' && m.usable))
const MR_ORDER = computed(() => (opts.value?.sections ?? []).map((s) => s.key))
</script>

<template>
  <AppModal :open="open" title="Monthly management report" wide @close="emit('close')">
    <div class="mr">
      <p class="hint">A clear report for your executive team on how the month went. Pick what goes in; we remember your choice for next month.</p>
      <p v-if="f.loading" class="hint">Loading…</p>
      <template v-else-if="opts">
        <div class="g2"><label class="label">Month<select v-model="f.month"><option v-for="m in opts.months" :key="m" :value="m">{{ mon(m) }}</option><option v-if="!opts.months.length" value="" disabled>No monthly figures yet</option></select></label>
          <label class="label">Format<select v-model="f.format"><option value="pdf">PDF</option><option value="xlsx">Excel</option></select></label></div>
        <div class="g2"><label class="label">Charts over time<select v-model="f.chart"><option value="area">Area line (shaded)</option><option value="line">Line</option><option value="bar">Bars</option></select></label>
          <label class="label">Breakdowns (costs, assets, sectors, top customers)<select v-model="f.pies"><option :value="true">Pie charts</option><option :value="false">Bars</option></select></label></div>
        <div class="sh"><b>What goes in</b><span><button type="button" class="lk" @click="toggleAll(true)">All</button> · <button type="button" class="lk" @click="toggleAll(false)">None</button></span></div>
        <div class="secs">
          <label v-for="s in opts.sections" :key="s.key" class="sec" :class="{ on: f.picked.includes(s.key), off: !s.available }"><input v-model="f.picked" type="checkbox" :value="s.key" :disabled="!s.available"><span><b>{{ s.title }}</b><em>{{ s.available ? s.desc : 'Add your customer data on the Customers page to include this.' }}</em></span></label>
        </div>
        <label v-if="f.picked.includes('intro')" class="label">Company introduction<textarea v-model="f.about" rows="4" maxlength="4000" placeholder="What the company does, for whom, where it operates and what makes it different" /><span class="sm">Taken from your investor page and report details; your edits here are kept for next month. Founded, head office, website and leadership are added from your report details.</span></label>
        <template v-if="f.picked.includes('comments')">
          <label class="label">Your comments<textarea v-model="f.comments" rows="4" maxlength="8000" placeholder="What happened this month, what drove the numbers" /><button type="button" class="lk dr" @click="draft">Draft from the analysis</button></label>
          <label class="label">Priorities for next month<textarea v-model="f.priorities" rows="3" maxlength="4000" placeholder="The three or four things the team will focus on" /></label>
        </template>
        <CompanyLogo :company="company" note="The logo on the report is the one set in Settings." />
        <label class="chk"><input v-model="f.room" type="checkbox"> Also add it to the data room (Financials folder)</label>
        <label v-if="canUpd" class="chk"><input v-model="f.update" type="checkbox"> Also start a draft investor update with these numbers (key metrics, revenue chart and, with customer data, retention and sectors)</label>
        <p class="sm">Any of these metrics, including retention, customers, sectors and your KPIs, can also go on your <NuxtLink to="/investor-page">investor page</NuxtLink> and in <NuxtLink to="/updates">investor updates</NuxtLink>.</p>
      </template>
      <p v-if="f.msg" class="error">{{ f.msg }}</p>
    </div>
    <template #foot><button class="btn secondary" type="button" @click="emit('close')">Cancel</button><button class="btn" type="button" :disabled="f.busy || !f.month || !f.picked.length" @click="make">{{ f.busy ? 'Making the report…' : 'Download report' }}</button></template>
  </AppModal>
</template>

<style scoped>
.mr { display: flex; flex-direction: column; gap: 14px; font-size: 14px; }
.hint { margin: 0; color: var(--c-muted); font-size: 13px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); }
.label select, .label textarea { font: inherit; font-size: 14px; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.sh { display: flex; justify-content: space-between; align-items: baseline; } .sh b { font-weight: 500; }
.secs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.sec { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--c-rule-strong); background: #fff; padding: 9px 12px; cursor: pointer; }
.sec.on { border-color: var(--c-navy); background: #f5f7fb; } .sec.off { opacity: .55; cursor: default; }
.sec input { margin: 3px 0 0; } .sec span { display: flex; flex-direction: column; gap: 2px; } .sec b { font-weight: 500; font-size: 13.5px; } .sec em { font-style: normal; font-size: 12px; color: var(--c-muted); line-height: 1.4; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .dr { align-self: flex-start; }
.sm { font-size: 12px; color: var(--c-muted); }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.error { color: var(--c-danger); margin: 0; }
@media (max-width: 700px) { .secs, .g2 { grid-template-columns: 1fr; } }
</style>
