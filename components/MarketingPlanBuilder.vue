<script setup lang="ts">
// Build the Marketing page from the founder's own material: paste a detailed brief or drop files (PDF, Word, Excel,
// CSV, text). AI drafts the strategy report, funnel, channels with budgets and campaigns; the founder checks the draft
// and saves it (a new marketing process, or the one open, updated).
const props = defineProps<{ open: boolean; processId?: string | null; cust?: string }>()
const emit = defineEmits<{ close: []; done: [id: string] }>()
interface Plan { currency: string | null; strategy: string; stages: { name: string; kind: string; target_pct: number | null; days: number | null; steps: string[] }[]; channels: { name: string; monthly_budget: number | null; why: string }[]; campaigns: { name: string; channel: string; status: string; starts_on: string | null; ends_on: string | null; budget: number | null; goal: string; steps: string[] }[] }
const text = ref(''), budget = ref(''), files = ref<File[]>([]), msg = ref(''), saving = ref(false), replaceFunnel = ref(false)
const plan = ref<Plan | null>(null)
const job = useAiJob<{ plan: Plan; files: string[] }>()
watch(() => props.open, (o) => { if (o) { msg.value = ''; plan.value = null } })
function addFiles(ev: Event) { const fs = Array.from((ev.target as HTMLInputElement).files ?? []); files.value = [...files.value, ...fs].slice(0, 10) }
const q = computed(() => (props.cust ? '?cust=' + encodeURIComponent(props.cust) : ''))
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function build() {
  msg.value = ''; plan.value = null
  const fd = new FormData(); fd.append('text', text.value); fd.append('budget', budget.value); for (const f of files.value) fd.append('files', f, f.name)
  try {
    const { job: id } = await $fetch<{ job: string }>('/api/growth/plan' + q.value, { method: 'POST', body: fd })
    const r = await job.follow(id)
    if (r) plan.value = r.plan; else if (job.fail.value) msg.value = job.fail.value.message + (job.fail.value.advice.length ? ' ' + job.fail.value.advice.join(' ') : '')
  } catch (e) { msg.value = err(e) }
}
async function save() {
  if (!plan.value) return; saving.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/growth/plan-apply' + q.value, { method: 'POST', body: { process_id: props.processId ?? null, replace_funnel: replaceFunnel.value, plan: plan.value } }); emit('done', r.id) }
  catch (e) { msg.value = err(e) } finally { saving.value = false }
}
const money = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + (plan.value?.currency ? ' ' + plan.value.currency : ''))
const STATUS: Record<string, string> = { planned: 'Planned', live: 'Live', done: 'Done' }
</script>
<template>
  <AppModal :open="open" :title="plan ? 'Your marketing page' : 'Build from your brief or files'" xl @close="emit('close')">
    <div v-if="!plan" class="pb">
      <label class="label">Brief<textarea v-model="text" rows="10" maxlength="60000" placeholder="Paste your marketing strategy, plan, budget and what has been done. The more detail, the better." /></label>
      <DropZone multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.md" label="Or drop files: PDF, Word, Excel, CSV or text" hint="Up to 10 files" no-tip @change="addFiles" />
      <div v-if="files.length" class="fl"><span v-for="(f, i) in files" :key="f.name + i" class="chip">{{ f.name }}<button type="button" aria-label="Remove" @click="files.splice(i, 1)">×</button></span></div>
      <label class="label bud">Yearly budget (optional)<input v-model="budget" inputmode="decimal" placeholder="e.g. 51,248,335"></label>
      <div v-if="job.busy.value" class="wait"><AiSpark /> Reading your material and building the page. A long document takes a minute or two.</div>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <div v-else class="pv">
      <section class="st"><div class="md" v-html="renderMarkdown(plan.strategy)" /></section>
      <div class="grid">
        <section><h4>Funnel</h4><ol class="fun"><li v-for="s in plan.stages" :key="s.name" :class="s.kind">{{ s.name }}<em v-if="s.target_pct !== null">{{ s.target_pct }}%</em></li></ol>
          <label v-if="processId" class="chk"><input v-model="replaceFunnel" type="checkbox"> Replace my current funnel with this one</label></section>
        <section><h4>Channels <span>{{ plan.channels.length }}</span></h4><table data-nosearch><tbody><tr v-for="c in plan.channels" :key="c.name"><td>{{ c.name }}</td><td class="r">{{ money(c.monthly_budget) }}<small>/mo</small></td></tr></tbody></table></section>
      </div>
      <section><h4>Campaigns <span>{{ plan.campaigns.length }}</span></h4>
        <table data-nosearch><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th>Dates</th><th class="r">Budget</th></tr></thead>
          <tbody><tr v-for="c in plan.campaigns" :key="c.name"><td>{{ c.name }}<small v-if="c.goal">{{ c.goal }}</small></td><td>{{ c.channel || '—' }}</td><td><span class="tag" :class="c.status">{{ STATUS[c.status] }}</span></td><td class="nw">{{ c.starts_on ?? '' }}{{ c.ends_on ? ' – ' + c.ends_on : '' }}</td><td class="r">{{ money(c.budget) }}</td></tr></tbody></table></section>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <template #foot>
      <template v-if="!plan"><button class="btn secondary" type="button" @click="emit('close')">Cancel</button><button class="btn" type="button" :disabled="job.busy.value || (!text.trim() && !files.length)" @click="build">{{ job.busy.value ? 'Building…' : 'Build my marketing page' }}</button></template>
      <template v-else><button class="btn secondary" type="button" @click="plan = null">Back</button><button class="btn" type="button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : processId ? 'Update my marketing page' : 'Create my marketing page' }}</button></template>
    </template>
  </AppModal>
</template>
<style scoped>
.pb, .pv { display: flex; flex-direction: column; gap: 14px; }
label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-ink-soft); }
textarea, input { font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); color: var(--c-ink); background: #fff; } textarea { resize: vertical; line-height: 1.5; }
.bud input { max-width: 240px; }
.fl { display: flex; gap: 6px; flex-wrap: wrap; } .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; background: var(--c-paper-2); padding: 4px 4px 4px 10px; } .chip button { background: none; border: 0; cursor: pointer; font-size: 15px; color: var(--c-muted); }
.wait { display: flex; gap: 8px; align-items: center; font-size: 13.5px; color: var(--c-blue-deep); background: #f3f8fc; padding: 10px 12px; }
.error { color: var(--c-danger); margin: 0; font-size: 13.5px; }
.st { border: 1px solid var(--c-rule); padding: 16px 20px; max-height: 360px; overflow-y: auto; background: #fff; }
.md :deep(h2), .md :deep(h3), .md :deep(h4) { font-size: 15px; margin: 14px 0 6px; } .md :deep(p) { margin: 0 0 8px; font-size: 14px; line-height: 1.55; } .md :deep(ul) { margin: 0 0 8px; padding-left: 20px; font-size: 14px; } .md :deep(table) { font-size: 13px !important; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
h4 { margin: 0 0 8px; font-size: 14px; } h4 span { font-weight: 400; color: var(--c-muted); margin-left: 4px; }
.fun { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; } .fun li { font-size: 13.5px; padding: 6px 10px; background: var(--c-paper-2); display: flex; justify-content: space-between; } .fun li.won { background: #e8f0f8; } .fun li.lost { color: var(--c-muted); } .fun em { font-style: normal; color: var(--c-muted); font-size: 12px; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-top: 8px; } .chk input { width: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; } th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 7px 8px; border-bottom: 1px solid var(--c-rule); } td { padding: 7px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } td small { display: block; color: var(--c-muted); font-size: 12px; } .r { text-align: right; white-space: nowrap; } .nw { white-space: nowrap; color: var(--c-ink-soft); font-size: 12.5px; }
.tag { font-size: 11.5px; padding: 2px 7px; background: var(--c-paper-2); } .tag.live { background: #e8f0f8; color: var(--c-blue-deep); } .tag.done { color: var(--c-muted); }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
