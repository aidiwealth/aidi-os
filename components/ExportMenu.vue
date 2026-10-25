<script setup lang="ts">
// The export button used across the app: an icon that opens a small menu. Data that spans time downloads a month at
// a time; longer periods (up to a year) are emailed as a link. Excel or CSV.
const props = withDefaults(defineProps<{ kind: string; ranged?: boolean; label?: string; cust?: string }>(), { ranged: true, label: 'Export', cust: undefined })
const { cust: coCust } = await useCoScope()
// The company (or group) the page is on; Aidi OS Banking passes its own.
const cust = computed(() => props.cust ?? coCust.value)
const open = ref(false), fmt = ref<'xlsx' | 'csv'>('xlsx'), busy = ref(''), msg = ref(''), bad = ref(false)
const ym = (d: Date) => d.toISOString().slice(0, 7)
const months = computed(() => Array.from({ length: 24 }, (_, i) => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); return ym(d) }))
const monthName = (m: string) => new Date(m + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const month = ref(months.value[0]!), from = ref(months.value[11]!), to = ref(months.value[0]!)
const first = (m: string) => m + '-01', last = (m: string) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); const t = new Date().toISOString().slice(0, 10), x = d.toISOString().slice(0, 10); return x > t ? t : x }
const span = computed(() => { const a = new Date(from.value + '-01'), b = new Date(to.value + '-01'); return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1 })
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not export. Try again.'
const q = (extra: Record<string, string>) => ({ kind: props.kind, format: fmt.value, ...(cust.value ? { cust: cust.value } : {}), ...extra })
// Close when clicking anywhere else.
const root = ref<HTMLElement | null>(null)
const away = (e: MouseEvent) => { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('mousedown', away)); onBeforeUnmount(() => document.removeEventListener('mousedown', away))
async function download() {
  busy.value = 'dl'; msg.value = ''; bad.value = false
  try {
    const r = await $fetch.raw<Blob>('/api/exports/download', { query: q(props.ranged ? { from: first(month.value), to: last(month.value) } : {}), responseType: 'blob' })
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'export.' + fmt.value
    const url = URL.createObjectURL(r._data!), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000)
    open.value = false
  } catch (e) { bad.value = true; msg.value = err(e) } finally { busy.value = '' }
}
async function email() {
  if (span.value < 1 || span.value > 12) { bad.value = true; msg.value = 'Choose up to 12 months, oldest first.'; return }
  busy.value = 'em'; msg.value = ''; bad.value = false
  try { const r = await $fetch<{ email: string }>('/api/exports/email', { method: 'POST', query: cust.value ? { cust: cust.value } : {}, body: { kind: props.kind, format: fmt.value, from: first(from.value), to: last(to.value) } }); msg.value = 'On its way to ' + r.email + '. The link works for 7 days.' }
  catch (e) { bad.value = true; msg.value = err(e) } finally { busy.value = '' }
}
</script>
<template>
  <div ref="root" class="xm">
    <button type="button" class="ic" :title="label" :aria-label="label" :aria-expanded="open" @click="open = !open; msg = ''"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg></button>
    <div v-if="open" class="pop" role="dialog" :aria-label="label">
      <div class="hd"><b>{{ label }}</b><div class="seg"><button v-for="[k, l] in ([['xlsx', 'Excel'], ['csv', 'CSV']] as const)" :key="k" type="button" :class="{ on: fmt === k }" @click="fmt = k">{{ l }}</button></div></div>
      <template v-if="ranged">
        <div class="sec"><span class="t">Download a month</span><div class="row"><select v-model="month" aria-label="Month"><option v-for="m in months" :key="m" :value="m">{{ monthName(m) }}</option></select><button class="btn sm" type="button" :disabled="!!busy" @click="download">{{ busy === 'dl' ? 'Preparing…' : 'Download' }}</button></div></div>
        <div class="sec"><span class="t">Longer period, by email <em>up to 12 months</em></span><div class="row"><select v-model="from" aria-label="From"><option v-for="m in months" :key="m" :value="m">{{ monthName(m) }}</option></select><span class="to">to</span><select v-model="to" aria-label="To"><option v-for="m in months" :key="m" :value="m">{{ monthName(m) }}</option></select></div>
          <button class="btn sm secondary" type="button" :disabled="!!busy" @click="email">{{ busy === 'em' ? 'Sending…' : 'Email me the file' }}</button></div>
      </template>
      <div v-else class="sec"><button class="btn sm" type="button" :disabled="!!busy" @click="download">{{ busy === 'dl' ? 'Preparing…' : 'Download' }}</button><slot /></div>
      <p v-if="msg" class="msg" :class="{ bad }">{{ msg }}</p>
    </div>
  </div>
</template>
<style scoped>
.xm { position: relative; display: inline-block; }
.ic { width: 34px; height: 34px; display: grid; place-items: center; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink-soft); cursor: pointer; } .ic:hover, .ic[aria-expanded="true"] { color: var(--c-navy); border-color: var(--c-navy); } .ic svg { width: 16px; height: 16px; }
.pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: 320px; background: #fff; border: 1px solid var(--c-rule-strong); box-shadow: 0 14px 34px rgba(12, 26, 46, .16); padding: 14px; display: flex; flex-direction: column; gap: 12px; text-align: left; }
.hd { display: flex; justify-content: space-between; align-items: center; } .hd b { font-size: 14px; font-weight: 600; }
.seg { display: inline-flex; border: 1px solid var(--c-rule); } .seg button { background: none; border: 0; font: inherit; font-size: 12px; padding: 3px 10px; color: var(--c-muted); cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.sec { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--c-rule); } .t { font-size: 12px; color: var(--c-ink-soft); font-weight: 500; } .t em { font-style: normal; color: var(--c-muted); font-weight: 400; margin-left: 4px; }
.row { display: flex; gap: 6px; align-items: center; } select { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; } .to { font-size: 12px; color: var(--c-muted); }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .sec > .btn { align-self: flex-start; }
.msg { margin: 0; font-size: 12.5px; color: var(--c-ink-soft); } .msg.bad { color: var(--c-danger); }
</style>
