<script setup lang="ts">
const id = useRoute().params.id as string
interface Ob { id: string; entity_id: string; entity: string; title: string; category: string; jurisdiction: string | null; recurrence: string; next_due: string; days_left: number; reminder_days: number; owner_id: string | null; notes: string | null; active: boolean }
interface H { id: string; due_date: string; completed_on: string; note: string | null; by_name: string | null; document_id: string | null; document_title: string | null }
const { data, error, refresh } = await useFetch<{ obligation: Ob; history: H[] }>('/api/compliance/' + id)
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: people } = await useFetch<{ id: string; name: string }[]>('/api/pipeline/people')
const { data: docs } = await useFetch<{ id: string; title: string }[]>('/api/documents')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'gp', 'team'].includes(r)))
useHead({ title: () => (data.value?.obligation.title ?? 'Obligation') })
const CAT: Record<string, string> = { tax: 'Tax', annual_return: 'Annual return', franchise_tax: 'Franchise tax', registered_agent: 'Registered agent', licence: 'Licence', regulatory: 'Regulatory filing', insurance: 'Insurance', banking: 'Banking / KYC', other: 'Other' }
const REC: Record<string, string> = { none: 'One-off', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' }
const busy = ref(false)
const msg = ref('')
const ok = ref('')
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
const done = reactive({ completed_on: new Date().toISOString().slice(0, 10), note: '', document_id: '' })
async function complete() {
  busy.value = true; msg.value = ''; ok.value = ''
  try {
    const r = await $fetch<{ next_due: string | null }>('/api/compliance/' + id + '/complete', { method: 'POST', body: { ...done, note: done.note || undefined } })
    ok.value = r.next_due ? 'Done. Next due ' + day(r.next_due) + '.' : 'Done. This one-off obligation is now finished.'
    done.note = ''; done.document_id = ''; await refresh()
  } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
const edit = reactive({ entity_id: '', title: '', category: 'tax', jurisdiction: '', recurrence: 'annual', next_due: '', reminder_days: 14, owner_id: '', notes: '', active: true })
const editing = ref(false)
watchEffect(() => { const o = data.value?.obligation; if (!o || editing.value) return; Object.assign(edit, { entity_id: o.entity_id, title: o.title, category: o.category, jurisdiction: o.jurisdiction ?? '', recurrence: o.recurrence, next_due: o.next_due, reminder_days: o.reminder_days, owner_id: o.owner_id ?? '', notes: o.notes ?? '', active: o.active }) })
async function save() {
  busy.value = true; msg.value = ''; ok.value = ''
  try { await $fetch('/api/compliance', { method: 'POST', body: { id, ...edit, owner_id: edit.owner_id || null, jurisdiction: edit.jurisdiction || undefined, notes: edit.notes || undefined } }); editing.value = false; ok.value = 'Saved.'; await refresh() }
  catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
async function openDoc(docId: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + docId + '/download'); window.location.href = r.url } catch (e) { msg.value = errText(e) } }
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/compliance" class="back">← Compliance</NuxtLink>
    <p class="label">{{ data.obligation.entity }} · {{ CAT[data.obligation.category] }} · {{ REC[data.obligation.recurrence] }}<template v-if="data.obligation.jurisdiction"> · {{ data.obligation.jurisdiction }}</template></p>
    <h1>{{ data.obligation.title }}</h1>
    <div class="due card" :data-s="!data.obligation.active ? 'done' : data.obligation.days_left < 0 ? 'late' : data.obligation.days_left <= 7 ? 'soon' : 'ok'">
      <template v-if="data.obligation.active">
        <span class="label">Next due</span><b>{{ day(data.obligation.next_due) }}</b>
        <span>{{ data.obligation.days_left < 0 ? Math.abs(data.obligation.days_left) + ' days overdue' : data.obligation.days_left === 0 ? 'Due today' : 'In ' + data.obligation.days_left + ' days' }} · reminder {{ data.obligation.reminder_days }} days before</span>
      </template>
      <template v-else><span class="label">Status</span><b>Finished</b></template>
    </div>
    <p v-if="data.obligation.notes" class="notes">{{ data.obligation.notes }}</p>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <div class="grid">
      <div class="col">
        <form v-if="canEdit && data.obligation.active" class="card frm" @submit.prevent="complete">
          <h2>Mark as done</h2>
          <label class="label">Completed on<input v-model="done.completed_on" type="date" required></label>
          <label class="label">Proof (optional)<select v-model="done.document_id"><option value="">No document</option><option v-for="d in docs ?? []" :key="d.id" :value="d.id">{{ d.title }}</option></select></label>
          <label class="label">Note<textarea v-model="done.note" rows="2" maxlength="2000" placeholder="Confirmation number, amount paid" /></label>
          <button class="btn" type="submit" :disabled="busy">Mark done{{ data.obligation.recurrence !== 'none' ? ' and roll to next date' : '' }}</button>
          <p class="hint">Upload the receipt or filing on Documents first to attach it here.</p>
        </form>
        <div class="card">
          <h2>History</h2>
          <ul class="hist"><li v-for="h in data.history" :key="h.id">
            <b>Due {{ day(h.due_date) }}</b> · done {{ day(h.completed_on) }}<template v-if="h.by_name"> by {{ h.by_name }}</template>
            <span v-if="h.note">{{ h.note }}</span>
            <button v-if="h.document_id" type="button" class="link" @click="openDoc(h.document_id)">{{ h.document_title }}</button>
          </li></ul>
          <p v-if="!data.history.length" class="muted">Not completed yet.</p>
        </div>
      </div>
      <div class="col">
        <div v-if="canEdit" class="card">
          <div class="row"><h2>Details</h2><button v-if="!editing" type="button" class="link" @click="editing = true">Edit</button></div>
          <form v-if="editing" class="frm" @submit.prevent="save">
            <label class="label">Entity<select v-model="edit.entity_id"><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
            <label class="label">Title<input v-model="edit.title" required maxlength="200"></label>
            <label class="label">Type<select v-model="edit.category"><option v-for="(l, k) in CAT" :key="k" :value="k">{{ l }}</option></select></label>
            <label class="label">How often<select v-model="edit.recurrence"><option v-for="(l, k) in REC" :key="k" :value="k">{{ l }}</option></select></label>
            <label class="label">Next due<input v-model="edit.next_due" type="date" required></label>
            <label class="label">Remind (days before)<input v-model.number="edit.reminder_days" type="number" min="0" max="120"></label>
            <label class="label">Owner<select v-model="edit.owner_id"><option value="">No owner</option><option v-for="p in people ?? []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
            <label class="label">Jurisdiction<input v-model="edit.jurisdiction" maxlength="20"></label>
            <label class="label">Notes<textarea v-model="edit.notes" rows="3" maxlength="3000" /></label>
            <label class="chk"><input v-model="edit.active" type="checkbox"> Active</label>
            <div class="row"><button class="btn" type="submit" :disabled="busy">Save</button><button class="btn secondary" type="button" @click="editing = false">Cancel</button></div>
          </form>
          <p v-else class="muted">Change the date, owner, reminder or recurrence.</p>
        </div>
      </div>
    </div>
  </section>
  <p v-else-if="error" class="error" role="alert">{{ error.statusCode === 404 ? 'Not found.' : 'Could not load this obligation.' }}</p>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--c-muted); text-decoration: none; }
h1 { margin-bottom: 16px; } h2 { margin-bottom: 12px; }
.due { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; border-left: 4px solid var(--c-blue); }
.due b { font-weight: 500; letter-spacing: -0.02em; font-size: 28px; color: var(--c-navy); } .due span:last-child { font-size: 13px; color: var(--c-muted); }
.due[data-s="late"] { border-left-color: var(--c-danger); } .due[data-s="late"] b { color: var(--c-danger); }
.due[data-s="soon"] { border-left-color: var(--c-warn); } .due[data-s="done"] { border-left-color: var(--c-ok); }
.notes { white-space: pre-wrap; color: var(--c-ink-soft); background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 12px 16px; }
.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 20px; }
.frm { display: flex; flex-direction: column; gap: 12px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .frm .btn { align-self: flex-start; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chk { flex-direction: row !important; align-items: center; gap: 8px; font-size: 13px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.hist { list-style: none; padding: 0; margin: 0; } .hist li { padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .hist span { display: block; color: var(--c-muted); font-size: 13px; margin-top: 2px; }
.hint { font-size: 12px; color: var(--c-muted); margin: 0; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
