<script setup lang="ts">
// A submitted filing / formation form, laid out for reading: the company (or filing year) up top, owners with shares,
// contact and address, the SSN masked, and the files as tiles. Used by the services desk and by the client.
interface F { key: string; label: string; type: string }
const props = defineProps<{ form: { title: string; fields: F[] }; answers: Record<string, unknown>; files: { field: string; name: string; url?: string }[]; ssnLast4?: string | null; ssn?: string; canReveal?: boolean; by?: string | null; at?: string | null; client?: boolean }>()
defineEmits<{ reveal: [] }>()
const a = computed(() => props.answers ?? {})
const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim()
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('') || '·'
const SHORT: Record<string, string> = { 'Limited Liability Company (LLC)': 'LLC', 'Corporation (C-Corp)': 'C-Corp' }
// Owners written as lines or "Name (Role, 60%), Name (40%)".
function owners(v: unknown): { name: string; role: string; pct: number | null }[] {
  const out: { name: string; role: string; pct: number | null }[] = []
  for (const m of str(v).matchAll(/([^,\n(]+?)\s*(?:\(([^)]*)\))?\s*(?:,|\n|$)/g)) {
    const name = (m[1] ?? '').trim(); if (!name) continue
    const inner = (m[2] ?? '').trim(); const pm = inner.match(/(\d+(?:\.\d+)?)\s*%/)
    out.push({ name, role: inner.replace(/,?\s*\d+(?:\.\d+)?\s*%/, '').replace(/^,\s*|,\s*$/g, '').trim(), pct: pm ? Number(pm[1]) : null })
  }
  return out
}
const OWNER_KEYS = ['owners', 'equity']
const HERO_KEYS = ['legal_name', 'name', 'entity_type', 'entity_other', 'tax_year', 'no_transactions', 'services']
const heroName = computed(() => str(a.value.legal_name) || str(a.value.name))
const heroTags = computed(() => [SHORT[str(a.value.entity_type)] ?? str(a.value.entity_type), str(a.value.entity_other), a.value.tax_year ? 'Tax year ' + str(a.value.tax_year) : '', str(a.value.no_transactions) === 'No transactions in that year' ? 'No transactions' : str(a.value.no_transactions) ? 'Had transactions' : '', ...((Array.isArray(a.value.services) ? a.value.services : []) as string[])].filter(Boolean))
const rows = computed(() => props.form.fields.filter((f) => !HERO_KEYS.includes(f.key) && f.type !== 'file' && f.type !== 'files' && (f.type === 'secret' ? !!props.ssnLast4 : str(a.value[f.key]) !== '')))
const fileFields = computed(() => props.form.fields.filter((f) => (f.type === 'file' || f.type === 'files')).map((f) => ({ f, list: props.files.filter((x) => x.field === f.key) })).filter((x) => x.list.length || !props.client))
const ext = (n: string) => { const e = (n.split('.').pop() ?? '').toLowerCase(); return e === 'pdf' ? 'PDF' : ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif'].includes(e) ? 'IMG' : ['xls', 'xlsx', 'csv'].includes(e) ? 'XLS' : ['doc', 'docx'].includes(e) ? 'DOC' : 'FILE' }
const icon = (k: string) => (/address/.test(k) ? 'pin' : /contact|email/.test(k) ? 'mail' : /website/.test(k) ? 'web' : /us_person/.test(k) ? 'flag' : '')
const when = computed(() => (props.at ? new Date(props.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''))
</script>

<template>
  <div class="isum">
    <div class="ish"><h2>{{ form.title }}</h2><span class="sent"><i />{{ client ? 'Sent to our team' : 'Submitted by the client' }}</span></div>
    <p v-if="by || when" class="ismeta">{{ by ? (client ? 'By ' : 'From ') + by : '' }}{{ by && when ? ' · ' : '' }}{{ when }}</p>
    <div v-if="heroName || heroTags.length" class="ishero">
      <span class="mono">{{ initials(heroName || form.title) }}</span>
      <div class="hi"><span class="lbl">{{ a.tax_year ? 'Filing for' : 'Company to register' }}</span><b>{{ heroName || '—' }}</b>
        <div v-if="heroTags.length" class="tags"><span v-for="t in heroTags" :key="t" class="tg" :class="{ warn: t === 'No transactions' }">{{ t }}</span></div></div>
    </div>
    <dl class="isl">
      <template v-for="f in rows" :key="f.key">
        <dt>{{ f.label }}</dt>
        <dd v-if="OWNER_KEYS.includes(f.key)"><ul class="own"><li v-for="w in owners(a[f.key])" :key="w.name"><span class="av">{{ initials(w.name) }}</span><span class="on"><b>{{ w.name }}</b><em v-if="w.role">{{ w.role }}</em></span><span v-if="w.pct != null" class="bar"><i :style="{ width: Math.min(100, w.pct) + '%' }" /></span><b v-if="w.pct != null" class="pc">{{ w.pct }}%</b></li></ul></dd>
        <dd v-else-if="f.type === 'secret'" class="ssn"><span class="mask">{{ ssn || '•••-••-' + ssnLast4 }}</span><button v-if="canReveal && !ssn" type="button" class="lk" @click="$emit('reveal')">Reveal</button><em v-if="!ssn">Stored encrypted</em></dd>
        <dd v-else class="tx" :class="icon(f.key)"><svg v-if="icon(f.key) === 'pin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg><svg v-else-if="icon(f.key) === 'mail'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg><span>{{ str(a[f.key]) }}</span></dd>
      </template>
    </dl>
    <div v-if="fileFields.length" class="isf"><span class="fh">Documents</span>
      <div class="fg"><div v-for="x in fileFields" :key="x.f.key" class="fc"><span class="fl">{{ x.f.label }}</span>
        <template v-if="x.list.length"><component :is="y.url ? 'a' : 'span'" v-for="y in x.list" :key="y.name" :href="webUrl(y.url)" target="_blank" rel="noopener" class="fi"><FileBadge :name="y.name" size="sm" /><span class="fn">{{ y.name }}</span><span v-if="y.url" class="dl">↓</span></component></template>
        <span v-else class="none">Not provided</span></div></div></div>
  </div>
</template>

<style scoped>
.isum { display: flex; flex-direction: column; }
.ish { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; } .ish h2 { margin: 0; font-size: 17px; }
.sent { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 0; background: #e9f6ee; color: #23784a; } .sent i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ismeta { margin: 6px 0 14px; font-size: 13px; color: var(--c-muted); }
.ishero { display: flex; gap: 14px; align-items: flex-start; padding: 14px; background: var(--c-paper-2); border-radius: 0; margin-bottom: 14px; }
.mono { flex: none; width: 44px; height: 44px; border-radius: 0; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 15px; }
.hi { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .hi .lbl { font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; } .hi b { font-size: 17px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; } .tg { font-size: 12px; padding: 3px 9px; border-radius: 0; background: #fff; border: 1px solid var(--c-rule); color: var(--c-ink-soft); } .tg.warn { background: #fff6e6; border-color: transparent; color: #a5650b; }
.isl { display: grid; grid-template-columns: minmax(150px, 210px) 1fr; gap: 12px 18px; margin: 0; } .isl dt { font-size: 13px; color: var(--c-muted); padding-top: 3px; line-height: 1.4; } .isl dd { margin: 0; font-size: 14px; min-width: 0; }
.tx { display: flex; gap: 7px; align-items: flex-start; white-space: pre-wrap; line-height: 1.5; word-break: break-word; } .tx svg { width: 16px; height: 16px; color: var(--c-blue-deep); flex: none; margin-top: 2px; }
.own { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .own li { display: grid; grid-template-columns: 30px minmax(0, 1fr) 110px 44px; gap: 10px; align-items: center; }
.av { width: 30px; height: 30px; border-radius: 50%; background: var(--c-blue-deep); color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 600; } .on { display: flex; flex-direction: column; min-width: 0; } .on b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .on em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.bar { height: 6px; border-radius: 0; background: var(--c-paper-2); overflow: hidden; } .bar i { display: block; height: 100%; background: var(--c-blue-deep); border-radius: 0; } .pc { text-align: right; font-variant-numeric: tabular-nums; }
.ssn { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .mask { font-family: ui-monospace, Menlo, monospace; background: var(--c-paper-2); padding: 3px 10px; border-radius: 0; letter-spacing: .05em; } .ssn em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.isf { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--c-rule); } .fh { display: block; font-size: 13px; color: var(--c-muted); margin-bottom: 10px; }
.fg { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; } .fc { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rule); border-radius: 0; padding: 10px 12px; } .fl { font-size: 12px; color: var(--c-muted); line-height: 1.35; }
.fi { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--c-ink); min-width: 0; } a.fi:hover .fn { color: var(--c-blue-deep); text-decoration: underline; }
.ft { flex: none; width: 32px; height: 36px; border-radius: 0; display: grid; place-items: center; font-size: 9.5px; font-weight: 700; color: #fff; background: #7b8794; } .ft[data-t="PDF"] { background: #d0473d; } .ft[data-t="IMG"] { background: #8a5cd1; } .ft[data-t="XLS"] { background: #23854f; } .ft[data-t="DOC"] { background: #2f6fd6; }
.fn { flex: 1; min-width: 0; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dl { color: var(--c-blue-deep); } .none { font-size: 13px; color: var(--c-muted); }
@media (max-width: 640px) { .isl { grid-template-columns: 1fr; gap: 2px; } .isl dd { margin-bottom: 10px; } .own li { grid-template-columns: 30px 1fr 44px; } .own .bar { display: none; } }
</style>
