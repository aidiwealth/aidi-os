<script setup lang="ts">
// A contact: properties and lists on the left; engagement chart, activity, notes and shared items on the right.
const id = useRoute().params.id as string
interface D { contact: { id: string; name: string; email: string; firm: string | null; title: string | null; phone: string | null; subscribed: boolean; custom: Record<string, string>; created_at: string }
  lists: { id: string; name: string }[]; deals: { id: string; investor: string; amount: number | null; pipeline_id: string; pipeline: string; currency: string; stage: string; color: string }[]
  activity: { id: string; kind: string; label: string; created_at: string }[]; notes: { id: string; body: string; created_at: string; by: string | null }[]; shared: { id: string; title: string; sent_at: string; opened_at: string | null; opens: number }[]
  fields: { key: string; label: string; type: string; options: string[] }[]; allLists: { id: string; name: string }[] }
const { data, refresh } = await useFetch<D>('/api/crm/contacts/' + id)
useHead({ title: () => data.value?.contact.name ?? 'Contact' })
const tab = ref<'engagement' | 'shared' | 'notes'>('engagement')
const gran = ref<'day' | 'week' | 'month'>('month')
const f = reactive({ name: '', email: '', firm: '', title: '', phone: '', subscribed: true, custom: {} as Record<string, string>, list_ids: [] as string[] })
watchEffect(() => { const c = data.value?.contact; if (c) Object.assign(f, { name: c.name, email: c.email, firm: c.firm ?? '', title: c.title ?? '', phone: c.phone ?? '', subscribed: c.subscribed, custom: { ...c.custom }, list_ids: (data.value?.lists ?? []).map((l) => l.id) }) })
const msg = ref(''); const saved = ref(false); const note = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function save() { msg.value = ''; try { await $fetch('/api/crm/contacts', { method: 'POST', body: { id, ...f } }); saved.value = true; setTimeout(() => (saved.value = false), 1500); await refresh() } catch (e) { msg.value = err(e) } }
async function addNote() { if (!note.value.trim()) return; try { await $fetch('/api/crm/notes', { method: 'POST', body: { contact_id: id, body: note.value } }); note.value = ''; await refresh() } catch (e) { msg.value = err(e) } }
const copied = ref(false); async function copy() { await navigator.clipboard.writeText(f.email); copied.value = true; setTimeout(() => (copied.value = false), 1200) }
const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
// engagement chart: last 12 periods
const buckets = computed(() => {
  const n = 12, now = new Date(), out: { label: string; key: string; v: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    if (gran.value === 'month') { d.setDate(1); d.setMonth(d.getMonth() - i) } else d.setDate(d.getDate() - i * (gran.value === 'week' ? 7 : 1))
    const key = gran.value === 'month' ? d.toISOString().slice(0, 7) : gran.value === 'week' ? wk(d) : d.toISOString().slice(0, 10)
    out.push({ key, v: 0, label: gran.value === 'month' ? d.toLocaleDateString('en-GB', { month: 'short' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })
  }
  for (const a of data.value?.activity ?? []) { if (a.kind === 'update_sent' || a.kind === 'note') continue; const d = new Date(a.created_at); const k = gran.value === 'month' ? d.toISOString().slice(0, 7) : gran.value === 'week' ? wk(d) : d.toISOString().slice(0, 10); const b = out.find((x) => x.key === k); if (b) b.v++ }
  return out
})
function wk(d: Date) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) }
const max = computed(() => Math.max(1, ...buckets.value.map((b) => b.v)))
const KIND: Record<string, string> = { update_opened: 'Update', update_sent: 'Sent', file_viewed: 'File', deck_viewed: 'Deck', note: 'Note' }
const when = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
</script>
<template>
  <section v-if="data">
    <NuxtLink to="/contacts" class="back">← Contacts</NuxtLink>
    <div class="lay">
      <aside class="card side">
        <div class="who"><span class="av">{{ initials(f.name || f.email) }}</span><div><h1>{{ data.contact.name }}</h1><span class="em">{{ data.contact.email }} <button class="cp" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button></span></div></div>
        <h3>Pipelines</h3>
        <NuxtLink v-for="d in data.deals" :key="d.id" :to="'/fundraising/pipelines/' + d.pipeline_id" class="dl"><b>{{ d.investor }}</b><span>{{ d.pipeline }} <span class="sc" :class="d.color">{{ d.stage }}</span>{{ d.amount ? ' · ' + (SYM[d.currency] ?? '') + d.amount.toLocaleString('en-US') : '' }}</span></NuxtLink>
        <p v-if="!data.deals.length" class="mut">Not in a pipeline yet.</p>
        <h3>Properties</h3>
        <form class="props" @submit.prevent="save">
          <label class="label">Name<input v-model="f.name" required maxlength="200"></label><label class="label">Email<input v-model="f.email" type="email" required maxlength="254"></label>
          <label class="label">Firm<input v-model="f.firm" maxlength="200"></label><label class="label">Title<input v-model="f.title" maxlength="120"></label><label class="label">Phone<input v-model="f.phone" maxlength="40"></label>
          <label v-for="fd in data.fields" :key="fd.key" class="label">{{ fd.label }}<select v-if="fd.type === 'select'" v-model="f.custom[fd.key]"><option value="">—</option><option v-for="o in fd.options" :key="o">{{ o }}</option></select><input v-else v-model="f.custom[fd.key]" :type="fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : fd.type === 'url' ? 'url' : 'text'" maxlength="500"></label>
          <div><span class="lb">Lists</span><div class="chips"><label v-for="l in data.allLists" :key="l.id" class="cb"><input v-model="f.list_ids" type="checkbox" :value="l.id"> {{ l.name }}</label><span v-if="!data.allLists.length" class="mut">No lists yet.</span></div></div>
          <label class="cb"><input v-model="f.subscribed" type="checkbox"> Receives investor updates</label>
          <button class="btn" type="submit">{{ saved ? 'Saved' : 'Save' }}</button><p v-if="msg" class="error">{{ msg }}</p>
        </form>
      </aside>
      <div class="main">
        <nav class="tabs"><button :class="{ on: tab === 'engagement' }" @click="tab = 'engagement'">Engagement</button><button :class="{ on: tab === 'shared' }" @click="tab = 'shared'">Shared items ({{ data.shared.length }})</button><button :class="{ on: tab === 'notes' }" @click="tab = 'notes'">Notes ({{ data.notes.length }})</button></nav>
        <template v-if="tab === 'engagement'">
          <div class="card"><div class="ch"><h3>Engagement trend</h3><div class="seg"><button v-for="[k, l] in [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months']]" :key="k" :class="{ on: gran === k }" @click="gran = k as 'day'">{{ l }}</button></div></div>
            <div class="bars"><div v-for="b in buckets" :key="b.key" class="bc"><span class="bv">{{ b.v || '' }}</span><i :style="{ height: (b.v / max) * 100 + '%' }" /><span class="bl">{{ b.label }}</span></div></div>
            <p class="mut">Opened updates and viewed deck and data room files.</p></div>
          <div class="card"><h3>Recent activity</h3><div v-for="a in data.activity" :key="a.id" class="act"><span class="kd" :class="a.kind">{{ KIND[a.kind] ?? a.kind }}</span><span class="al">{{ a.label }}</span><span class="mut">{{ when(a.created_at) }}</span></div><p v-if="!data.activity.length" class="mut">No activity yet. It appears when they open an update or view your deck or data room.</p></div>
        </template>
        <div v-else-if="tab === 'shared'" class="card"><h3>Updates sent</h3><div v-for="s in data.shared" :key="s.id + s.sent_at" class="act"><NuxtLink :to="'/updates/' + s.id" class="al">{{ s.title }}</NuxtLink><span class="mut">Sent {{ when(s.sent_at) }}</span><span :class="s.opened_at ? 'okk' : 'mut'">{{ s.opened_at ? 'Opened' + (s.opens > 1 ? ' ' + s.opens + '×' : '') : 'Not opened' }}</span></div><p v-if="!data.shared.length" class="mut">No updates sent to this contact yet.</p></div>
        <div v-else class="card"><form class="nf" @submit.prevent="addNote"><textarea v-model="note" rows="3" maxlength="5000" placeholder="Add a note: a call summary, their interests, next steps" /><button class="btn" type="submit" :disabled="!note.trim()">Add note</button></form>
          <div v-for="n in data.notes" :key="n.id" class="note"><p>{{ n.body }}</p><span class="mut">{{ n.by ?? 'Someone' }} · {{ when(n.created_at) }}</span></div><p v-if="!data.notes.length" class="mut">No notes yet.</p></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.back { display: inline-block; margin-bottom: 10px; color: var(--c-muted); } .lay { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; } .side { display: flex; flex-direction: column; gap: 10px; }
.who { display: flex; gap: 12px; align-items: center; } .who h1 { font-size: 24px; margin: 0; } .em { font-size: 13px; color: var(--c-muted); } .av { width: 54px; height: 54px; border-radius: 50%; background: #ece9fb; color: #4b3fb5; display: grid; place-items: center; font-size: 18px; font-weight: 600; flex: none; }
.cp { background: none; border: 0; padding: 0 0 0 4px; font: inherit; font-size: 12px; color: var(--c-blue-deep); cursor: pointer; } h3 { margin: 8px 0 4px; font-size: 17px; }
.dl { display: flex; flex-direction: column; text-decoration: none; color: var(--c-ink); padding: 6px 0; } .dl span { font-size: 13px; color: var(--c-ink-soft); }
.sc { font-size: 11.5px; padding: 1px 7px; margin-left: 4px; } .sc.grey { background: #eee; } .sc.blue { background: #e3edfb; color: #1c4f9c; } .sc.purple { background: #eee8fb; color: #5b3fb5; } .sc.teal { background: #def3f0; color: #146b5f; } .sc.amber { background: #fbf0dc; color: #8a5a0a; } .sc.green { background: #e0f2e7; color: #1f7a4d; } .sc.red { background: #fbe3e3; color: #a12a2a; }
.props { display: flex; flex-direction: column; gap: 9px; } label.label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } input, select, textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.lb { font-size: 12.5px; color: var(--c-muted); } .chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 5px; } .cb { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .cb input { width: auto; } .btn { align-self: flex-start; }
.main { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ch { display: flex; justify-content: space-between; align-items: center; } .seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { background: #fff; border: 0; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .seg button.on { background: var(--c-paper-2); font-weight: 500; }
.bars { display: grid; grid-template-columns: repeat(12, 1fr); gap: 8px; height: 220px; align-items: end; margin: 14px 0 6px; } .bc { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
.bc i { width: 70%; background: linear-gradient(180deg, #5b4be0, #a998f5); min-height: 2px; } .bv { font-size: 11px; color: var(--c-ink-soft); } .bl { font-size: 11px; color: var(--c-muted); }
.act { display: grid; grid-template-columns: 70px 1fr auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); align-items: center; font-size: 14px; } .al { color: var(--c-ink); }
.kd { font-size: 11.5px; padding: 2px 8px; background: var(--c-signal-soft); color: var(--c-blue-deep); text-align: center; } .kd.update_sent { background: var(--c-paper-2); color: var(--c-muted); } .kd.deck_viewed { background: #eee8fb; color: #5b3fb5; } .okk { color: var(--c-ok); font-size: 13px; }
.nf { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; } .note { border-top: 1px solid var(--c-rule); padding: 10px 0; } .note p { margin: 0 0 4px; white-space: pre-wrap; } .mut { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 1000px) { .lay { grid-template-columns: 1fr; } }
</style>
