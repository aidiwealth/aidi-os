<script setup lang="ts">
const id = useRoute().params.id as string
interface M { dpi: number | null; tvpi: number | null; irr: number | null }
interface D { lp: { id: string; name: string; kind: string; contact_name: string | null; email: string | null; country: string | null; kyc_status: string; notes: string | null; portal: boolean | null; portal_expires: string | null }
  positions: { fund_id: string; fund: string; currency: string; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: M }[]
  history: { id: string; fund: string; currency: string; kind: string; number: number; due_date: string; status: string; amount: string; paid_amount: string; paid_on: string | null }[] }
const { data, refresh } = await useFetch<D>('/api/funds/lps/' + id)
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
useHead({ title: () => data.value?.lp.name ?? 'LP' })
const { money, x, pct, day } = useMoney()
const f = reactive({ name: '', kind: 'individual', contact_name: '', email: '', country: '', kyc_status: 'pending', notes: '' })
watchEffect(() => { const l = data.value?.lp; if (l) Object.assign(f, { name: l.name, kind: l.kind, contact_name: l.contact_name ?? '', email: l.email ?? '', country: l.country ?? '', kyc_status: l.kyc_status, notes: l.notes ?? '' }) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const save = () => run(() => $fetch('/api/funds/lps', { method: 'POST', body: { id, ...f } }), 'Saved.')
const portal = () => run(() => $fetch('/api/funds/lps/' + id + '/portal', { method: 'POST' }), 'Portal link emailed to ' + f.email + '.')
const KIND: Record<string, string> = { individual: 'Individual', entity: 'Company or trust', institution: 'Institution', gp: 'GP commitment' }
</script>

<template>
  <section v-if="data">
    <NuxtLink to="/funds/lps" class="back">← LP register</NuxtLink>
    <div class="dh"><h1>{{ data.lp.name }}</h1><div class="acts"><button v-if="isGp" class="btn secondary" :disabled="busy || !data.lp.email" @click="portal">Email portal link</button><DeleteButton v-if="isGp" type="lp" :id="id" :name="data.lp.name" to="/funds/lps" /></div></div>
    <p class="meta">{{ KIND[data.lp.kind] }} · KYC {{ data.lp.kyc_status }}<template v-if="data.lp.portal"> · portal link active until {{ day(data.lp.portal_expires) }}</template></p>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div v-for="p in data.positions" :key="p.fund_id" class="card pos">
      <div class="ph"><NuxtLink :to="'/funds/' + p.fund_id"><h2>{{ p.fund }}</h2></NuxtLink><span>TVPI {{ x(p.m.tvpi) }} · DPI {{ x(p.m.dpi) }} · IRR {{ pct(p.m.irr) }}</span></div>
      <dl><div><dt>Commitment</dt><dd>{{ money(p.commitment, p.currency) }}</dd></div><div><dt>Called</dt><dd>{{ money(p.called, p.currency) }}</dd></div><div><dt>Paid in</dt><dd>{{ money(p.paidIn, p.currency) }}</dd></div>
        <div><dt>Unfunded</dt><dd>{{ money(p.unfunded, p.currency) }}</dd></div><div><dt>Distributed</dt><dd>{{ money(p.distributed, p.currency) }}</dd></div><div><dt>Share of NAV</dt><dd>{{ money(p.navShare, p.currency) }}</dd></div></dl>
    </div>
    <p v-if="!data.positions.length" class="muted">No commitments yet. Add one on a fund's page.</p>
    <div class="grid">
      <div class="card">
        <h2>Calls and distributions</h2>
        <table v-if="data.history.length" class="mini"><tbody><tr v-for="h in data.history" :key="h.id + h.kind"><td><NuxtLink :to="'/funds/calls/' + h.id">{{ h.kind === 'call' ? 'Call' : 'Distribution' }} {{ h.number }}</NuxtLink><span class="sub">{{ h.fund }} · {{ day(h.due_date) }}</span></td><td class="n">{{ money(h.amount, h.currency, true) }}<span class="sub">{{ Number(h.paid_amount) >= Number(h.amount) ? 'settled' : Number(h.paid_amount) ? 'part paid' : 'open' }}</span></td></tr></tbody></table>
        <p v-else class="muted">None yet.</p>
      </div>
      <form class="card frm" @submit.prevent="save">
        <h2>Details</h2>
        <label class="label">Name<input v-model="f.name" required maxlength="200" :disabled="!isGp"></label>
        <label class="label">Type<select v-model="f.kind" :disabled="!isGp"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Contact<input v-model="f.contact_name" maxlength="200" :disabled="!isGp"></label>
        <label class="label">Email<input v-model="f.email" type="email" maxlength="254" :disabled="!isGp"></label>
        <label class="label">Country<input v-model="f.country" maxlength="100" :disabled="!isGp"></label>
        <label class="label">KYC (as confirmed by your administrator)<select v-model="f.kyc_status" :disabled="!isGp"><option value="pending">Pending</option><option value="approved">Approved</option><option value="expired">Expired</option></select></label>
        <label class="label">Notes<textarea v-model="f.notes" rows="3" maxlength="3000" :disabled="!isGp" /></label>
        <button v-if="isGp" class="btn" type="submit" :disabled="busy">Save</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); } .meta { color: var(--c-muted); margin: 4px 0 16px; } .acts { display: flex; gap: 10px; }
.pos { margin-bottom: 12px; } .ph { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; } .ph span { font-size: 13px; color: var(--c-muted); }
dl { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 12px 0 0; } dt { font-size: 12px; color: var(--c-muted); } dd { margin: 2px 0 0; font-family: var(--font-heading); font-size: 20px; color: var(--c-navy); }
.grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin-top: 14px; align-items: start; } .grid h2 { margin-bottom: 10px; }
.mini { width: 100%; border-collapse: collapse; } .mini td { padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .n { text-align: right; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.frm { display: flex; flex-direction: column; gap: 10px; } .frm label { display: flex; flex-direction: column; gap: 5px; } .frm .btn { align-self: flex-start; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }
@media (max-width: 1000px) { dl { grid-template-columns: repeat(3, 1fr); } .grid { grid-template-columns: 1fr; } }
</style>
