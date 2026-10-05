<script setup lang="ts">
useHead({ title: 'Funds' })
interface F { entity_id: string; name: string; fund_id: string | null; currency?: string; status?: string; vintage?: number | null; target?: number; lps?: number
  totals?: { committed: number; called: number; paidIn: number; distributed: number; nav: number; calledPct: number }; m?: { dpi: number | null; tvpi: number | null; irr: number | null } }
const { data, refresh } = await useFetch<F[]>('/api/funds')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
const { money, x, pct } = useMoney()
const setup = reactive({ entity_id: '', name: '', currency: 'USD', target_size: '', vintage: String(new Date().getFullYear()), status: 'raising', administrator: 'self' })
const msg = ref('')
async function doSetup() {
  msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/funds/setup', { method: 'POST', body: { ...setup, entity_id: setup.entity_id && setup.entity_id !== 'new' ? setup.entity_id : undefined, name: setup.entity_id === 'new' || !setup.entity_id ? setup.name : undefined } }); await navigateTo('/funds/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not set up the fund.' }
}
const pending = computed(() => (data.value ?? []).filter((f) => !f.fund_id))
const STATUS: Record<string, string> = { raising: 'Raising', investing: 'Investing', harvesting: 'Harvesting', closed: 'Closed' }
void refresh
const setupOpen = ref(false)
</script>

<template>
  <section v-if="data">
    <p class="label">Venture Capital</p>
    <div class="head"><h1>Funds &amp; LPs</h1><div class="tools"><NuxtLink to="/funds/lps" class="btn secondary">LP register</NuxtLink><button v-if="isGp" class="btn" type="button" @click="setupOpen = true">{{ pending.length ? 'Set up a fund' : 'Add a fund' }}</button></div></div>
    <div v-if="data.some((x) => x.fund_id)" class="dk"><div class="k"><em>Funds</em><b>{{ data.filter((x) => x.fund_id).length }}</b></div><div class="k"><em>LPs</em><b>{{ data.reduce((a, f) => a + (f.lps ?? 0), 0) }}</b></div><div class="k"><em>Committed</em><b>{{ money(data.filter((x) => x.fund_id).reduce((a, f) => a + (f.totals?.committed ?? 0), 0), data.find((x) => x.fund_id)?.currency ?? 'USD') }}</b></div><div class="k"><em>Distributed</em><b>{{ money(data.filter((x) => x.fund_id).reduce((a, f) => a + (f.totals?.distributed ?? 0), 0), data.find((x) => x.fund_id)?.currency ?? 'USD') }}</b></div></div>
    <div class="grid">
      <NuxtLink v-for="f in data.filter((x) => x.fund_id)" :key="f.entity_id" :to="'/funds/' + f.fund_id" class="card fund">
        <div class="fh"><h2>{{ f.name }}</h2><span class="tag">{{ STATUS[f.status ?? ''] }}<template v-if="f.vintage"> · {{ f.vintage }}</template></span></div>
        <p class="big">{{ money(f.totals!.committed, f.currency) }}<small v-if="f.target"> of {{ money(f.target, f.currency) }} target</small></p>
        <div class="bar"><i :style="{ width: Math.min(100, f.totals!.calledPct * 100) + '%' }" /></div>
        <p class="sub">{{ pct(f.totals!.calledPct) }} called · {{ f.lps }} LP{{ f.lps === 1 ? '' : 's' }}</p>
        <dl><div><dt>Paid in</dt><dd>{{ money(f.totals!.paidIn, f.currency) }}</dd></div><div><dt>Distributed</dt><dd>{{ money(f.totals!.distributed, f.currency) }}</dd></div>
          <div><dt>DPI</dt><dd>{{ x(f.m!.dpi) }}</dd></div><div><dt>TVPI</dt><dd>{{ x(f.m!.tvpi) }}</dd></div><div><dt>Net IRR</dt><dd>{{ pct(f.m!.irr) }}</dd></div></dl>
      </NuxtLink>
    </div>
    <EmptyState v-if="!(data ?? []).some((f) => f.fund_id)" card icon="funds" title="Set up your first fund" text="Track each fund's LPs and commitments, capital calls (with two-GP approval), distributions and NAV, with DPI, TVPI and net IRR per fund and per LP. Every LP gets a private, read-only portal."><button v-if="isGp" class="btn" @click="setupOpen = true">Set up a fund</button></EmptyState>
    <AppModal :open="setupOpen" :title="pending.length ? 'Set up a fund' : 'Add a fund'" @close="setupOpen = false"><form v-if="isGp" class="frm" @submit.prevent="doSetup">
      <h2 class="wide">{{ pending.length ? 'Set up a fund' : 'Add a fund' }}</h2>
      <label v-if="pending.length" class="label">Fund<select v-model="setup.entity_id" required><option value="" disabled>Choose</option><option v-for="f in pending" :key="f.entity_id" :value="f.entity_id">{{ f.name }}</option><option value="new">New fund…</option></select></label>
      <label v-if="!pending.length || setup.entity_id === 'new'" class="label">Fund name<input v-model="setup.name" required maxlength="200" placeholder="e.g. Acme Ventures Fund I"></label>
      <label class="label">Currency<select v-model="setup.currency"><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option></select></label>
      <label class="label">Target size<input v-model="setup.target_size" inputmode="decimal"></label>
      <label class="label">Vintage<input v-model="setup.vintage" inputmode="numeric"></label>
      <label class="label">Status<select v-model="setup.status"><option value="raising">Raising</option><option value="investing">Investing</option><option value="harvesting">Harvesting</option><option value="closed">Closed</option></select></label>
      <label class="label">Administrator<select v-model="setup.administrator"><option value="self">Self-administered</option><option value="sydecar">Sydecar</option><option value="carta">Carta</option><option value="angellist">AngelList</option><option value="other">Other</option></select></label>
      <p class="hint">Finvry tracks your LPs, calls, distributions and performance. Formation, KYC, money movement, tax and filings stay with your administrator and lawyers;.</p>
      <div class="row"><button class="btn" type="submit">Set up fund</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form></AppModal>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 18px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; margin-bottom: 18px; }
.fund { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 8px; } .fund:hover { border-color: var(--c-blue-deep); text-decoration: none; }
.fh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; } .tag { font-size: 12px; color: var(--c-muted); white-space: nowrap; }
.big { font-family: var(--font-heading); font-size: 30px; color: var(--c-navy); margin: 0; } .big small { font-family: var(--font-body); font-size: 13px; color: var(--c-muted); margin-left: 6px; }
.bar { height: 6px; background: var(--c-paper-2); } .bar i { display: block; height: 100%; background: var(--c-blue-deep); }
.sub { font-size: 12.5px; color: var(--c-muted); margin: 0; }
dl { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 6px 0 0; border-top: 1px solid var(--c-rule); padding-top: 10px; } dt { font-size: 11.5px; color: var(--c-muted); } dd { margin: 2px 0 0; font-weight: 500; font-variant-numeric: tabular-nums; }
.frm { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; align-items: end; } .hint { grid-column: 1 / -1; font-size: 12.5px; color: var(--c-muted); margin: 0; } .frm label { display: flex; flex-direction: column; gap: 6px; } .wide, .row { grid-column: 1 / -1; } .row { display: flex; gap: 12px; align-items: center; }
input, select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
@media (max-width: 900px) { .frm { grid-template-columns: 1fr 1fr; } dl { grid-template-columns: repeat(3, 1fr); } }
.intro { margin-bottom: 14px; border-left: 3px solid var(--c-blue-deep); } .intro p { margin: 6px 0 0; font-size: 14px; color: var(--c-ink-soft); max-width: 760px; }
.dk { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; } .k { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; } .k em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .k b { font-size: 24px; font-weight: 600; letter-spacing: -.02em; } .tools { display: flex; gap: 8px; } .tools a { text-decoration: none; } @media (max-width: 900px) { .dk { grid-template-columns: 1fr 1fr; } }
</style>
