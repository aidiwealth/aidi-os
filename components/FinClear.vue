<script setup lang="ts">
// Delete or clear figures in bulk: which periods (all, the selected ones, a range) and what (everything, a statement,
// single lines, KPIs). Deleting everything asks the user to type DELETE.
const props = defineProps<{ open: boolean; subject: string; selected: string[]; lines: { key: string; label: string; section: string }[]; months: string[] }>()
const emit = defineEmits<{ close: []; done: [msg: string] }>()
const f = reactive({ scope: 'all' as 'all' | 'ids' | 'range', from: '', to: '', types: ['month', 'quarter', 'year'] as string[], what: 'all' as 'all' | 'pl' | 'bs' | 'cf' | 'kpis' | 'pick', pick: [] as string[], pause: true, confirm: '', busy: false, msg: '' })
const { data: sl } = await useFetch<{ links: { subject: string | null; auto: boolean; name: string }[] }>('/api/sheet-links', { query: { target: 'financials' }, default: () => ({ links: [] }), server: false })
const linked = computed(() => (sl.value?.links ?? []).filter((l) => l.subject === props.subject && l.auto))
watch(() => props.open, (o) => { if (o) Object.assign(f, { scope: props.selected.length ? 'ids' : 'all', from: props.months[0]?.slice(0, 7) ?? '', to: props.months[props.months.length - 1]?.slice(0, 7) ?? '', types: ['month', 'quarter', 'year'], what: 'all', pick: [], pause: true, confirm: '', busy: false, msg: '' }) })
const SECT: Record<string, string> = { pl: 'Income statement', bs: 'Balance sheet', cf: 'Cash flow' }
const keys = computed(() => f.what === 'all' || f.what === 'kpis' ? [] : f.what === 'pick' ? f.pick : props.lines.filter((l) => l.section === f.what).map((l) => l.key))
const needType = computed(() => f.scope === 'all' && f.what === 'all')
const summary = computed(() => {
  const where = f.scope === 'all' ? 'every period' : f.scope === 'ids' ? props.selected.length + ' selected period' + (props.selected.length === 1 ? '' : 's') : 'periods from ' + f.from + ' to ' + f.to
  const what = f.what === 'all' ? 'Delete all figures' : f.what === 'kpis' ? 'Clear the KPIs' : f.what === 'pick' ? 'Clear ' + f.pick.length + ' line' + (f.pick.length === 1 ? '' : 's') : 'Clear the ' + SECT[f.what]!.toLowerCase()
  return what + ' for ' + where + '.'
})
const ready = computed(() => (f.what !== 'pick' || f.pick.length > 0) && (f.scope !== 'ids' || props.selected.length > 0) && f.types.length > 0 && (!needType.value || f.confirm.trim() === 'DELETE'))
async function go() {
  f.busy = true; f.msg = ''
  try {
    const r = await $fetch<{ deleted: number; cleared: number; paused: number }>('/api/financials/clear', { method: 'POST', body: { subject: props.subject, scope: f.scope, ids: f.scope === 'ids' ? props.selected : [], from: f.scope === 'range' ? f.from : undefined, to: f.scope === 'range' ? f.to : undefined, period_types: f.types, lines: keys.value, kpis: f.what === 'kpis', pause_sheets: f.pause && linked.value.length > 0, confirm: f.confirm.trim() || undefined } })
    const parts = [r.deleted ? r.deleted + ' period' + (r.deleted === 1 ? '' : 's') + ' deleted' : '', r.cleared ? r.cleared + ' period' + (r.cleared === 1 ? '' : 's') + ' cleared' : '', r.paused ? 'daily sheet sync paused' : ''].filter(Boolean)
    emit('done', parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Nothing matched, so nothing changed.')
  } catch (e) { f.msg = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not delete.' } finally { f.busy = false }
}
</script>

<template>
  <AppModal :open="open" title="Delete or clear figures" wide @close="emit('close')">
    <div class="fc">
      <div class="blk"><h4>Which periods</h4>
        <div class="opts"><label class="opt"><input v-model="f.scope" type="radio" value="all"> All periods</label>
          <label class="opt" :class="{ off: !selected.length }"><input v-model="f.scope" type="radio" value="ids" :disabled="!selected.length"> Selected ({{ selected.length }})</label>
          <label class="opt"><input v-model="f.scope" type="radio" value="range"> A date range</label></div>
        <div v-if="f.scope === 'range'" class="rg"><label>From<input v-model="f.from" type="month" :max="f.to"></label><label>To<input v-model="f.to" type="month" :min="f.from"></label></div>
        <div v-if="f.scope !== 'ids'" class="tys"><span>Include</span><label v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="k" class="ck"><input v-model="f.types" type="checkbox" :value="k"> {{ l }}</label></div>
      </div>
      <div class="blk"><h4>What to remove</h4>
        <div class="opts"><label class="opt"><input v-model="f.what" type="radio" value="all"> Everything (delete the periods)</label>
          <label v-for="(l, k) in SECT" :key="k" class="opt"><input v-model="f.what" type="radio" :value="k"> {{ l }} only</label>
          <label class="opt"><input v-model="f.what" type="radio" value="kpis"> KPIs only</label>
          <label class="opt"><input v-model="f.what" type="radio" value="pick"> Choose lines</label></div>
        <div v-if="f.what === 'pick'" class="pk"><div v-for="(l, k) in SECT" :key="k" class="pc"><b>{{ l }}</b><label v-for="x in lines.filter((y) => y.section === k)" :key="x.key" class="ck"><input v-model="f.pick" type="checkbox" :value="x.key"> {{ x.label }}</label></div></div>
      </div>
      <label v-if="linked.length" class="ck sync"><input v-model="f.pause" type="checkbox"> Pause the daily sync of {{ linked.length === 1 ? 'the linked sheet "' + linked[0]!.name + '"' : linked.length + ' linked sheets' }}, so the figures do not come back. You can sync again any time.</label>
      <div class="sum"><b>{{ summary }}</b><span>This cannot be undone. Your dashboard, analysis, investor page and reports update straight away.</span></div>
      <label v-if="needType" class="cf">Type <b>DELETE</b> to confirm<input v-model="f.confirm" autocomplete="off" placeholder="DELETE"></label>
      <p v-if="f.msg" class="error">{{ f.msg }}</p>
    </div>
    <template #foot><button class="btn secondary" type="button" @click="emit('close')">Cancel</button><button class="btn danger" type="button" :disabled="!ready || f.busy" @click="go">{{ f.busy ? 'Working…' : f.what === 'all' ? 'Delete' : 'Clear' }}</button></template>
  </AppModal>
</template>

<style scoped>
.fc { display: flex; flex-direction: column; gap: 16px; font-size: 14px; }
.blk h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
.opts { display: flex; flex-wrap: wrap; gap: 6px; }
.opt { display: flex; gap: 8px; align-items: center; border: 1px solid var(--c-rule-strong); background: #fff; padding: 8px 12px; cursor: pointer; font-size: 13.5px; }
.opt:has(input:checked) { border-color: var(--c-navy); background: #f5f7fb; } .opt.off { opacity: .5; cursor: default; } .opt input { margin: 0; }
.rg { display: flex; gap: 12px; margin-top: 10px; } .rg label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); }
.rg input, .cf input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.tys { display: flex; gap: 14px; align-items: center; margin-top: 10px; font-size: 13px; } .tys > span { color: var(--c-muted); }
.ck { display: flex; gap: 7px; align-items: center; font-size: 13px; } .ck input { margin: 0; }
.pk { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 10px; border: 1px solid var(--c-rule); padding: 12px; background: #fff; }
.pc { display: flex; flex-direction: column; gap: 5px; } .pc b { font-weight: 500; font-size: 13px; margin-bottom: 2px; }
.sync { align-items: flex-start; color: var(--c-ink-soft); } .sync input { margin-top: 3px; }
.sum { display: flex; flex-direction: column; gap: 3px; border: 1px solid #f3d3cf; background: #fdf6f5; padding: 10px 14px; } .sum b { font-weight: 500; } .sum span { font-size: 12.5px; color: var(--c-muted); }
.cf { display: flex; flex-direction: column; gap: 6px; font-size: 13px; max-width: 260px; }
.error { color: var(--c-danger); margin: 0; }
.btn.danger { background: var(--c-danger); border-color: var(--c-danger); color: #fff; } .btn.danger:disabled { opacity: .45; }
@media (max-width: 700px) { .pk { grid-template-columns: 1fr; } }
</style>
