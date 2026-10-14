<script setup lang="ts">
// Team → People: staff and consultants, their agreements (draft with AI, upload signed, track status), pay schedule,
// what is due, and payments (also recorded under Payments with a voucher).
interface P { id: string; user_id: string | null; name: string; email: string | null; phone: string | null; kind: string; title: string | null; entity_id: string | null; entity: string | null; location: string | null; start_date: string | null; end_date: string | null; contract_end: string | null; pay_amount: number | null; currency: string; pay_frequency: string; pay_day: number; status: string; notes: string | null }
interface Ag { id: string; person_id: string; kind: string; title: string; document_id: string | null; status: string; starts_on: string | null; ends_on: string | null; signed_on: string | null; created_at: string }
interface Pay { id: string; person_id: string; period: string; amount: number; currency: string; paid_on: string; method: string | null; reference: string | null; expense_id: string | null; notes: string | null }
interface Due { person_id: string; name: string; due: string; period: string; amount: number; currency: string; overdue: boolean }
interface DocT { key: string; name: string; blurb: string; fields: { key: string; label: string; type?: string; options?: string[]; placeholder?: string; required?: boolean }[] }
const { data, refresh, error } = await useFetch<{ people: P[]; agreements: Ag[]; payments: Pay[]; due: Due[]; flags: Record<string, { level: string; text: string }[]>; monthly: Record<string, number>; paid_ytd: Record<string, number>; team: { id: string; name: string; email: string }[]; entities: { id: string; name: string }[]; docs: DocT[]; categories: string[] }>('/api/hr')
const KIND: Record<string, string> = { employee: 'Employee', consultant: 'Consultant', contractor: 'Contractor', intern: 'Intern', advisor: 'Advisor' }
const FREQ: Record<string, string> = { monthly: 'a month', biweekly: 'every 2 weeks', weekly: 'a week', quarterly: 'a quarter', per_invoice: 'per invoice', none: 'unpaid' }
const AST: Record<string, string> = { draft: 'Draft', sent: 'Sent for signing', signed: 'Signed', ended: 'Ended' }
const money = (v: number | null | undefined, c: string) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v))
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const per = (p: string) => (p.length === 7 ? new Date(p + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Week of ' + day(p))
const first = (r: Record<string, number>) => { const e = Object.entries(r)[0]; return e ? briefMoney(e[1], e[0]) : '—' }
const rest = (r: Record<string, number>) => Object.entries(r).slice(1).map(([c, v]) => '+ ' + briefMoney(v, c)).join(' ')
const msg = ref(''), ok = ref(''), busy = ref(false), filter = ref('active')
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.' }
const list = computed(() => (data.value?.people ?? []).filter((p) => filter.value === 'all' || (filter.value === 'active' ? p.status !== 'ended' : p.status === 'ended')))
const agOf = (id: string) => (data.value?.agreements ?? []).filter((a) => a.person_id === id)
const payOf = (id: string) => (data.value?.payments ?? []).filter((a) => a.person_id === id)
const contract = (id: string) => { const a = agOf(id); const s = a.find((x) => x.status === 'signed'); return s ? 'Signed' + (s.ends_on ? ' · ends ' + day(s.ends_on) : '') : a[0] ? AST[a[0].status] : 'None' }
const overdue = computed(() => (data.value?.due ?? []).filter((d) => d.overdue)), upcoming = computed(() => (data.value?.due ?? []).filter((d) => !d.overdue))
// Person form.
const blank = (): Partial<P> => ({ name: '', email: '', phone: '', user_id: '', kind: 'employee', title: '', entity_id: '', location: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', contract_end: '', pay_amount: null, currency: 'NGN', pay_frequency: 'monthly', pay_day: 25, status: 'active', notes: '' })
const pf = reactive<{ open: boolean; d: Partial<P> }>({ open: false, d: blank() })
const cur = ref<P | null>(null), view = ref<'profile' | 'agreements' | 'pay'>('profile')
function addPerson() { pf.d = blank(); cur.value = null; view.value = 'profile'; pf.open = true; msg.value = '' }
function openP(p: P, v: typeof view.value = 'profile') { cur.value = p; pf.d = Object.fromEntries(Object.entries(p).map(([k, x]) => [k, x ?? ''])) as Partial<P>; view.value = v; pf.open = true; msg.value = ''; dr.kind = ''; pay.open = false }
function fromTeam(id: string) { const u = data.value?.team.find((x) => x.id === id); if (u) { pf.d.user_id = u.id; if (!pf.d.name) pf.d.name = u.name; if (!pf.d.email) pf.d.email = u.email } }
async function savePerson(del = false) {
  if (del && !confirm('Remove ' + pf.d.name + ' and their agreements and payment log?')) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/hr/people', { method: 'POST', body: del ? { id: cur.value?.id, delete: true } : { ...pf.d, id: cur.value?.id } }); await refresh(); if (del) { pf.open = false; cur.value = null } else { cur.value = data.value?.people.find((x) => x.id === r.id) ?? null; ok.value = 'Saved.' } }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// Agreements: draft with AI from the profile, upload a signed copy, change status.
const dr = reactive<{ kind: string; a: Record<string, string> }>({ kind: '', a: {} })
const docT = computed(() => data.value?.docs.find((d) => d.key === dr.kind))
function startDraft(k: string) {
  const p = cur.value!; dr.kind = k
  const pay = p.pay_amount ? money(p.pay_amount, p.currency) + ' ' + FREQ[p.pay_frequency] + (p.pay_frequency === 'monthly' ? ', paid on the ' + p.pay_day + 'th' : '') : ''
  const pre: Record<string, string> = { employee: p.name, candidate: p.name, consultant: p.name, contractor: p.name, advisor: p.name, person: p.name, party: p.name, role: p.title ?? '', scope: p.title ?? '', services: p.title ?? '', salary: pay, fees: pay, payment: pay, start: p.start_date ?? '', location: p.location ?? '', term: p.contract_end ?? '' }
  dr.a = Object.fromEntries((docT.value?.fields ?? []).map((f) => [f.key, pre[f.key] ?? ''])); if (k === 'ip_assignment') dr.a.role = p.kind === 'employee' ? 'Employee' : 'Contractor'
}
async function draft() { busy.value = true; msg.value = ''; try { await $fetch('/api/hr/agreements', { method: 'POST', body: { person_id: cur.value!.id, kind: dr.kind, answers: dr.a } }); dr.kind = ''; ok.value = 'Drafted and saved as a PDF in Documents. Open it, check it, then send it for signing.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function setAg(a: Ag, status: string, extra: Record<string, string> = {}) { try { await $fetch('/api/hr/agreements', { method: 'POST', body: { id: a.id, status, ...extra } }); await refresh() } catch (e) { msg.value = err(e) } }
async function delAg(a: Ag) { if (!confirm('Remove "' + a.title + '"? The PDF stays in Documents.')) return; await $fetch('/api/hr/agreements', { method: 'POST', body: { id: a.id, delete: true } }); await refresh() }
const up = reactive({ kind: 'employment', signed_on: new Date().toISOString().slice(0, 10), ends_on: '' })
async function upload(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; busy.value = true; msg.value = ''; const fd = new FormData(); fd.append('file', file); fd.append('person_id', cur.value!.id); fd.append('kind', up.kind); fd.append('signed_on', up.signed_on); fd.append('ends_on', up.ends_on); try { await $fetch('/api/hr/agreements', { method: 'POST', body: fd }); ok.value = 'Signed agreement added.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = err(e) } }
// Payments.
const pay = reactive({ open: false, person_id: '', period: '', amount: '' as string | number, currency: 'USD', paid_on: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '', notes: '', record_payment: true, category: 'Salaries & contractors' })
function logPay(p: P | undefined, d?: Due) { if (!p) return; if (cur.value?.id !== p.id || !pf.open) openP(p, 'pay'); Object.assign(pay, { open: true, person_id: p.id, period: d?.period ?? new Date().toISOString().slice(0, 7), amount: d?.amount ?? p.pay_amount ?? '', currency: p.currency, paid_on: new Date().toISOString().slice(0, 10), reference: '', notes: '' }); view.value = 'pay' }
async function savePay() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ expense_id: string | null }>('/api/hr/payments', { method: 'POST', body: { ...pay, amount: Number(pay.amount) } }); pay.open = false; ok.value = r.expense_id ? 'Payment logged, with a voucher under Payments.' : 'Payment logged.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function delPay(x: Pay) { if (!confirm('Remove this payment from the log? (The entry under Payments stays.)')) return; await $fetch('/api/hr/payments', { method: 'POST', body: { id: x.id, delete: true } }); await refresh() }
const pOf = (id: string) => data.value?.people.find((p) => p.id === id)
</script>
<template>
  <div v-if="data" class="tp">
    <p v-if="error" class="error">Could not load people.</p>
    <div class="fx-stats">
      <StatTile icon="team" label="People" :value="data.people.filter((p) => p.status !== 'ended').length" :note="data.people.filter((p) => p.status !== 'ended' && p.kind === 'employee').length + ' staff · ' + data.people.filter((p) => p.status !== 'ended' && p.kind !== 'employee').length + ' consultants and others'" />
      <StatTile icon="wallet" label="Monthly people cost" :value="first(data.monthly)" :note="rest(data.monthly) || 'Active people, at current pay'" />
      <StatTile icon="billing" label="Paid this year" :value="first(data.paid_ytd)" :note="rest(data.paid_ytd) || 'Logged payments'" />
      <StatTile icon="gauge" :tone="overdue.length ? 'r' : 'n'" label="Pay overdue" :value="overdue.length" :red="!!overdue.length" :note="upcoming.length + ' due in the next 3 weeks'" />
    </div>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg && !pf.open" class="error">{{ msg }}</p>
    <div v-if="data.people.length" class="two">
      <div class="card pad0"><div class="ch"><h3>Pay due</h3><span class="mut">Last 3 months and the next 3 weeks</span></div>
        <div v-for="d in data.due.slice(0, 12)" :key="d.person_id + d.period" class="dr"><span class="dt" :class="{ red: d.overdue }"><b>{{ day(d.due) }}</b><em>{{ d.overdue ? 'Overdue' : 'Due' }}</em></span><span class="dn"><b>{{ d.name }}</b><em>{{ per(d.period) }}</em></span><span class="am">{{ money(d.amount, d.currency) }}</span><button class="btn secondary sm" @click="logPay(pOf(d.person_id), d)">Log payment</button></div>
        <p v-if="!data.due.length" class="mut pad">Nothing due.</p></div>
      <div class="card pad0"><div class="ch"><h3>Contracts to sort out</h3></div>
        <template v-for="(fl, id) in data.flags" :key="id"><button v-for="(x, i) in fl.filter((f) => f.text !== 'Pay overdue')" :key="i" class="fr" @click="openP(pOf(String(id))!, 'agreements')"><span class="dot" :class="x.level" /><b>{{ pOf(String(id))?.name }}</b><span>{{ x.text }}</span></button></template>
        <p v-if="!Object.values(data.flags).flat().some((f) => f.text !== 'Pay overdue')" class="mut pad">Every active person has a signed agreement.</p></div>
    </div>
    <div class="card pad0">
      <div class="ch"><div class="seg"><button v-for="[k, l] in [['active', 'Active'], ['ended', 'Left'], ['all', 'All']]" :key="k" :class="{ on: filter === k }" @click="filter = k">{{ l }}</button></div><button class="btn sm" @click="addPerson">Add a person</button></div>
      <table class="t" data-nosearch><thead><tr><th>Person</th><th>Company</th><th>Pay</th><th>Agreement</th><th>Last paid</th><th /></tr></thead>
        <tbody><tr v-for="p in list" :key="p.id" class="rw" @click="openP(p)"><td><b>{{ p.name }}</b><span class="sub">{{ p.title || KIND[p.kind] }} · {{ KIND[p.kind] }}{{ p.start_date ? ' · since ' + day(p.start_date) : '' }}</span></td><td>{{ p.entity ?? '—' }}</td>
          <td>{{ p.pay_amount ? money(p.pay_amount, p.currency) : '—' }}<span class="sub">{{ FREQ[p.pay_frequency] }}</span></td>
          <td>{{ contract(p.id) }}<span v-for="(x, i) in data.flags[p.id] ?? []" :key="i" class="sub" :class="x.level">{{ x.text }}</span></td>
          <td>{{ payOf(p.id)[0] ? day(payOf(p.id)[0]!.paid_on) : '—' }}<span v-if="payOf(p.id)[0]" class="sub">{{ per(payOf(p.id)[0]!.period) }}</span></td><td class="r"><button class="lk" @click.stop="logPay(p)">Log payment</button></td></tr></tbody></table>
      <EmptyState v-if="!list.length" compact icon="team" title="No one here yet" text="Add staff and consultants to track their agreements and pay." />
    </div>

    <AppModal :open="pf.open" :title="cur ? cur.name : 'Add a person'" wide @close="pf.open = false">
      <nav v-if="cur" class="tabs"><button v-for="[k, l] in [['profile', 'Profile'], ['agreements', 'Agreements (' + agOf(cur.id).length + ')'], ['pay', 'Pay (' + payOf(cur.id).length + ')']]" :key="k" :class="{ on: view === k }" @click="view = k as typeof view">{{ l }}</button></nav>
      <div v-if="view === 'profile'" class="ef">
        <div class="g3"><label class="label">Team member (optional)<select :value="pf.d.user_id ?? ''" @change="fromTeam(($event.target as HTMLSelectElement).value)"><option value="">Not a user of Aidi OS</option><option v-for="u in data.team" :key="u.id" :value="u.id">{{ u.name }}</option></select></label><label class="label">Full name<input v-model="pf.d.name" maxlength="200"></label><label class="label">Email<input v-model="pf.d.email" type="email" maxlength="254"></label></div>
        <div class="g3"><label class="label">Type<select v-model="pf.d.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label><label class="label">Job title<input v-model="pf.d.title" maxlength="120"></label><label class="label">Company (who employs or pays them)<select v-model="pf.d.entity_id"><option value="">Choose</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label></div>
        <div class="g3"><label class="label">Phone<input v-model="pf.d.phone" maxlength="40"></label><label class="label">Location<input v-model="pf.d.location" maxlength="120" placeholder="e.g. Lagos, remote"></label><label class="label">Status<select v-model="pf.d.status"><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="ended">Left</option></select></label></div>
        <div class="g3"><label class="label">Started<input v-model="pf.d.start_date" type="date"></label><label class="label">Contract ends (if fixed term)<input v-model="pf.d.contract_end" type="date"></label><label class="label">Left on<input v-model="pf.d.end_date" type="date"></label></div>
        <div class="g3"><label class="label">Pay<input v-model="pf.d.pay_amount" type="number" min="0"></label><label class="label">Currency<select v-model="pf.d.currency"><option v-for="c in ['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR']" :key="c">{{ c }}</option></select></label><label class="label">Paid<select v-model="pf.d.pay_frequency"><option v-for="(l, k) in FREQ" :key="k" :value="k">{{ l }}</option></select></label></div>
        <div class="g3"><label v-if="['monthly', 'quarterly'].includes(pf.d.pay_frequency ?? '')" class="label">Pay day (of the month)<input v-model="pf.d.pay_day" type="number" min="1" max="31"></label></div>
        <label class="label">Notes<textarea v-model="pf.d.notes" rows="3" maxlength="4000" placeholder="Bank details are best kept in the agreement or your bank, not here." /></label>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <div v-else-if="view === 'agreements' && cur" class="ef">
        <div v-for="a in agOf(cur.id)" :key="a.id" class="ag"><span class="an"><b>{{ a.title }}</b><em>{{ AST[a.status] }}{{ a.signed_on ? ' ' + day(a.signed_on) : '' }}{{ a.ends_on ? ' · ends ' + day(a.ends_on) : '' }} · added {{ day(a.created_at) }}</em></span>
          <span class="aa"><button v-if="a.document_id" class="lk" @click="openDoc(a.document_id)">Open PDF</button><button v-if="a.status === 'draft'" class="lk" @click="setAg(a, 'sent')">Mark sent</button><button v-if="a.status !== 'signed' && a.status !== 'ended'" class="lk" @click="setAg(a, 'signed')">Mark signed</button><button v-if="a.status === 'signed'" class="lk" @click="setAg(a, 'ended')">Mark ended</button><button class="lk red" @click="delAg(a)">Remove</button></span></div>
        <p v-if="!agOf(cur.id).length" class="mut">No agreements yet.</p>
        <div class="box"><p class="bh">Draft an agreement with AI</p><div class="chips"><button v-for="d in data.docs" :key="d.key" :class="{ on: dr.kind === d.key }" @click="startDraft(d.key)">{{ d.name }}</button></div>
          <template v-if="docT"><p class="mut">{{ docT.blurb }} Filled in from {{ cur.name }}'s profile; check each field.</p>
            <div class="g2"><label v-for="fl in docT.fields" :key="fl.key" class="label" :class="{ w: fl.type === 'textarea' }">{{ fl.label }}{{ fl.required ? ' *' : '' }}<textarea v-if="fl.type === 'textarea'" v-model="dr.a[fl.key]" rows="2" maxlength="4000" :placeholder="fl.placeholder" /><select v-else-if="fl.type === 'select'" v-model="dr.a[fl.key]"><option v-for="o in fl.options" :key="o">{{ o }}</option></select><input v-else v-model="dr.a[fl.key]" :type="fl.type === 'date' ? 'date' : 'text'" :placeholder="fl.placeholder" maxlength="4000"></label></div>
            <div class="ar"><button class="btn" :disabled="busy" @click="draft">{{ busy ? 'Drafting…' : 'Draft ' + docT.name.toLowerCase() }}</button><span class="mut">Saved as a PDF on Aidi letterhead under {{ cur.entity ?? 'the group' }} in Documents. Not legal advice: have it reviewed.</span></div></template></div>
        <div class="box"><p class="bh">Add a signed agreement</p><div class="g3"><label class="label">Type<select v-model="up.kind"><option v-for="d in data.docs" :key="d.key" :value="d.key">{{ d.name }}</option></select></label><label class="label">Signed on<input v-model="up.signed_on" type="date"></label><label class="label">Ends on (optional)<input v-model="up.ends_on" type="date"></label></div>
          <DropZone compact accept=".pdf,application/pdf" label="Drop the signed PDF here" @change="upload" /></div>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <div v-else-if="view === 'pay' && cur" class="ef">
        <div v-if="!pay.open" class="ar"><button class="btn sm" @click="logPay(cur)">Log a payment</button><span class="mut">{{ cur.pay_amount ? money(cur.pay_amount, cur.currency) + ' ' + FREQ[cur.pay_frequency] : 'No pay set' }}</span></div>
        <div v-else class="box"><p class="bh">Log a payment to {{ cur.name }}</p>
          <div class="g3"><label class="label">For (period)<input v-model="pay.period" :type="pay.period.length === 7 ? 'month' : 'date'"></label><label class="label">Amount<input v-model="pay.amount" type="number" min="0"></label><label class="label">Currency<select v-model="pay.currency"><option v-for="c in ['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR']" :key="c">{{ c }}</option></select></label></div>
          <div class="g3"><label class="label">Paid on<input v-model="pay.paid_on" type="date"></label><label class="label">Method<input v-model="pay.method" maxlength="60"></label><label class="label">Bank reference<input v-model="pay.reference" maxlength="120"></label></div>
          <label class="chk"><input v-model="pay.record_payment" type="checkbox"> Also record under Payments, with a payment voucher</label>
          <div class="ar"><button class="btn secondary" @click="pay.open = false">Cancel</button><button class="btn" :disabled="busy || !pay.amount" @click="savePay">{{ busy ? 'Saving…' : 'Log payment' }}</button></div></div>
        <table v-if="payOf(cur.id).length" class="t" data-nosearch><thead><tr><th>For</th><th>Paid on</th><th class="r">Amount</th><th>Reference</th><th /></tr></thead>
          <tbody><tr v-for="x in payOf(cur.id)" :key="x.id"><td>{{ per(x.period) }}</td><td>{{ day(x.paid_on) }}</td><td class="r">{{ money(x.amount, x.currency) }}</td><td>{{ x.reference || '—' }}<span v-if="x.expense_id" class="sub">On Payments</span></td><td class="r"><button class="lk red" @click="delPay(x)">Remove</button></td></tr></tbody></table>
        <p v-else class="mut">No payments logged yet.</p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <template #foot><template v-if="view === 'profile'"><button v-if="cur" class="btn secondary danger" :disabled="busy" @click="savePerson(true)">Remove</button><span class="sp" /><button class="btn secondary" @click="pf.open = false">Close</button><button class="btn" :disabled="busy || !pf.d.name" @click="savePerson()">{{ busy ? 'Saving…' : cur ? 'Save' : 'Add person' }}</button></template><template v-else><span class="sp" /><button class="btn secondary" @click="pf.open = false">Close</button></template></template>
    </AppModal>
  </div>
</template>
<style scoped>
.tp { display: flex; flex-direction: column; gap: 16px; }
.two { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; } .pad0 { padding: 0; overflow-x: auto; } .pad { padding: 12px 16px; margin: 0; }
.ch { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); } .ch h3 { margin: 0; font-size: 15px; } .mut { color: var(--c-muted); font-size: 13px; }
.dr { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--c-rule); }
.dt { display: flex; align-items: flex-start; flex-direction: column; font-size: 13px; } .dt em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .dt.red b, .dt.red em { color: var(--c-danger); }
.dr, .dn, .dt { text-align: left; } .dn { display: flex; align-items: flex-start; flex-direction: column; min-width: 0; } .dn b { font-size: 13.5px; font-weight: 600; } .dn em { font-style: normal; font-size: 12px; color: var(--c-muted); } .am { font-variant-numeric: tabular-nums; font-size: 13.5px; }
.fr { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--c-rule); padding: 10px 16px; font: inherit; font-size: 13.5px; cursor: pointer; } .fr:hover { background: var(--c-paper-3); } .fr span:last-child { color: var(--c-ink-soft); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; } .dot.red { background: var(--c-danger); } .dot.amber { background: #c98a0a; }
.seg { display: flex; border: 1px solid var(--c-rule-strong); } .seg button { font: inherit; font-size: 13px; padding: 5px 12px; background: #fff; border: 0; cursor: pointer; color: var(--c-ink-soft); } .seg button + button { border-left: 1px solid var(--c-rule-strong); } .seg button.on { background: var(--c-navy); color: #fff; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 9px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .t td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t .r { text-align: right; } .rw { cursor: pointer; } .rw:hover td { background: var(--c-paper-3); }
.sub { display: block; font-size: 12px; color: var(--c-muted); } .sub.red { color: var(--c-danger); } .sub.amber { color: #9a6700; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--c-rule); margin: -4px 0 14px; } .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0; font: inherit; font-size: 13.5px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .g2 .w { grid-column: 1 / -1; } .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.ef input:not([type="checkbox"]), .ef select, .ef textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
.ag { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .an { display: flex; flex-direction: column; min-width: 0; } .an b { font-size: 13.5px; font-weight: 600; } .an em { font-style: normal; font-size: 12px; color: var(--c-muted); } .aa { display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.box { border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 10px; } .bh { margin: 0; font-weight: 600; font-size: 14px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { font: inherit; font-size: 12.5px; padding: 5px 10px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; } .chips button.on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.ar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
@media (max-width: 900px) { .two, .g3, .g2 { grid-template-columns: 1fr; } }
</style>
