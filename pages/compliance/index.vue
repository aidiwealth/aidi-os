<script setup lang="ts">
// Compliance: filings, renewals and deadlines with a status strip, a month calendar and an agenda; add and mark done in popups.
import type { ObligationRow } from '~/server/api/compliance/index.get'
useHead({ title: 'Compliance' })
const { data, refresh } = await useFetch<ObligationRow[]>('/api/compliance')
const { data: me } = await useFetch<{ roles: string[]; org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
const company = computed(() => me.value?.org?.kind === 'company')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const canEdit = computed(() => (me.value?.roles ?? []).some((r) => ['admin', 'gp', 'team'].includes(r)))
const CAT: Record<string, string> = { tax: 'Tax', annual_return: 'Annual return', franchise_tax: 'Franchise tax', registered_agent: 'Registered agent', licence: 'Licence', regulatory: 'Regulatory', insurance: 'Insurance', banking: 'Banking', other: 'Other' }
const REC: Record<string, string> = { none: 'One-off', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Yearly' }
const JUR = [['US', 'United States (federal)'], ['US-DE', 'Delaware'], ['US-WY', 'Wyoming'], ['US-CA', 'California'], ['US-NY', 'New York'], ['NG', 'Nigeria'], ['NG-LA', 'Lagos State'], ['GB', 'United Kingdom'], ['', 'Other / none']]
const TEMPLATES = [
  { label: 'Delaware franchise tax and annual report (Inc)', title: 'Delaware franchise tax and annual report', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', md: [3, 1] },
  { label: 'Delaware LLC annual tax', title: 'Delaware LLC annual tax ($300)', category: 'franchise_tax', jurisdiction: 'US-DE', recurrence: 'annual', md: [6, 1] },
  { label: 'Federal return, C-Corp (Form 1120)', title: 'Federal corporate tax return (Form 1120)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [4, 15] },
  { label: 'Federal return, partnership LLC (Form 1065)', title: 'Federal partnership return (Form 1065)', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [3, 15] },
  { label: '1099-NEC to contractors', title: 'Form 1099-NEC to contractors', category: 'tax', jurisdiction: 'US', recurrence: 'annual', md: [1, 31] },
  { label: 'Registered agent renewal', title: 'Registered agent renewal', category: 'registered_agent', jurisdiction: 'US-DE', recurrence: 'annual', md: null },
  { label: 'Nigeria CAC annual returns', title: 'CAC annual returns', category: 'annual_return', jurisdiction: 'NG', recurrence: 'annual', md: [6, 30] },
  { label: 'Nigeria company income tax (FIRS)', title: 'Company income tax return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'annual', md: [6, 30] },
  { label: 'Nigeria VAT return (monthly)', title: 'VAT return (FIRS)', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', md: [0, 21] },
  { label: 'Nigeria PAYE remittance (monthly)', title: 'PAYE remittance', category: 'tax', jurisdiction: 'NG', recurrence: 'monthly', md: [0, 10] },
  { label: 'Insurance renewal', title: 'Insurance renewal', category: 'insurance', jurisdiction: '', recurrence: 'annual', md: null }]
function nextDate(md: number[] | null): string { const now = new Date(); const y = now.getUTCFullYear(); if (!md) return ''; if (md[0] === 0) { let d = new Date(Date.UTC(y, now.getUTCMonth(), md[1])); if (d < now) d = new Date(Date.UTC(y, now.getUTCMonth() + 1, md[1])); return d.toISOString().slice(0, 10) } let d = new Date(Date.UTC(y, md[0]! - 1, md[1])); if (d < now) d = new Date(Date.UTC(y + 1, md[0]! - 1, md[1])); return d.toISOString().slice(0, 10) }

const items = computed(() => (data.value ?? []).filter((o) => o.active))
const stats = computed(() => ({ overdue: items.value.filter((o) => o.days_left < 0).length, soon: items.value.filter((o) => o.days_left >= 0 && o.days_left <= 30).length, later: items.value.filter((o) => o.days_left > 30).length, done: (data.value ?? []).filter((o) => o.last_completed && o.last_completed.slice(0, 4) === String(new Date().getFullYear())).length }))
// calendar
const cur = ref(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)))
const monthLabel = computed(() => cur.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
const cells = computed(() => { const y = cur.value.getUTCFullYear(), m = cur.value.getUTCMonth(); const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); const out: (string | null)[] = Array(first).fill(null); for (let d = 1; d <= days; d++) out.push(new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)); return out })
const byDay = computed(() => { const m = new Map<string, ObligationRow[]>(); for (const o of items.value) m.set(o.next_due, [...(m.get(o.next_due) ?? []), o]); return m })
const today = new Date().toISOString().slice(0, 10)
const pickDay = ref('')
function shift(n: number) { cur.value = new Date(Date.UTC(cur.value.getUTCFullYear(), cur.value.getUTCMonth() + n, 1)); pickDay.value = '' }
const filter = ref<'all' | 'overdue' | 'soon' | 'later'>('all')
const agenda = computed(() => { let l = items.value; if (pickDay.value) l = l.filter((o) => o.next_due === pickDay.value); else if (filter.value === 'overdue') l = l.filter((o) => o.days_left < 0); else if (filter.value === 'soon') l = l.filter((o) => o.days_left >= 0 && o.days_left <= 30); else if (filter.value === 'later') l = l.filter((o) => o.days_left > 30)
  const g = new Map<string, ObligationRow[]>(); for (const o of [...l].sort((a, b) => a.next_due.localeCompare(b.next_due))) { const k = o.days_left < 0 ? 'Overdue' : new Date(o.next_due + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); g.set(k, [...(g.get(k) ?? []), o]) } return [...g.entries()] })
const nextUp = computed(() => [...items.value].filter((o) => o.days_left >= 0).sort((a, b) => a.days_left - b.days_left)[0] ?? null)
const q = ref('')
const shown = computed(() => agenda.value.map(([g, l]) => [g, l.filter((o) => !q.value || (o.title + ' ' + (o.entity ?? '') + ' ' + (o.jurisdiction ?? '')).toLowerCase().includes(q.value.toLowerCase()))] as [string, ObligationRow[]]).filter(([, l]) => l.length))
const tone = (o: ObligationRow) => (o.days_left < 0 ? 'red' : o.days_left <= 7 ? 'amber' : o.days_left <= 30 ? 'blue' : 'grey')
const when = (n: number) => (n < 0 ? Math.abs(n) + ' day' + (n === -1 ? '' : 's') + ' overdue' : n === 0 ? 'Due today' : 'In ' + n + ' day' + (n === 1 ? '' : 's'))
const dd = (d: string) => new Date(d + 'T00:00:00Z').getUTCDate(); const mon = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
// add
const adding = ref(false); const tpl = ref(''); const err = ref('')
const blank = () => ({ entity_id: entities.value?.[0]?.id ?? '', title: '', category: 'tax', jurisdiction: 'US', recurrence: 'annual', next_due: '', reminder_days: 14, notes: '' })
const form = reactive(blank())
function openAdd() { Object.assign(form, blank()); tpl.value = ''; err.value = ''; adding.value = true }
watch(tpl, (i) => { const t = TEMPLATES[Number(i)]; if (t) Object.assign(form, { title: t.title, category: t.category, jurisdiction: t.jurisdiction, recurrence: t.recurrence, next_due: nextDate(t.md) || form.next_due }) })
async function add() { err.value = ''; try { await $fetch('/api/compliance', { method: 'POST', body: { ...form, jurisdiction: form.jurisdiction || undefined, notes: form.notes || undefined, owner_id: null } }); adding.value = false; await refresh() } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
// mark done
const doneFor = ref<ObligationRow | null>(null); const doneForm = reactive({ completed_on: today, note: '' })
function openDone(o: ObligationRow) { doneFor.value = o; doneForm.completed_on = today; doneForm.note = '' }
async function markDone() { if (!doneFor.value) return; err.value = ''; try { await $fetch('/api/compliance/' + doneFor.value.id + '/complete', { method: 'POST', body: { completed_on: doneForm.completed_on, note: doneForm.note || undefined } }); doneFor.value = null; await refresh() } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
</script>

<template>
  <section class="cp">
    <p class="label">{{ company ? 'Company' : 'Family Office' }}</p>
    <div class="head"><div><h1>Compliance</h1><p class="lead">{{ company ? 'Your filings and renewals. We email you before each deadline.' : 'Filings, renewals and deadlines for every entity. Owners are emailed before each one.' }}</p></div>
      <div class="tools"><NuxtLink v-if="company" to="/client/order" class="btn secondary">Get help filing</NuxtLink><button v-if="canEdit" class="btn" type="button" @click="openAdd">Add reminder</button></div></div>

    <div class="stats">
      <button class="st" :class="{ on: filter === 'overdue' }" @click="filter = filter === 'overdue' ? 'all' : 'overdue'; pickDay = ''"><span class="si red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg></span><span class="sx"><em>Overdue</em><b :class="{ red: stats.overdue }">{{ stats.overdue }}</b><i>{{ stats.overdue ? 'Needs action' : 'All clear' }}</i></span></button>
      <button class="st" :class="{ on: filter === 'soon' }" @click="filter = filter === 'soon' ? 'all' : 'soon'; pickDay = ''"><span class="si amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><span class="sx"><em>Due in 30 days</em><b>{{ stats.soon }}</b><i>Coming up</i></span></button>
      <button class="st" :class="{ on: filter === 'later' }" @click="filter = filter === 'later' ? 'all' : 'later'; pickDay = ''"><span class="si blue"><AppIcon name="compliance" /></span><span class="sx"><em>Later</em><b>{{ stats.later }}</b><i>Scheduled</i></span></button>
      <div class="st static"><span class="si green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span><span class="sx"><em>Done this year</em><b>{{ stats.done }}</b><i>Filed</i></span></div>
    </div>

    <div class="grid">
      <div class="listc">
        <div class="lh"><div class="tabs"><button v-for="[k, l] in [['all', 'Upcoming'], ['overdue', 'Overdue'], ['soon', 'Next 30 days'], ['later', 'Later']]" :key="k" :class="{ on: filter === k && !pickDay }" @click="filter = k as 'all'; pickDay = ''">{{ l }}</button>
          <span v-if="pickDay" class="dayc">{{ new Date(pickDay + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) }} <button aria-label="Clear day" @click="pickDay = ''">×</button></span></div>
          <input v-model="q" placeholder="Search filings" aria-label="Search"></div>
        <div v-for="[g, list] in shown" :key="g" class="grp"><p class="gh" :class="{ red: g === 'Overdue' }">{{ g }} <span>{{ list.length }}</span></p>
          <div class="rows">
            <div v-for="o in list" :key="o.id" class="row">
              <span class="db" :class="tone(o)"><em>{{ mon(o.next_due) }}</em><b>{{ dd(o.next_due) }}</b></span>
              <span class="bd"><NuxtLink :to="'/compliance/' + o.id" class="tt">{{ o.title }}</NuxtLink>
                <span class="meta">{{ CAT[o.category] ?? o.category }}<template v-if="o.jurisdiction"> · {{ o.jurisdiction }}</template> · {{ REC[o.recurrence] }}<template v-if="!company && o.entity"> · {{ o.entity }}</template><template v-if="o.last_completed"> · last done {{ new Date(o.last_completed + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }}</template></span></span>
              <span class="pill" :class="tone(o)">{{ when(o.days_left) }}</span>
              <button v-if="canEdit" type="button" class="btn secondary sm" @click="openDone(o)">Mark done</button></div>
          </div></div>
        <EmptyState v-if="!shown.length" card icon="compliance" :title="items.length ? 'Nothing here' : 'No reminders yet'" :text="items.length ? 'Pick another tab or day.' : company ? 'Set your company type in Settings to add the usual filings automatically, or add one yourself.' : 'Add your first filing, for example Delaware franchise tax.'">
          <NuxtLink v-if="company && !items.length" to="/settings" class="btn secondary">Set company type</NuxtLink><button v-if="canEdit && !items.length" class="btn" @click="openAdd">Add reminder</button></EmptyState>
      </div>
      <aside class="side">
        <div v-if="nextUp" class="card nx"><p class="nl">Next deadline</p><b>{{ nextUp.title }}</b><span>{{ new Date(nextUp.next_due + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) }}</span><span class="pill" :class="tone(nextUp)">{{ when(nextUp.days_left) }}</span>
          <button v-if="canEdit" type="button" class="btn sm" @click="openDone(nextUp)">Mark done</button></div>
        <div class="card cal">
          <div class="ch"><button type="button" aria-label="Previous month" @click="shift(-1)"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 5-5 5 5 5" /></svg></button><b>{{ monthLabel }}</b><button type="button" aria-label="Next month" @click="shift(1)"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 5 5 5-5 5" /></svg></button></div>
          <div class="wk"><span v-for="d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="d + Math.random()">{{ d }}</span></div>
          <div class="days"><template v-for="(c, i) in cells" :key="i"><span v-if="!c" class="d blank" /><button v-else type="button" class="d" :class="{ today: c === today, sel: c === pickDay, has: byDay.has(c) }" @click="pickDay = pickDay === c ? '' : c; filter = 'all'">
            <span class="n">{{ dd(c) }}</span><span class="dots"><i v-for="o in (byDay.get(c) ?? []).slice(0, 3)" :key="o.id" :class="tone(o)" /></span></button></template></div>
          <p class="legend"><span><i class="red" /> Overdue</span><span><i class="amber" /> This week</span><span><i class="blue" /> 30 days</span><span><i class="grey" /> Later</span></p>
        </div>
      </aside>
    </div>

    <AppModal :open="adding" title="Add a reminder" @close="adding = false">
      <form id="addf" class="frm" @submit.prevent="add">
        <label class="label wide">Start from a common filing<select v-model="tpl"><option value="">— Blank —</option><option v-for="(t, i) in TEMPLATES" :key="i" :value="String(i)">{{ t.label }}</option></select></label>
        <label v-if="!company" class="label wide">Entity<select v-model="form.entity_id" required><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <label class="label wide">Title<input v-model="form.title" required maxlength="200"></label>
        <label class="label">Type<select v-model="form.category"><option v-for="(l, k) in CAT" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Where<select v-model="form.jurisdiction"><option v-for="[k, l] in JUR" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">How often<select v-model="form.recurrence"><option v-for="(l, k) in REC" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Next due<input v-model="form.next_due" type="date" required></label>
        <label class="label wide">Remind me<select v-model.number="form.reminder_days"><option :value="3">3 days before</option><option :value="7">1 week before</option><option :value="14">2 weeks before</option><option :value="30">1 month before</option><option :value="60">2 months before</option></select></label>
        <label class="label wide">Notes<textarea v-model="form.notes" rows="2" maxlength="3000" placeholder="Portal, reference numbers, adviser, fees" /></label>
        <p v-if="err" class="error wide">{{ err }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="adding = false">Cancel</button><button class="btn" type="submit" form="addf">Save reminder</button></template>
    </AppModal>
    <AppModal :open="!!doneFor" :title="doneFor ? 'Mark done: ' + doneFor.title : ''" @close="doneFor = null">
      <div class="frm"><label class="label">Done on<input v-model="doneForm.completed_on" type="date"></label><label class="label wide">Note (optional)<textarea v-model="doneForm.note" rows="2" maxlength="2000" placeholder="e.g. Filed online, confirmation number" /></label>
        <p class="muted wide">{{ doneFor?.recurrence !== 'none' ? 'The next ' + (REC[doneFor?.recurrence ?? ''] ?? '').toLowerCase() + ' deadline is set automatically.' : 'This one-off item will be marked finished.' }}</p><p v-if="err" class="error wide">{{ err }}</p></div>
      <template #foot><button class="btn secondary" type="button" @click="doneFor = null">Cancel</button><button class="btn" type="button" @click="markDone">Mark done</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; } .head h1 { margin: 0; } .lead { color: var(--c-muted); margin: 4px 0 0; } .tools { display: flex; gap: 8px; } .tools a { text-decoration: none; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; } .st { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; text-align: left; font: inherit; cursor: pointer; transition: border-color .12s, box-shadow .12s; }
.st:hover:not(.static) { border-color: var(--c-rule-strong); } .st.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .st.static { cursor: default; }
.si { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none; } .si svg, .si :deep(svg) { width: 21px; height: 21px; } .si.red { background: rgba(180,35,24,.08); color: var(--c-danger); } .si.amber { background: rgba(181,71,8,.09); color: var(--c-warn); } .si.blue { background: var(--c-signal-soft); color: var(--c-blue-deep); } .si.green { background: rgba(31,122,77,.1); color: var(--c-ok); }
.sx { display: flex; flex-direction: column; gap: 1px; } .sx em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .sx b { font-size: 26px; font-weight: 600; letter-spacing: -.02em; line-height: 1.15; color: var(--c-ink); } .sx b.red { color: var(--c-danger); } .sx i { font-style: normal; font-size: 12px; color: var(--c-muted); }
.grid { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.lh { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid var(--c-rule); margin-bottom: 6px; flex-wrap: wrap; } .tabs { display: flex; gap: 20px; align-items: center; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.dayc { font-size: 12.5px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 3px 4px 3px 10px; } .dayc button { background: none; border: 0; cursor: pointer; color: inherit; font-size: 15px; } .lh input { font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 200px; margin-bottom: 6px; }
.gh { font-size: 12px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .07em; margin: 18px 0 8px; } .gh.red { color: var(--c-danger); } .gh span { background: var(--c-paper-2); color: var(--c-ink-soft); padding: 1px 7px; margin-left: 4px; letter-spacing: 0; }
.rows { background: #fff; border: 1px solid var(--c-rule); } .row { display: flex; gap: 14px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--c-rule); transition: background .1s; } .row:last-child { border-bottom: 0; } .row:hover { background: #fbfaf7; }
.db { width: 44px; flex: none; border: 1px solid var(--c-rule-strong); text-align: center; display: flex; flex-direction: column; background: #fff; } .db em { font-style: normal; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; padding: 2px 0; background: var(--c-paper-2); color: var(--c-ink-soft); } .db b { font-size: 18px; font-weight: 600; padding: 3px 0; color: var(--c-ink); }
.db.red em { background: var(--c-danger); color: #fff; } .db.amber em { background: var(--c-warn); color: #fff; } .db.blue em { background: var(--c-blue-deep); color: #fff; }
.bd { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } .tt { font-weight: 600; color: var(--c-ink); text-decoration: none; font-size: 14.5px; } .tt:hover { color: var(--c-blue-deep); } .meta { font-size: 12.5px; color: var(--c-muted); }
.pill { font-size: 12px; font-weight: 500; padding: 3px 10px; white-space: nowrap; background: var(--c-paper-2); color: var(--c-ink-soft); } .pill.red { background: rgba(180,35,24,.08); color: var(--c-danger); } .pill.amber { background: rgba(181,71,8,.09); color: var(--c-warn); } .pill.blue { background: var(--c-signal-soft); color: var(--c-blue-deep); }
.btn.sm { height: 32px; padding: 0 12px; font-size: 13px; } .side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.nx { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; } .nl { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--c-muted); margin: 0; } .nx b { font-size: 16px; } .nx > span:not(.pill) { font-size: 13px; color: var(--c-ink-soft); } .nx .btn { margin-top: 6px; }
.ch { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } .ch b { font-size: 15px; font-weight: 600; } .ch button { width: 30px; height: 30px; border: 1px solid var(--c-rule); background: #fff; cursor: pointer; display: grid; place-items: center; } .ch button svg { width: 16px; height: 16px; }
.wk, .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; } .wk span { font-size: 11px; color: var(--c-muted); text-align: center; padding: 4px 0; }
.d { aspect-ratio: 1; border: 1px solid transparent; background: transparent; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0; } .d:hover { background: var(--c-paper-2); } .d.blank { cursor: default; }
.d .n { font-size: 12.5px; width: 24px; height: 24px; display: grid; place-items: center; } .d.has .n { font-weight: 600; } .d.today .n { background: var(--c-navy); color: #fff; border-radius: 50%; } .d.sel { border-color: var(--c-navy); }
.dots { display: flex; gap: 2px; height: 4px; } .dots i, .legend i { width: 4px; height: 4px; border-radius: 50%; display: inline-block; } i.red { background: var(--c-danger); } i.amber { background: var(--c-warn); } i.blue { background: var(--c-blue-deep); } i.grey { background: #a3a3a8; }
.legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--c-muted); margin: 12px 0 0; } .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 6px; height: 6px; }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .frm .wide { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; } input, select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.muted { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .side { position: static; order: -1; } .stats { grid-template-columns: 1fr 1fr; } }
</style>
