<script setup lang="ts">
// Financial boards: one per audience (CFO, Executive, Team, Investors) plus your own; edit and share.
useHead({ title: 'Boards' })
interface B { id: string; audience: string; name: string; kpis: string[]; charts: { title: string; metrics: string[]; type?: string }[]; period: string; count: number; note: string | null; share_url: string | null; share_enabled: boolean; share_expires: string | null; views: number; last_viewed_at: string | null; data: Parameters<typeof useBoardData>[0] }
function useBoardData(d: { labels: string[]; series: Record<string, (number | null)[]>; kpis: { key: string; label: string; unit: string; value: number | null; prev: number | null; change: number | null }[]; charts: { title: string; metrics: string[] }[]; currency: string; period: string }) { return d }
const { data, refresh } = await useFetch<{ boards: B[]; metrics: Record<string, { label: string; unit: string }> }>('/api/financials/boards')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const canEdit = computed(() => !!me.value?.roles?.some((r) => ['admin', 'gp'].includes(r)))
const sel = ref(''); watchEffect(() => { if (!sel.value && data.value?.boards.length) sel.value = data.value.boards[0]!.id })
const board = computed(() => data.value?.boards.find((b) => b.id === sel.value) ?? null)
const msg = ref(''); const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function setPeriod(period: string) { if (!board.value) return; await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value.id, period, count: period === 'year' ? 5 : period === 'quarter' ? 8 : 12 } }); await refresh() }
const ed = reactive({ open: false, name: '', note: '', kpis: [] as string[], charts: [] as { title: string; metrics: string[]; type?: string }[] })
function openEdit() { const b = board.value!; Object.assign(ed, { open: true, name: b.name, note: b.note ?? '', kpis: [...b.kpis], charts: JSON.parse(JSON.stringify(b.charts)) }) }
function toggleKpi(k: string) { ed.kpis = ed.kpis.includes(k) ? ed.kpis.filter((x) => x !== k) : [...ed.kpis, k] }
async function saveEdit() { msg.value = ''; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value!.id, name: ed.name, note: ed.note, kpis: ed.kpis, charts: ed.charts.filter((c) => c.metrics.length) } }); ed.open = false; await refresh() } catch (e) { msg.value = err(e) } }
async function newBoard() { const r = await $fetch<{ id: string }>('/api/financials/boards', { method: 'POST', body: { name: 'New board' } }); await refresh(); sel.value = r.id; openEdit() }
const sh = reactive({ open: false, expires: 0, copied: false })
async function share(enabled: boolean, reset = false) { msg.value = ''; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value!.id, share: { enabled, expires_days: sh.expires, reset } } }); await refresh() } catch (e) { msg.value = err(e) } }
async function copy() { if (board.value?.share_url) { await navigator.clipboard.writeText(board.value.share_url); sh.copied = true; setTimeout(() => (sh.copied = false), 1500) } }
async function setType(i: number, type: string) { if (!board.value) return; const charts = board.value.charts.map((c, k) => (k === i ? { ...c, type } : c)); (board.value.data.charts[i] as { type?: string }).type = type; try { await $fetch('/api/financials/boards', { method: 'POST', body: { id: board.value.id, charts } }) } catch (e) { msg.value = err(e) } }
</script>
<template>
  <section v-if="data">
    <p class="label">Financials</p>
    <div class="head"><div><h1>Boards</h1><p class="lead">The same figures, set up for each audience. Share any board with a private link.</p></div><NuxtLink to="/financials" class="btn secondary">Back to Financials</NuxtLink></div>
    <nav class="bt"><button v-for="b in data.boards" :key="b.id" :class="{ on: sel === b.id }" @click="sel = b.id">{{ b.name }}<i v-if="b.share_enabled" title="Shared">●</i></button><button v-if="canEdit" class="add" @click="newBoard">+ New board</button></nav>
    <template v-if="board">
      <div class="bh"><p class="mut">{{ board.note }}</p><div class="tools">
        <div class="seg"><button v-for="[k, l] in [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]" :key="k" :class="{ on: board.period === k }" :disabled="!canEdit" @click="setPeriod(k)">{{ l }}</button></div>
        <button v-if="canEdit" class="btn secondary" @click="openEdit">Edit board</button><button v-if="canEdit" class="btn" @click="sh.open = true">{{ board.share_enabled ? 'Shared · ' + board.views + ' views' : 'Share' }}</button></div></div>
      <BoardView :data="board.data" :metrics="data.metrics" :editable="canEdit" @type="setType" />
    </template>
    <p v-if="msg" class="error">{{ msg }}</p>
    <AppModal :open="ed.open" title="Edit board" wide @close="ed.open = false">
      <div class="ef"><label class="label">Name<input v-model="ed.name" maxlength="80"></label><label class="label">Description<input v-model="ed.note" maxlength="1000"></label>
        <div><b class="lb">Headline figures</b><div class="mchips"><button v-for="(m, k) in data.metrics" :key="k" type="button" :class="{ on: ed.kpis.includes(k) }" @click="toggleKpi(k)">{{ m.label }}</button></div></div>
        <div><b class="lb">Charts</b><div v-for="(c, i) in ed.charts" :key="i" class="crow"><div class="crh"><input v-model="c.title" maxlength="80" placeholder="Chart title"><select v-model="c.type" aria-label="Chart type"><option :value="undefined">Line</option><option value="bar">Bar</option><option value="area">Area</option><option value="pie">Pie</option><option value="table">Table</option></select></div><div class="mchips sm"><button v-for="(m, k) in data.metrics" :key="k" type="button" :class="{ on: c.metrics.includes(k) }" @click="c.metrics = c.metrics.includes(k) ? c.metrics.filter((x) => x !== k) : c.metrics.length < 3 ? [...c.metrics, k] : c.metrics">{{ m.label }}</button></div><button type="button" class="lk" @click="ed.charts.splice(i, 1)">Remove</button></div>
          <button type="button" class="btn secondary sm" @click="ed.charts.push({ title: 'New chart', metrics: ['revenue'] })">+ Add a chart</button><p class="hint">Up to three figures per chart.</p></div></div>
      <template #foot><DeleteButton v-if="board?.audience === 'custom'" type="board" :id="board.id" :name="board.name" @deleted="ed.open = false; sel = ''; refresh()" /><button class="btn secondary" @click="ed.open = false">Cancel</button><button class="btn" @click="saveEdit">Save</button></template>
    </AppModal>
    <AppModal :open="sh.open" :title="'Share ' + (board?.name ?? '') + ' board'" @close="sh.open = false">
      <div v-if="board" class="ef"><p class="mut">Anyone with the link can view this board (read-only). It updates as your figures change. Turn it off at any time.</p>
        <template v-if="board.share_enabled && board.share_url"><div class="lnk"><code>{{ board.share_url }}</code><button class="btn secondary sm" @click="copy">{{ sh.copied ? 'Copied' : 'Copy' }}</button></div>
          <p class="mut">{{ board.views }} view{{ board.views === 1 ? '' : 's' }}{{ board.last_viewed_at ? ', last ' + new Date(board.last_viewed_at).toLocaleString('en-GB') : '' }}{{ board.share_expires ? ' · expires ' + new Date(board.share_expires).toLocaleDateString('en-GB') : '' }}</p>
          <div class="row"><button class="btn secondary" @click="share(false)">Turn off link</button><button class="lk" @click="share(true, true)">Make a new link (old one stops working)</button></div></template>
        <template v-else><label class="label">Link expires<select v-model.number="sh.expires"><option :value="0">Never</option><option :value="7">In 7 days</option><option :value="30">In 30 days</option><option :value="90">In 90 days</option></select></label><button class="btn" @click="share(true)">Create link</button></template></div>
    </AppModal>
  </section>
</template>
<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .head a { text-decoration: none; } .lead { color: var(--c-muted); margin: 4px 0 0; }
.bt { display: flex; gap: 4px; background: var(--c-paper-2); padding: 4px; margin: 16px 0 12px; width: fit-content; max-width: 100%; overflow-x: auto; } .bt button { background: none; border: 0; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; color: var(--c-ink-soft); white-space: nowrap; } .bt button.on { background: #fff; color: var(--c-ink); font-weight: 600; box-shadow: 0 1px 3px rgba(12,26,46,.08); } .bt i { font-style: normal; color: var(--c-ok); font-size: 9px; margin-left: 6px; vertical-align: middle; } .bt .add { color: var(--c-blue-deep); }
.bh { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .mut { color: var(--c-muted); font-size: 13.5px; margin: 0; } .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; } .seg button.on { background: var(--c-navy); color: #fff; }
.ef { display: flex; flex-direction: column; gap: 14px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .lb { font-size: 13px; display: block; margin-bottom: 6px; }
.mchips { display: flex; flex-wrap: wrap; gap: 6px; } .mchips button { background: #fff; border: 1px solid var(--c-rule); padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; } .mchips button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .mchips.sm button { font-size: 12px; padding: 3px 8px; }
.crow { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rule); padding: 10px; margin-bottom: 8px; } .lk { background: none; border: 0; color: var(--c-danger); font: inherit; font-size: 12.5px; cursor: pointer; align-self: flex-start; } .btn.sm { height: 30px; padding: 0 10px; font-size: 12.5px; } .hint { font-size: 12px; color: var(--c-muted); margin: 4px 0 0; }
.lnk { display: flex; gap: 8px; align-items: center; background: var(--c-signal-soft); padding: 10px; } .lnk code { flex: 1; font-size: 12.5px; word-break: break-all; } .row { display: flex; gap: 12px; align-items: center; } .error { color: var(--c-danger); }
.crh { display: flex; gap: 8px; } .crh input { flex: 1; }
</style>
