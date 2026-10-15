<script setup lang="ts">
// Send a SAFE, an option grant or a share purchase for e-signature from the cap table. Finvry drafts the document
// (SAFEs from the template; grants and purchases with AI), you check and edit it, then the company signer and the
// holder sign by link. Once signed (and approved by the board), the cap table records it by itself.
const props = defineProps<{ open: boolean; ct: string; type: 'convertible' | 'grant' | 'issuance'; seed: Record<string, any>; holders: { id: string; name: string; email: string | null; kind: string }[]; consents: { id: string; title: string; status: string }[]; me: { name: string; email: string } }>()
const emit = defineEmits<{ close: []; sent: [v: { id: string; my_link: string | null; consent: 'new' | 'existing' | 'outside' | 'none' }] }>()
const today = new Date().toISOString().slice(0, 10)
const h = reactive({ name: '', email: '', kind: 'investor' })
const co = reactive({ name: '', title: 'Chief Executive Officer', email: '' })
const ap = reactive({ mode: 'new' as 'new' | 'existing' | 'outside', consent_id: '' })
const opt = reactive({ iso: true, pro_rata: false, vesting: '' })
const doc = ref<{ kind: string; title: string; body: string; extra: { title: string; md: string }[] } | null>(null)
const busy = ref(false), msg = ref('')
watch(() => props.open, (o) => { if (!o) return
  const hh = props.holders.find((x) => x.id === props.seed.holder_id)
  Object.assign(h, { name: hh?.name ?? props.seed.holder_name ?? '', email: hh?.email ?? '', kind: hh?.kind ?? props.seed.holder_kind ?? (props.type === 'grant' ? 'employee' : props.type === 'convertible' ? 'investor' : 'founder') })
  Object.assign(co, { name: props.me.name, email: props.me.email, title: 'Chief Executive Officer' }); Object.assign(ap, { mode: props.consents.length ? 'existing' : 'new', consent_id: props.consents[0]?.id ?? '' }); doc.value = null; msg.value = ''
}, { immediate: true })
const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))
const record = computed(() => {
  const s = props.seed, base = { holder_name: h.name.trim(), holder_email: h.email.trim(), holder_kind: h.kind }
  if (props.type === 'convertible') return { type: 'convertible', data: { ...base, kind: s.kind || 'safe', amount: num(s.amount), currency: s.currency || 'USD', valuation_cap: num(s.valuation_cap), discount_pct: num(s.discount_pct), post_money: s.post_money !== false, mfn: !!s.mfn, pro_rata: opt.pro_rata, issued_on: s.issued_on || today } }
  if (props.type === 'grant') return { type: 'grant', data: { ...base, plan_id: s.plan_id, kind: s.kind || 'option', iso: opt.iso, shares: num(s.shares), strike: num(s.strike), granted_on: s.granted_on || today, vest_start: s.vest_start || s.granted_on || today, vest_months: num(s.vest_months) ?? 48, cliff_months: num(s.cliff_months) ?? 12 } }
  return { type: 'issuance', data: { ...base, class_id: s.class_id, shares: num(s.shares), price: num(s.price), issued_on: s.issued_on || today, vesting: opt.vesting } }
})
const needsConsent = computed(() => props.type !== 'convertible')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function draft() {
  busy.value = true; msg.value = ''
  try { doc.value = await $fetch('/api/equity/esign', { method: 'POST', body: { action: 'prepare', ct: props.ct, record: record.value, signatory: { name: co.name, title: co.title } } }) }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function send() {
  if (!doc.value) return
  busy.value = true; msg.value = ''
  try {
    const r = await $fetch<{ id: string; my_link: string | null }>('/api/equity/esign', { method: 'POST', body: { action: 'send', ct: props.ct, kind: doc.value.kind, title: doc.value.title, body: doc.value.body, extra: doc.value.extra, record: record.value,
      consent_id: needsConsent.value && ap.mode === 'existing' && ap.consent_id ? ap.consent_id : null, consent_outside: needsConsent.value && ap.mode === 'outside',
      signers: [{ role: 'company', name: co.name, email: co.email, title: co.title }, { role: 'holder', name: h.name, email: h.email }] } })
    emit('sent', { id: r.id, my_link: r.my_link, consent: needsConsent.value ? (ap.mode === 'existing' && ap.consent_id ? 'existing' : ap.mode === 'outside' ? 'outside' : 'new') : 'none' })
  } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
const what = computed(() => (props.type === 'convertible' ? 'SAFE' : props.type === 'grant' ? 'equity grant' : 'stock purchase agreement'))
const ok = computed(() => h.name.trim() && /@/.test(h.email) && co.name.trim() && /@/.test(co.email))
</script>
<template>
  <AppModal :open="open" :title="'Send ' + what + ' for signature'" wide @close="emit('close')">
    <div class="es">
      <template v-if="!doc">
        <p class="lead">Finvry drafts the {{ what }} from these terms{{ type === 'convertible' ? ' (post-money SAFE, with side letters)' : ' with AI' }}. You can read and edit it before anyone signs. When both sides have signed{{ needsConsent ? ' and the board has approved it' : '' }}, it goes on the cap table by itself.</p>
        <div class="box"><p class="bh">{{ type === 'convertible' ? 'Investor' : type === 'grant' ? 'Grantee' : 'Purchaser' }}</p><div class="g3"><label class="label">Full legal name<input v-model="h.name" maxlength="200"></label><label class="label">Email (where the link goes)<input v-model="h.email" type="email" maxlength="254"></label><label class="label">They are a<select v-model="h.kind"><option value="founder">Founder</option><option value="employee">Employee</option><option value="advisor">Advisor</option><option value="investor">Investor</option><option value="other">Other</option></select></label></div></div>
        <div class="box"><p class="bh">Signing for the company</p><div class="g3"><label class="label">Name<input v-model="co.name" maxlength="200"></label><label class="label">Title<input v-model="co.title" maxlength="120"></label><label class="label">Email<input v-model="co.email" type="email" maxlength="254"></label></div></div>
        <div class="tg"><label v-if="type === 'grant' && seed.kind === 'option'" class="chk"><input v-model="opt.iso" type="checkbox"> Incentive stock options (ISO) for an employee; untick for non-qualified (NSO)</label><label v-if="type === 'convertible'" class="chk"><input v-model="opt.pro_rata" type="checkbox"> Include a pro rata side letter</label></div>
        <label v-if="type === 'issuance'" class="label">Vesting and repurchase (leave blank if fully vested)<input v-model="opt.vesting" maxlength="300" placeholder="e.g. 4 years, 1-year cliff, monthly after; company may repurchase unvested shares at cost"></label>
        <div v-if="needsConsent" class="box"><p class="bh">Board approval</p><p class="mut">Grants and share issues need the board's approval. It goes on the cap table once both the agreement and the approval are signed.</p>
          <label class="chk"><input v-model="ap.mode" type="radio" value="new"> Draft a board consent with AI next (directors sign by link)</label>
          <label v-if="consents.length" class="chk"><input v-model="ap.mode" type="radio" value="existing"> Covered by a board consent already in Finvry <select v-if="ap.mode === 'existing'" v-model="ap.consent_id"><option v-for="c in consents" :key="c.id" :value="c.id">{{ c.title }} ({{ c.status === 'signed' ? 'signed' : 'waiting' }})</option></select></label>
          <label class="chk"><input v-model="ap.mode" type="radio" value="outside"> Already approved by the board outside Finvry</label></div>
      </template>
      <template v-else>
        <label class="label">Title<input v-model="doc.title" maxlength="200"></label>
        <label class="label">Document (Markdown; edit anything)<textarea v-model="doc.body" rows="18" class="mono" /></label>
        <p v-if="doc.extra.length" class="mut">Also signed with it: {{ doc.extra.map((x) => x.title).join(', ') }}.</p>
        <p class="mut">Signers: <b>{{ co.name }}</b> ({{ co.title }}, {{ co.email }}) and <b>{{ h.name }}</b> ({{ h.email }}). Each gets a private link by email. Not legal advice: have your lawyer review templates you rely on.</p>
      </template>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
    <template #foot><template v-if="!doc"><span class="sp" /><button class="btn secondary" @click="emit('close')">Cancel</button><button class="btn" :disabled="busy || !ok" @click="draft">{{ busy ? 'Drafting…' : 'Draft the ' + what }}</button></template>
      <template v-else><button class="btn secondary" :disabled="busy" @click="doc = null">Back</button><span class="sp" /><button class="btn" :disabled="busy" @click="send">{{ busy ? 'Sending…' : 'Send for signature' }}</button></template></template>
  </AppModal>
</template>
<style scoped>
.es { display: flex; flex-direction: column; gap: 12px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.55; } .mut { margin: 0; color: var(--c-muted); font-size: 13px; line-height: 1.5; }
.box { border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; } .bh { margin: 0; font-weight: 600; font-size: 13.5px; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; } .label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.es input:not([type="checkbox"]):not([type="radio"]), .es select, .es textarea { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px !important; line-height: 1.5; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; flex-wrap: wrap; } .tg { display: flex; flex-direction: column; gap: 6px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 760px) { .g3 { grid-template-columns: 1fr; } }
</style>
