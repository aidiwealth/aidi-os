<script setup lang="ts">
// Investor list for a managed raise: stage summary, then a table (cards on small screens). Read-only for the founder,
// editable on the desk.
import { mdRender } from '~/shared/markdown'
interface I { id: string; name: string; firm: string | null; email: string | null; ticket: string | null; committed: string | null; status: string; next_step: string | null; notes: string | null; terms: string | null; visible: boolean; updated_at: string }
const props = defineProps<{ investors: I[]; labels: Record<string, string>; currency: string; editable?: boolean }>()
const emit = defineEmits<{ edit: [i: I] }>()
const money = (v: string | number | null) => (v == null || v === '' || Number(v) === 0 ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currency, maximumFractionDigits: 0, notation: Number(v) >= 1e6 ? 'compact' : 'standard' }).format(Number(v)))
const CLS: Record<string, string> = { target: 'g', contacted: 'b', meeting: 'b', diligence: 'a', term_sheet: 'a', committed: 'ok', closed: 'ok', passed: 'x' }
const ORDER = ['target', 'contacted', 'meeting', 'diligence', 'term_sheet', 'committed', 'closed', 'passed']
const stages = computed(() => ORDER.map((k) => ({ k, l: props.labels[k] ?? k, n: props.investors.filter((i) => i.status === k).length })).filter((s) => s.n))
</script>
<template>
  <div class="rtw">
    <div v-if="stages.length" class="stg"><span v-for="s in stages" :key="s.k" class="st" :class="CLS[s.k]">{{ s.l }} <b>{{ s.n }}</b></span></div>
    <table class="itbl"><thead><tr><th class="c-inv">Investor</th><th class="c-st">Status</th><th class="n">Ticket</th><th class="n">Committed</th><th class="c-nt">Next step and notes</th><th v-if="editable" /></tr></thead><tbody>
      <tr v-for="i in investors" :key="i.id" :class="{ hid: !i.visible }">
        <td class="c-inv"><b>{{ i.name }}</b><span v-if="i.firm" class="s">{{ i.firm }}</span><span v-if="editable && i.email" class="s">{{ i.email }}</span></td>
        <td class="c-st" data-l="Status"><span class="st" :class="CLS[i.status]">{{ labels[i.status] ?? i.status }}</span></td>
        <td class="n" data-l="Ticket">{{ money(i.ticket) }}</td><td class="n" data-l="Committed">{{ money(i.committed) }}</td>
        <td class="c-nt"><div v-if="i.next_step" class="nx">→ {{ i.next_step }}</div><div v-if="i.notes" class="md" v-html="mdRender(i.notes)" />
          <div v-if="i.terms" class="tm"><span>Terms</span><div class="md" v-html="mdRender(i.terms)" /></div><span v-if="!i.next_step && !i.notes && !i.terms" class="s">—</span></td>
        <td v-if="editable" class="c-ed"><button class="lk" @click="emit('edit', i)">Edit</button></td></tr>
      <tr v-if="!investors.length"><td :colspan="editable ? 6 : 5" class="empty">No investors on the list yet. {{ editable ? 'Add the first one.' : 'Our team adds investors here as outreach starts.' }}</td></tr></tbody></table>
  </div>
</template>
<style scoped>
.rtw { display: flex; flex-direction: column; gap: 12px; }
.stg { display: flex; gap: 6px; flex-wrap: wrap; } .stg .st b { font-weight: 700; margin-left: 4px; }
.itbl { width: 100%; border-collapse: collapse; font-size: 13.5px; table-layout: auto; }
.itbl th { text-align: left; font-weight: 500; color: var(--c-muted); font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.itbl td { padding: 12px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.c-inv { min-width: 160px; } .c-inv b { display: block; font-size: 14px; } .c-st { white-space: nowrap; } .c-nt { min-width: 220px; width: 40%; } .c-ed { white-space: nowrap; }
.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.s { display: block; font-size: 12.5px; color: var(--c-muted); } .nx { color: var(--c-ink); font-weight: 500; margin-bottom: 4px; }
.md { color: var(--c-ink-soft); font-size: 13px; line-height: 1.5; } .md :deep(p) { margin: 0 0 4px; } .md :deep(ul), .md :deep(ol) { margin: 0 0 4px; padding-left: 16px; }
.tm { margin-top: 6px; padding: 6px 9px; background: #fff7ea; border-left: 3px solid #e3a008; } .tm > span { display: block; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #8a4b00; } .tm .md { color: #6b3b00; }
.hid { opacity: .55; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 13px; } .empty { color: var(--c-muted); text-align: center; padding: 22px 10px; }
.st { font-size: 12px; padding: 3px 9px; white-space: nowrap; display: inline-block; } .st.g { background: var(--c-paper-2); color: var(--c-ink-soft); } .st.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st.a { background: rgba(181,71,8,.09); color: var(--c-warn); } .st.ok { background: rgba(31,122,77,.1); color: var(--c-ok); } .st.x { background: rgba(180,35,24,.07); color: var(--c-danger); }
@media (max-width: 760px) {
  .itbl thead { display: none; } .itbl, .itbl tbody, .itbl tr, .itbl td { display: block; width: 100%; }
  .itbl tr { border: 1px solid var(--c-rule); padding: 10px 12px; margin-bottom: 10px; } .itbl td { border: 0; padding: 4px 0; text-align: left; }
  .itbl td[data-l]::before { content: attr(data-l) ': '; color: var(--c-muted); font-size: 12px; } .n { text-align: left; }
}
</style>
