<script setup lang="ts">
import type { ObligationRow } from '~/server/api/compliance/index.get'
useHead({ title: 'Compliance' })
const { data, error, refresh } = await useFetch<ObligationRow[]>('/api/compliance')
const { data: entities } = await useFetch<{ id: string; name: string; jurisdiction: string | null }[]>('/api/entities')
const { data: people } = await useFetch<{ id: string; name: string }[]>('/api/pipeline/people')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'gp', 'team'].includes(r)))
const CAT: Record<string, string> = { tax: 'Tax', annual_return: 'Annual return', franchise_tax: 'Franchise tax', registered_agent: 'Registered agent', licence: 'Licence', regulatory: 'Regulatory filing', insurance: 'Insurance', banking: 'Banking / KYC', other: 'Other' }
const REC: Record<string, string> = { none: 'One-off', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' }
// Common filings as starting points. Dates are typical for calendar-year entities: confirm them with your adviser.
const TEMPLATES = [
  { label: 'Delaware franchise tax and annual report (corporation)', title: 'Delaware franchise tax and annual report', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', md: [3, 1] },
  { label: 'Delaware annual tax (LLC or LP)', title: 'Delaware annual tax (LLC/LP)', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', md: [6, 1] },
  { label: 'US federal return, partnership or S-corp (1065 / 1120-S)', title: 'US federal income tax return (1065 / 1120-S)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [3, 15] },
  { label: 'US federal return, C-corp (1120)', title: 'US federal income tax return (1120)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [4, 15] },
  { label: 'US 1099 filings to contractors and IRS', title: '1099 filings', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [1, 31] },
  { label: 'California state return', title: 'California state tax return', category: 'tax', jurisdiction: 'US-CA', recurrence: 'annual', md: [4, 15] },
  { label: 'Registered agent renewal', title: 'Registered agent renewal', category: 'registered_agent', jurisdiction: '', recurrence: 'annual', md: null },
  { label: 'Nigeria CAC annual return', title: 'CAC annual return', category: 'annual_return', jurisdiction: 'NG', recurrence: 'annual', md: null },
  { label: 'Nigeria company income tax (FIRS)', title: 'Company income tax return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'annual', md: [6, 30] },
  { label: 'Nigeria VAT return (monthly, 21st)', title: 'VAT return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', md: [0, 21] },
  { label: 'Nigeria PAYE remittance (monthly, 10th)', title: 'PAYE remittance', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', md: [0, 10] },
  { label: 'Insurance renewal', title: 'Insurance renewal', category: 'insurance', jurisdiction: '', recurrence: 'annual', md: null },
  { label: 'Bank KYC refresh', title: 'Bank KYC refresh', category: 'banking', jurisdiction: '', recurrence: 'annual', md: null }
]
function nextDate(md: number[] | null): string {
  const now = new Date(); const y = now.getUTCFullYear()
  if (!md) return ''
  if (md[0] === 0) { let d = new Date(Date.UTC(y, now.getUTCMonth(), md[1])); if (d < now) d = new Date(Date.UTC(y, now.getUTCMonth() + 1, md[1])); return d.toISOString().slice(0, 10) }
  let d = new Date(Date.UTC(y, md[0]! - 1, md[1])); if (d < now) d = new Date(Date.UTC(y + 1, md[0]! - 1, md[1])); return d.toISOString().slice(0, 10)
}
const adding = ref(false)
const tpl = ref('')
const form = reactive({ entity_id: '', title: '', category: 'tax', jurisdiction: '', recurrence: 'annual', next_due: '', reminder_days: 14, owner_id: '', notes: '' })
watch(tpl, (i) => { const t = TEMPLATES[Number(i)]; if (!t) return; Object.assign(form, { title: t.title, category: t.category, jurisdiction: t.jurisdiction, recurrence: t.recurrence, next_due: nextDate(t.md) }) })
const msg = ref('')
async function add() {
  msg.value = ''
  try { await $fetch('/api/compliance', { method: 'POST', body: { ...form, owner_id: form.owner_id || null, jurisdiction: form.jurisdiction || undefined, notes: form.notes || undefined } }); adding.value = false; tpl.value = ''; form.title = ''; form.next_due = ''; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
const entity = ref('')
const showDone = ref(false)
const visible = computed(() => (data.value ?? []).filter((o) => (!entity.value || o.entity_id === entity.value) && (showDone.value || o.active)))
const groups = computed(() => [
  { key: 'overdue', label: 'Overdue', items: visible.value.filter((o) => o.active && o.days_left < 0) },
  { key: 'soon', label: 'Next 30 days', items: visible.value.filter((o) => o.active && o.days_left >= 0 && o.days_left <= 30) },
  { key: 'later', label: 'Later', items: visible.value.filter((o) => o.active && o.days_left > 30) },
  { key: 'done', label: 'Finished (one-off, done)', items: visible.value.filter((o) => !o.active) }
].filter((g) => g.items.length))
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const when = (n: number) => (n < 0 ? Math.abs(n) + ' day' + (n === -1 ? '' : 's') + ' overdue' : n === 0 ? 'Due today' : 'in ' + n + ' day' + (n === 1 ? '' : 's'))
</script>

<template>
  <section>
    <p class="label">Family Office</p>
    <div class="head">
      <h1>Compliance</h1>
      <div class="tools">
        <select v-model="entity" aria-label="Entity"><option value="">All entities</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
        <button v-if="canEdit" class="btn" type="button" @click="adding = !adding">{{ adding ? 'Close' : 'Add obligation' }}</button>
      </div>
    </div>
    <p class="lead">Filings, renewals and deadlines for every entity. Owners get an email when something is coming up and if it becomes overdue.</p>

    <form v-if="adding" class="card add" @submit.prevent="add">
      <label class="label wide">Start from a template (optional)<select v-model="tpl"><option value="">— Blank —</option><option v-for="(t, i) in TEMPLATES" :key="i" :value="String(i)">{{ t.label }}</option></select></label>
      <label class="label">Entity<select v-model="form.entity_id" required><option value="" disabled>Choose</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label class="label">Title<input v-model="form.title" required maxlength="200"></label>
      <label class="label">Type<select v-model="form.category"><option v-for="(l, k) in CAT" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">How often<select v-model="form.recurrence"><option v-for="(l, k) in REC" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Next due<input v-model="form.next_due" type="date" required></label>
      <label class="label">Remind (days before)<input v-model.number="form.reminder_days" type="number" min="0" max="120"></label>
      <label class="label">Owner<select v-model="form.owner_id"><option value="">No owner (alerts go to the partners)</option><option v-for="p in people ?? []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <label class="label">Jurisdiction<input v-model="form.jurisdiction" maxlength="20" placeholder="e.g. US-DE, NG"></label>
      <label class="label wide">Notes<textarea v-model="form.notes" rows="2" maxlength="3000" placeholder="Portal, account number reference, adviser, fees" /></label>
      <p class="hint wide">Template dates are typical for calendar-year entities. Confirm each date with your adviser.</p>
      <button class="btn" type="submit">Save</button>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>

    <p v-if="error" class="error" role="alert">Could not load the calendar.</p>
    <p v-else-if="!groups.length" class="muted">Nothing here yet. Add the first obligation, for example Delaware franchise tax for your holding company.</p>
    <div v-for="g in groups" :key="g.key" class="grp" :data-g="g.key">
      <h2>{{ g.label }} <span>{{ g.items.length }}</span></h2>
      <table class="table">
        <tbody>
          <tr v-for="o in g.items" :key="o.id">
            <td class="date"><b>{{ day(o.next_due) }}</b><span :class="{ red: o.days_left < 0, amber: o.days_left >= 0 && o.days_left <= 7 }">{{ o.active ? when(o.days_left) : 'Done' }}</span></td>
            <td><NuxtLink :to="'/compliance/' + o.id" class="co">{{ o.title }}</NuxtLink><span class="sub">{{ o.entity }}<template v-if="o.jurisdiction"> · {{ o.jurisdiction }}</template></span></td>
            <td class="muted">{{ CAT[o.category] }}<span class="sub">{{ REC[o.recurrence] }}</span></td>
            <td class="muted">{{ o.owner ?? 'No owner' }}<span v-if="o.last_completed" class="sub">last done {{ day(o.last_completed) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <label class="chk"><input v-model="showDone" type="checkbox"> Show finished one-off items</label>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 8px; gap: 12px; flex-wrap: wrap; }
.tools { display: flex; gap: 10px; align-items: center; }
.lead { color: var(--c-muted); margin: 0 0 20px; }
.add { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-bottom: 20px; }
.add label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; }
.grp { margin-bottom: 20px; } .grp h2 { font-family: var(--font-body); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; margin: 0 0 8px; }
.grp[data-g="overdue"] h2 { color: var(--c-danger); }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
.grp[data-g="overdue"] .table { border-left: 3px solid var(--c-danger); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
.date { width: 170px; } .date b { display: block; font-weight: 500; color: var(--c-navy); } .date span { font-size: 12px; color: var(--c-muted); }
.co { color: var(--c-navy); font-weight: 500; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.red { color: var(--c-danger) !important; font-weight: 500; } .amber { color: var(--c-warn) !important; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .add { grid-template-columns: 1fr; } }
</style>
