<script setup lang="ts">
// The company's chart of accounts: its own categories from uploaded and linked sheets, the standard line each rolls
// into, and how many periods have figures. Rename, move to another line, add or remove.
const props = defineProps<{ open: boolean; canEdit: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
interface Acc { id: string; name: string; parent: string; periods: number }
const data = ref<{ accounts: Acc[]; lines: { key: string; label: string; section: string }[] } | null>(null)
const msg = ref(''); const busy = ref(''); const add = reactive({ name: '', parent: 'opex_other' })
const edit = reactive<Record<string, { name: string; parent: string }>>({})
async function load() { data.value = await $fetch('/api/financials/accounts'); for (const a of data.value!.accounts) edit[a.id] = { name: a.name, parent: a.parent } }
watch(() => props.open, (o) => { if (o) { msg.value = ''; void load() } }, { immediate: true })
const err = (e: unknown, d: string) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? d
const label = (k: string) => (k ? 'In ' + (data.value?.lines.find((l) => l.key === k)?.label ?? k) : 'Detail only')
const SEC: Record<string, string> = { pl: 'Profit and loss', bs: 'Balance sheet', cf: 'Cash flow', '': 'Detail only' }
const groups = computed(() => { const g: Record<string, Acc[]> = {}; for (const a of data.value?.accounts ?? []) { const s = data.value!.lines.find((l) => l.key === a.parent)?.section ?? ''; (g[s] ??= []).push(a) } return Object.entries(g) })
async function save(a: Acc) { busy.value = a.id; msg.value = ''; try { await $fetch('/api/financials/accounts/' + a.id, { method: 'POST', body: edit[a.id] }); await load(); emit('changed') } catch (e) { msg.value = err(e, 'Could not save.') } finally { busy.value = '' } }
async function del(a: Acc) { if (!confirm('Remove "' + a.name + '"? Figures already saved stay as a detail.')) return; busy.value = a.id; msg.value = ''; try { await $fetch('/api/financials/accounts/' + a.id, { method: 'DELETE' }); await load() } catch (e) { msg.value = err(e, 'Could not remove it.') } finally { busy.value = '' } }
async function create() { busy.value = 'new'; msg.value = ''; try { await $fetch('/api/financials/accounts', { method: 'POST', body: add }); add.name = ''; await load() } catch (e) { msg.value = err(e, 'Could not add it.') } finally { busy.value = '' } }
const dirty = (a: Acc) => edit[a.id] && (edit[a.id]!.name !== a.name || edit[a.id]!.parent !== a.parent)
</script>
<template>
  <AppModal :open="open" title="Your categories" wide @close="emit('close')">
    <div v-if="data" class="coa">
      <p class="hint">Your chart of accounts: items in your sheets that are not one of the standard lines (for example Consultants, Software &amp; apps, Loans receivable, Paid-in capital). Each is added into the line it belongs to when your figures do not give that line, so uploads and linked sheets never fail on a row we do not know.</p>
      <div v-if="canEdit" class="add"><input v-model="add.name" maxlength="80" placeholder="New category, e.g. Consultants"><select v-model="add.parent" aria-label="Belongs to"><option value="">No line (detail only)</option><option v-for="l in data.lines" :key="l.key" :value="l.key">In {{ l.label }}</option></select><button class="btn sm" type="button" :disabled="!add.name.trim() || busy === 'new'" @click="create">Add</button></div>
      <p v-if="!data.accounts.length" class="empty">No categories yet. They are added when a sheet has rows that are not a standard line, or here.</p>
      <div v-for="[sec, list] in groups" :key="sec" class="grp"><h4>{{ SEC[sec] ?? sec }}</h4>
        <div v-for="a in list" :key="a.id" class="row">
          <template v-if="canEdit && edit[a.id]"><input v-model="edit[a.id]!.name" maxlength="80"><select v-model="edit[a.id]!.parent" aria-label="Belongs to"><option value="">No line (detail only)</option><option v-for="l in data.lines" :key="l.key" :value="l.key">In {{ l.label }}</option></select></template>
          <template v-else><b>{{ a.name }}</b><span>{{ label(a.parent) }}</span></template>
          <em>{{ a.periods ? a.periods + ' period' + (a.periods === 1 ? '' : 's') : 'No figures yet' }}</em>
          <span v-if="canEdit" class="acts"><button v-if="dirty(a)" type="button" class="lk" :disabled="busy === a.id" @click="save(a)">Save</button><button type="button" class="lk mu" :disabled="busy === a.id" @click="del(a)">Remove</button></span>
        </div></div>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <p v-else class="hint">Loading…</p>
    <template #foot><button class="btn secondary" type="button" @click="emit('close')">Close</button></template>
  </AppModal>
</template>
<style scoped>
.coa { display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; } .hint { color: var(--c-muted); font-size: 12.5px; margin: 0; } .empty { color: var(--c-muted); margin: 0; }
.add, .row { display: grid; grid-template-columns: 1.3fr 1.2fr 110px auto; gap: 8px; align-items: center; } .add { grid-template-columns: 1.3fr 1.2fr auto; }
input, select { font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; }
.grp h4 { margin: 4px 0 6px; font-size: 11.5px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); } .row { padding: 6px 0; border-top: 1px solid var(--c-rule); }
.row b { font-weight: 500; } .row span { color: var(--c-ink-soft); } .row em { font-style: normal; font-size: 12px; color: var(--c-muted); text-align: right; }
.acts { display: flex; gap: 10px; justify-content: flex-end; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.mu { color: var(--c-muted); }
.error { color: var(--c-danger); margin: 0; }
@media (max-width: 700px) { .add, .row { grid-template-columns: 1fr; } }
</style>
