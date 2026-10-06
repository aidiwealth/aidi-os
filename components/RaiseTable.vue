<script setup lang="ts">
// Investor list for a managed raise (read-only for the client, editable on the desk).
interface I { id: string; name: string; firm: string | null; email: string | null; ticket: string | null; committed: string | null; status: string; next_step: string | null; notes: string | null; terms: string | null; visible: boolean; updated_at: string }
defineProps<{ investors: I[]; labels: Record<string, string>; currency: string; editable?: boolean }>()
const emit = defineEmits<{ edit: [i: I] }>()
const money = (v: string | number | null, c: string) => (v == null || v === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)))
const CLS: Record<string, string> = { target: 'g', contacted: 'b', meeting: 'b', diligence: 'a', term_sheet: 'a', committed: 'ok', closed: 'ok', passed: 'x' }
</script>
<template>
  <table class="rt"><thead><tr><th>Investor</th><th>Status</th><th class="n">Ticket</th><th class="n">Committed</th><th>Next step · notes</th><th v-if="editable" /></tr></thead><tbody>
    <tr v-for="i in investors" :key="i.id" :class="{ hid: !i.visible }"><td><b>{{ i.name }}</b><span v-if="i.firm" class="s">{{ i.firm }}</span><span v-if="editable && i.email" class="s">{{ i.email }}</span></td>
      <td><span class="st" :class="CLS[i.status]">{{ labels[i.status] ?? i.status }}</span></td><td class="n">{{ money(i.ticket, currency) }}</td><td class="n">{{ money(i.committed, currency) }}</td>
      <td><span v-if="i.next_step" class="s nx">→ {{ i.next_step }}</span><span v-if="i.notes" class="s">{{ i.notes }}</span><span v-if="i.terms" class="s tm">Terms: {{ i.terms }}</span></td>
      <td v-if="editable"><button class="lk" @click="emit('edit', i)">Edit</button></td></tr>
    <tr v-if="!investors.length"><td :colspan="editable ? 6 : 5" class="s">No investors on the list yet.</td></tr></tbody></table>
</template>
<style scoped>
.rt { width: 100%; border-collapse: collapse; font-size: 13.5px; } th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12.5px; padding: 8px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 8px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.s { display: block; font-size: 12.5px; color: var(--c-muted); } .nx { color: var(--c-ink-soft); } .tm { color: #8a4b00; } .hid { opacity: .55; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13px; }
.st { font-size: 12px; padding: 2px 8px; white-space: nowrap; } .st.g { background: var(--c-paper-2); } .st.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st.a { background: rgba(181,71,8,.09); color: var(--c-warn); } .st.ok { background: rgba(31,122,77,.1); color: var(--c-ok); } .st.x { background: rgba(180,35,24,.07); color: var(--c-danger); }
</style>
