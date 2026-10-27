<script setup lang="ts">
// Pre-IPO commitments as a board: waiting for approval, approved (sign the SPV documents), signed (wire the money),
// wired (confirm the units from the SPV statement) and done. Approving needs a fresh code and every check passing;
// confirming writes the holding and, for a company account, the journal.
import { usd } from '~/shared/market-format'
const props = defineProps<{ codeMethod?: string }>()
const { data, refresh } = await useFetch<{ commitments: any[] }>('/api/markets/private', { key: 'mkt-private' })
const LANES: [string, string, string][] = [['waiting', 'Waiting', '#6e737b'], ['approved', 'Sign the documents', '#0c1a2e'], ['signed', 'Wire the money', '#2675b0'], ['wired', 'Units to confirm', '#b54708'], ['confirmed', 'Held', '#1c547d']]
const lane = (s: string) => (data.value?.commitments ?? []).filter((c) => c.status === s)
const msg = ref(''), ok = ref('')
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not do that.'
const ap = reactive({ open: false, c: null as any, code: '', sent: false, busy: false, msg: '' })
async function sendCode() { ap.msg = ''; try { await $fetch('/api/markets/code', { method: 'POST' }); ap.sent = true } catch (e) { ap.msg = err(e) } }
async function act(c: any, action: string, body: Record<string, unknown> = {}) {
  msg.value = ''; ok.value = ''
  if ((action === 'reject' || action === 'cancel') && !await askConfirm(action === 'reject' ? 'Reject this commitment?' : 'Cancel this commitment? Use this only if the money was not sent.')) return
  try { await $fetch('/api/markets/commitments/' + c.id, { method: 'POST', body: { action, ...body } }); await refresh(); return true } catch (e) { (ap.open ? (ap.msg = err(e)) : (msg.value = err(e))); return false }
}
async function approve() { ap.busy = true; if (await act(ap.c, 'approve', { code: ap.code })) { ap.open = false; ok.value = 'Approved. Next: sign the SPV documents.' } ap.busy = false }
const cf = reactive({ open: false, c: null as any, units: '' as string | number, price: '' as string | number, fees: '' as string | number, date: new Date().toISOString().slice(0, 10), busy: false })
function confirmOpen(c: any) { Object.assign(cf, { open: true, c, units: '', price: '', fees: '', date: new Date().toISOString().slice(0, 10), busy: false }) }
async function confirmIt() { cf.busy = true; if (await act(cf.c, 'confirm', { units: Number(cf.units), price: Number(cf.price), fees: Number(cf.fees || 0), date: cf.date })) { cf.open = false; ok.value = 'Confirmed: the holding is in Investments & AUM' + (cf.c.owner_type === 'entity' ? ' and the journal is posted.' : '.') } cf.busy = false }
void props
</script>
<template>
  <div v-if="data" class="pc">
    <p class="mut sm">Pre-IPO trades go through the deal's SPV, outside the broker: approve with a code, sign the documents, wire the money, then confirm the units from the SPV statement.</p>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div class="lanes">
      <div v-for="[s, l, col] in LANES" :key="s" class="lane"><div class="lh"><b>{{ l }}</b><span class="mut">{{ lane(s).length }}</span></div>
        <div v-for="c in lane(s).slice(0, s === 'confirmed' ? 6 : 50)" :key="c.id" class="cm" :style="{ borderTopColor: col }">
          <b>{{ c.company }} · {{ usd(c.amount) }}</b><span class="mut sm">{{ c.account }} · {{ c.owner }}</span>
          <span v-if="s === 'waiting'" class="sm">{{ c.reason }}</span>
          <ul v-if="s === 'waiting'" class="ck"><li v-for="k in c.checks" :key="k.name" :class="{ bad: !k.ok }">{{ k.ok ? '✓' : '✕' }} {{ k.name }} <em>{{ k.detail }}</em></li></ul>
          <span v-if="s === 'confirmed'" class="sm">{{ c.units }} units at {{ usd(c.price) }}{{ c.spv_name ? ' · ' + c.spv_name : '' }}</span>
          <div class="ac">
            <template v-if="s === 'waiting'"><button class="btn sm" :disabled="c.checks.some((k: any) => !k.ok)" @click="Object.assign(ap, { open: true, c, code: '', sent: false, busy: false, msg: '' })">Approve</button><button class="lk red" @click="act(c, 'reject')">Reject</button></template>
            <template v-else-if="s === 'approved'"><button class="btn sm" @click="act(c, 'signed')">Documents signed</button><button class="lk red" @click="act(c, 'cancel')">Cancel</button></template>
            <template v-else-if="s === 'signed'"><button class="btn sm" @click="act(c, 'wired')">Money wired</button><button class="lk red" @click="act(c, 'cancel')">Cancel</button></template>
            <template v-else-if="s === 'wired'"><button class="btn sm" @click="confirmOpen(c)">Confirm units</button></template>
          </div></div>
        <p v-if="!lane(s).length" class="mut sm empty">Nothing here.</p></div>
    </div>
    <AppModal :open="ap.open" title="Approve pre-IPO commitment" @close="ap.open = false">
      <form v-if="ap.c" id="apc" class="fm" @submit.prevent="approve">
        <p><b>{{ usd(ap.c.amount) }}</b> into <b>{{ ap.c.company }}</b> for {{ ap.c.account }} ({{ ap.c.owner }}), through the deal's SPV.</p>
        <template v-if="codeMethod === 'email' && !ap.sent"><p class="mut sm">We email you a 6-digit code to approve.</p><button class="btn secondary" type="button" @click="sendCode">Email me a code</button></template>
        <label v-else class="label">{{ codeMethod === 'app' ? 'Code from your authenticator app' : 'Code from your email' }}<input v-model="ap.code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="6-digit code" required></label>
        <p class="mut sm">Next: sign the SPV documents, wire the money, then confirm the units. Nothing is booked until then.</p><p v-if="ap.msg" class="error">{{ ap.msg }}</p></form>
      <template #foot><button type="button" class="btn secondary" @click="ap.open = false">Cancel</button><button class="btn" type="submit" form="apc" :disabled="ap.busy || !ap.code">{{ ap.busy ? 'Approving…' : 'Approve' }}</button></template>
    </AppModal>
    <AppModal :open="cf.open" title="Confirm the units" @close="cf.open = false">
      <form v-if="cf.c" id="cfm" class="fm" @submit.prevent="confirmIt">
        <p class="mut sm">From the SPV statement for {{ cf.c.company }} · {{ cf.c.account }} · committed {{ usd(cf.c.amount) }}.</p>
        <div class="g3"><label>Units<input v-model="cf.units" type="number" min="0" step="any" required></label><label>Price per unit<input v-model="cf.price" type="number" min="0" step="any" required></label><label>Fees<input v-model="cf.fees" type="number" min="0" step="any" placeholder="0"></label></div>
        <label>Date<input v-model="cf.date" type="date"></label>
        <p class="mut sm">Confirming writes the holding (Private companies) and, for a company account, the journal: Investments: private securities against Cash at bank.</p></form>
      <template #foot><button type="button" class="btn secondary" @click="cf.open = false">Cancel</button><button class="btn" type="submit" form="cfm" :disabled="cf.busy || !cf.units || !cf.price">{{ cf.busy ? 'Confirming…' : 'Confirm' }}</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.pc { display: flex; flex-direction: column; gap: 10px; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; }
.lanes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; } .lane { background: #fafaf8; border: 1px solid var(--c-rule); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; } .lh { display: flex; justify-content: space-between; font-size: 13.5px; }
.cm { background: #fff; border: 1px solid var(--c-rule); border-top: 3px solid; padding: 10px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; } .cm b { font-weight: 600; }
.ck { list-style: none; margin: 4px 0 0; padding: 0; font-size: 12px; } .ck li { color: var(--c-blue-deep); } .ck li.bad { color: var(--c-danger); } .ck em { font-style: normal; color: var(--c-muted); }
.ac { display: flex; gap: 10px; align-items: center; margin-top: 4px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; cursor: pointer; } .red { color: var(--c-danger); } .empty { margin: 0; }
.fm { display: flex; flex-direction: column; gap: 10px; } .fm label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } .fm input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); } .g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 1100px) { .lanes { grid-template-columns: 1fr 1fr; } }
</style>
