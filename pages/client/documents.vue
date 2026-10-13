<script setup lang="ts">
useHead({ title: 'Documents' })
const { data } = await usePortalFetch<{ id: string; title: string; size_bytes: number; mime_type: string; kind: string; reason: string | null; created_at: string; job_id: string; job: string; category: string; year: number }[]>('/api/portal/documents')
const msg = ref(''); const who = ref<'all' | 'team' | 'you'>('all'); const q = ref(''); const cat = ref('all'); const year = ref<number | 'all'>('all')
const CATS: Record<string, string> = { formation: 'Formation & EIN', tax: 'Tax', compliance: 'Compliance & filings', mail: 'Mail & registered agent', legal: 'Agreements & legal', bank: 'Bank & finance', billing: 'Billing', other: 'Other' }
// Filters other than the one being counted, so each chip shows how many it would show.
const base = computed(() => (data.value ?? []).filter((d) => (who.value === 'all' || (who.value === 'you') === (d.kind === 'client_document')) && (!q.value || (d.title + ' ' + (d.reason ?? '') + ' ' + d.job).toLowerCase().includes(q.value.toLowerCase()))))
const years = computed(() => [...new Set((data.value ?? []).map((d) => d.year))].sort((a, b) => b - a))
const cats = computed(() => { const n: Record<string, number> = {}; for (const d of base.value) if (year.value === 'all' || d.year === year.value) n[d.category] = (n[d.category] ?? 0) + 1; return Object.keys(CATS).filter((k) => n[k]).map((k) => ({ k, label: CATS[k], n: n[k] })) })
const list = computed(() => base.value.filter((d) => (cat.value === 'all' || d.category === cat.value) && (year.value === 'all' || d.year === year.value)))
const total = computed(() => base.value.filter((d) => year.value === 'all' || d.year === year.value).length)
// Grouped by year (newest first), or by category when one year is picked.
const groups = computed(() => {
  const m = new Map<string, typeof list.value>()
  for (const d of list.value) { const k = year.value === 'all' ? String(d.year) : CATS[d.category] ?? 'Other'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(d) }
  const out = [...m.entries()].map(([label, items]) => ({ label, items }))
  return year.value === 'all' ? out : out.sort((a, b) => Object.values(CATS).indexOf(a.label) - Object.values(CATS).indexOf(b.label))
})
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/portal/documents/' + id); window.location.href = r.url } catch (e) { msg.value = portalErr(e) } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB')
const ext = (t: string) => (t.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()
// Notes as plain text (no Markdown marks).
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|\*|`|\\)/g, '').replace(/^\s*(#{1,6}|>|[-*+])\s+/gm, '').replace(/\s+/g, ' ').trim()
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <div class="hd"><h1>Documents</h1><div class="tools"><input v-model="q" placeholder="Search documents" aria-label="Search"><div class="seg"><button v-for="[k, l] in [['all', 'All'], ['team', 'From Aidi'], ['you', 'Sent by you']]" :key="k" :class="{ on: who === k }" @click="who = k as 'all'">{{ l }}</button></div></div></div>
    <div v-if="data.length" class="flt">
      <div class="chips"><button type="button" :class="{ on: cat === 'all' }" @click="cat = 'all'">All categories <i>{{ total }}</i></button><button v-for="c in cats" :key="c.k" type="button" :class="{ on: cat === c.k }" @click="cat = c.k">{{ c.label }} <i>{{ c.n }}</i></button></div>
      <select v-model="year" aria-label="Year"><option value="all">All years</option><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-for="g in groups" :key="g.label" class="grp"><h2>{{ g.label }} <span>{{ g.items.length }}</span></h2>
      <div class="grid"><button v-for="d in g.items" :key="d.id + d.created_at" type="button" class="card dc" @click="openDoc(d.id)"><FileBadge :name="d.title" :mime="d.mime_type" size="lg" /><span class="dt"><b>{{ d.title.split(' — ').pop() }}</b><em v-if="d.reason" :title="plain(d.reason)">{{ plain(d.reason) }}</em><span class="mt">{{ CATS[d.category] ?? 'Other' }} · {{ d.kind === 'client_document' ? 'Sent by you' : 'From Aidi' }} · {{ day(d.created_at) }} · {{ size(d.size_bytes) }}</span></span><span class="dl">Download</span></button></div>
    </div>
    <EmptyState v-if="!list.length" card icon="documents" :title="data.length ? 'No documents match' : 'No documents yet'" :text="data.length ? 'Try another filter.' : 'Documents we share with you, and files you send us in messages or requests, appear here.'" />
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .hd h1 { margin: 0; } .tools { display: flex; gap: 10px; flex-wrap: wrap; } input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 8px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .seg button.on { background: var(--c-navy); color: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; } .dc { display: flex; gap: 12px; align-items: flex-start; text-align: left; font: inherit; cursor: pointer; } .dc:hover { border-color: var(--c-navy); }
.ic { width: 42px; height: 48px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 11px; font-weight: 700; flex: none; } .dt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dt b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dt em { font-style: normal; font-size: 13px; color: var(--c-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .mt { font-size: 12px; color: var(--c-muted); } .dl { font-size: 13px; color: var(--c-blue-deep); }
.flt { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; } .chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chips button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 6px 10px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .chips button.on { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .chips i { font-style: normal; opacity: .7; margin-left: 4px; }
select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; }
.grp { margin-bottom: 20px; } .grp h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--c-muted); margin: 0 0 8px; font-weight: 600; } .grp h2 span { font-weight: 400; margin-left: 4px; }
.none { color: var(--c-muted); text-align: center; padding: 28px; } .error { color: var(--c-danger); }
</style>
