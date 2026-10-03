<script setup lang="ts">
const id = useRoute().params.id as string
interface D { call: { id: string; fund_id: string; fund: string; currency: string; kind: string; number: number; purpose: string | null; total_amount: string; due_date: string; status: string; required_approvals: number; created_by: string | null; sent_at: string | null }
  lines: { id: string; lp_id: string; name: string; email: string | null; amount: string; paid_amount: string; paid_on: string | null }[]; approvals: { user_id: string; name: string; decided_at: string }[]; iAmGp: boolean; iApproved: boolean }
const { data, refresh } = await useFetch<D>('/api/funds/calls/' + id)
const { money, day } = useMoney()
const title = computed(() => data.value ? (data.value.call.kind === 'call' ? 'Capital call ' : 'Distribution ') + data.value.call.number : '')
useHead({ title: () => title.value || 'Notice' })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function act(action: string) {
  if (action === 'send' && !confirm('Mark ' + title.value + ' as sent? LPs get a Finvry update if that is switched on for this fund.')) return
  if (action === 'cancel' && !confirm('Cancel ' + title.value + '?')) return
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ notices?: number; lps?: number }>('/api/funds/calls/' + id + '/action', { method: 'POST', body: { action } }); ok.value = action === 'send' ? 'Marked as sent. ' + r.notices + ' of ' + r.lps + ' LPs were emailed a Finvry update.' : 'Done.'; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const pay = reactive<Record<string, { amount: string; on: string }>>({})
watchEffect(() => { for (const l of data.value?.lines ?? []) pay[l.id] ??= { amount: Number(l.paid_amount) ? l.paid_amount : l.amount, on: l.paid_on ?? new Date().toISOString().slice(0, 10) } })
async function record(lineId: string) {
  busy.value = true; msg.value = ''; ok.value = ''
  try { const r = await $fetch<{ completed: boolean }>('/api/funds/calls/' + id + '/payment', { method: 'POST', body: { line_id: lineId, paid_amount: pay[lineId]!.amount, paid_on: pay[lineId]!.on } }); ok.value = r.completed ? 'All settled: ' + title.value.toLowerCase() + ' is complete.' : 'Payment recorded.'; await refresh() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const ST: Record<string, string> = { draft: 'Draft', pending_approval: 'Awaiting approval', approved: 'Approved, ready to send', sent: 'Sent to LPs', completed: 'Completed', cancelled: 'Cancelled' }
const settled = computed(() => (data.value?.lines ?? []).reduce((s, l) => s + Number(l.paid_amount), 0))
</script>

<template>
  <section v-if="data">
    <NuxtLink :to="'/funds/' + data.call.fund_id" class="back">← {{ data.call.fund }}</NuxtLink>
    <div class="dh"><h1>{{ title }}</h1><DeleteButton v-if="data.iAmGp && ['draft', 'pending_approval', 'cancelled'].includes(data.call.status)" type="fund_call" :id="id" :name="title" :to="'/funds/' + data.call.fund_id" /></div>
    <p class="meta">{{ money(data.call.total_amount, data.call.currency, true) }} · {{ data.call.kind === 'call' ? 'due' : 'paid on' }} {{ day(data.call.due_date) }}<template v-if="data.call.purpose"> · {{ data.call.purpose }}</template></p>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="card status">
      <div><span class="label">Status</span><b :data-s="data.call.status">{{ ST[data.call.status] }}</b></div>
      <div><span class="label">GP approvals</span><b>{{ data.approvals.length }} of {{ data.call.required_approvals }}</b><em v-if="data.approvals.length">{{ data.approvals.map((a) => a.name).join(', ') }}</em></div>
      <div><span class="label">Settled</span><b>{{ money(settled, data.call.currency) }}</b><em>of {{ money(data.call.total_amount, data.call.currency) }}</em></div>
      <div v-if="data.iAmGp" class="acts">
        <button v-if="data.call.status === 'draft'" class="btn" :disabled="busy" @click="act('submit')">Submit for approval</button>
        <button v-if="data.call.status === 'pending_approval' && !data.iApproved" class="btn" :disabled="busy" @click="act('approve')">Approve</button>
        <span v-if="data.call.status === 'pending_approval' && data.iApproved" class="muted">You approved. Waiting for another GP.</span>
        <button v-if="data.call.status === 'approved'" class="btn" :disabled="busy" @click="act('send')">Mark as sent and update LPs</button>
        <button v-if="['draft', 'pending_approval', 'approved'].includes(data.call.status)" class="btn secondary" :disabled="busy" @click="act('cancel')">Cancel</button>
      </div>
    </div>
    <table class="table">
      <thead><tr><th>LP</th><th class="n">{{ data.call.kind === 'call' ? 'Due' : 'Their share' }}</th><th class="n">{{ data.call.kind === 'call' ? 'Received' : 'Paid out' }}</th><th>{{ ['sent', 'completed'].includes(data.call.status) ? 'Record payment' : '' }}</th></tr></thead>
      <tbody><tr v-for="l in data.lines" :key="l.id">
        <td><NuxtLink :to="'/funds/lps/' + l.lp_id" class="co">{{ l.name }}</NuxtLink><span class="sub">{{ l.email ?? 'no email: notice not sent' }}</span></td>
        <td class="n">{{ money(l.amount, data.call.currency, true) }}</td>
        <td class="n"><span :class="{ okc: Number(l.paid_amount) >= Number(l.amount), part: Number(l.paid_amount) > 0 && Number(l.paid_amount) < Number(l.amount) }">{{ money(l.paid_amount, data.call.currency, true) }}</span><span v-if="l.paid_on" class="sub">{{ day(l.paid_on) }}</span></td>
        <td><form v-if="['sent', 'completed'].includes(data.call.status) && pay[l.id]" class="pf" @submit.prevent="record(l.id)"><input v-model="pay[l.id]!.amount" inputmode="decimal" aria-label="Amount"><input v-model="pay[l.id]!.on" type="date" aria-label="Date"><button class="btn secondary sm" type="submit" :disabled="busy">Save</button></form></td>
      </tr></tbody>
    </table>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .meta { color: var(--c-muted); margin: 4px 0 16px; }
.status { display: flex; gap: 36px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; } .status > div { display: flex; flex-direction: column; gap: 2px; }
.status b { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); } .status b[data-s="completed"] { color: var(--c-ok); } .status em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.acts { flex-direction: row !important; gap: 10px !important; margin-left: auto; align-items: center; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; } .n { text-align: right; }
.co { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .okc { color: var(--c-ok); } .part { color: var(--c-warn); }
.pf { display: flex; gap: 6px; } .pf input { width: 130px; font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); } .btn.sm { height: 30px; padding: 0 10px; font-size: 13px; }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
</style>
