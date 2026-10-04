<script setup lang="ts">
// Start a US company: a short guided order (state fees included), then card payment.
definePageMeta({ layout: 'public' })
interface Item { code: string; name: string; description: string | null; billing: string; price: string }
const slug = useRoute().params.slug as string
const { data, error } = await useFetch<{ llc: Item | null; inc: Item | null; addons: Item[]; states: string[]; online: boolean; workspace: { firm: string } }>('/api/public/formation/' + slug, { key: 'pub-formation-' + slug })
useHead({ titleTemplate: '%s', title: () => 'Start your US company' + (data.value ? ' — ' + data.value.workspace.firm : '') })
const steps = ['Company', 'Name', 'Address', 'Registered agent', 'Owners', 'Add-ons', 'Your details', 'Review']
const step = ref(0)
const f = reactive({ website: '', state: 'Delaware', entity_type: 'llc' as 'llc' | 'c_corp', names: ['', '', ''], purpose: '', useVirtual: false, address: { line1: '', line2: '', city: '', region: '', postal: '', country: 'United States' }, management: 'member',
  agent: 'ours' as 'ours' | 'theirs', agent_details: '', members: [{ name: '', email: '', ownership: 100 as number | string, address: '', country: '' }], addons: [] as string[], contact: { name: '', email: '', phone: '', country: '' } })
const pkg = computed(() => (f.entity_type === 'llc' ? data.value?.llc : data.value?.inc) ?? null)
const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const qty = (i: Item) => (i.billing === 'monthly' ? 12 : 1)
const picked = computed(() => (data.value?.addons ?? []).filter((i) => f.addons.includes(i.code)))
const total = computed(() => (pkg.value ? Number(pkg.value.price) : 0) + picked.value.reduce((t, i) => t + qty(i) * Number(i.price), 0))
const virtualAvailable = computed(() => (data.value?.addons ?? []).some((i) => i.code === 'virtual_office' || i.code === 'de_mailbox'))
watch(() => f.useVirtual, (v) => { const code = (data.value?.addons ?? []).find((i) => i.code === 'virtual_office')?.code ?? (data.value?.addons ?? []).find((i) => i.code === 'de_mailbox')?.code; if (!code) return; if (v && !f.addons.includes(code)) f.addons.push(code); if (!v) f.addons = f.addons.filter((c) => c !== code) })
const ownSum = computed(() => f.members.reduce((t, m) => t + (Number(m.ownership) || 0), 0))
const msg = ref(''); const busy = ref(false)
function check(): string {
  if (step.value === 1 && !f.names[0]!.trim()) return 'Add the name you want for your company.'
  if (step.value === 2 && !f.useVirtual && (!f.address.line1 || !f.address.city)) return 'Add your business address, or choose a virtual office.'
  if (step.value === 4 && (f.members.some((m) => !m.name.trim()) || Math.abs(ownSum.value - 100) > 0.01)) return 'Every owner needs a name, and ownership must add up to 100% (now ' + ownSum.value + '%).'
  if (step.value === 6 && (!f.contact.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact.email))) return 'Add your name and a valid email.'
  return ''
}
function next() { msg.value = check(); if (!msg.value) step.value = Math.min(steps.length - 1, step.value + 1) }
async function pay() {
  busy.value = true; msg.value = ''
  try {
    const r = await $fetch<{ url: string }>('/api/public/formation/' + slug, { method: 'POST', body: { website: f.website, state: f.state, entity_type: f.entity_type, names: f.names.filter((n) => n.trim()), purpose: f.purpose || undefined,
      address: f.useVirtual ? undefined : f.address, management: f.entity_type === 'llc' ? f.management : 'board', agent: f.agent, agent_details: f.agent_details || undefined,
      members: f.members.map((m) => ({ ...m, ownership: Number(m.ownership) })), addons: f.addons, contact: f.contact } })
    window.location.href = r.url
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not place the order. Please try again.'; busy.value = false }
}
</script>

<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>This page is not available</h1></div>
    <div v-else-if="data && !data.llc && !data.inc" class="card"><h1>Company formation</h1><p class="muted">Online sign-up is not open yet. Please contact {{ data.workspace.firm }}.</p></div>
    <template v-else-if="data">
      <p class="label">{{ data.workspace.firm }}</p>
      <h1>Start your US company</h1>
      <ol class="steps"><li v-for="(s, i) in steps" :key="s" :class="{ on: i === step, done: i < step }"><button type="button" :disabled="i > step" @click="step = i">{{ i + 1 }}. {{ s }}</button></li></ol>
      <div class="grid">
        <div class="card main">
          <template v-if="step === 0">
            <h2>Where and what kind of company?</h2>
            <label class="label">State<select v-model="f.state"><option v-for="s in data.states" :key="s">{{ s }}</option></select></label>
            <div class="types">
              <button v-if="data.llc" type="button" class="type" :class="{ on: f.entity_type === 'llc' }" @click="f.entity_type = 'llc'"><b>LLC</b><span>Flexible and simple. Good for consultancies, holding companies and small teams.</span><em>{{ usd(Number(data.llc.price)) }}</em></button>
              <button v-if="data.inc" type="button" class="type" :class="{ on: f.entity_type === 'c_corp' }" @click="f.entity_type = 'c_corp'"><b>C-Corp (Inc)</b><span>The standard for startups raising venture capital and issuing stock options.</span><em>{{ usd(Number(data.inc.price)) }}</em></button>
            </div>
            <p class="muted sm">State filing fees are included in the price.</p>
          </template>
          <template v-else-if="step === 1">
            <h2>Company name</h2><p class="muted sm">Give us up to three choices in order of preference, in case your first choice is taken. We add the ending ({{ f.entity_type === 'llc' ? 'LLC' : 'Inc.' }}) for you.</p>
            <label class="label">First choice<input v-model="f.names[0]" maxlength="150" required></label>
            <label class="label">Second choice<input v-model="f.names[1]" maxlength="150"></label>
            <label class="label">Third choice<input v-model="f.names[2]" maxlength="150"></label>
            <label class="label">What will the company do?<textarea v-model="f.purpose" rows="2" maxlength="500" placeholder="e.g. Software development and SaaS" /></label>
          </template>
          <template v-else-if="step === 2">
            <h2>Business address</h2>
            <label v-if="virtualAvailable" class="chk"><input v-model="f.useVirtual" type="checkbox"> Use a US virtual office or mailbox from us (added to your order)</label>
            <template v-if="!f.useVirtual">
              <label class="label">Address<input v-model="f.address.line1" maxlength="200"></label>
              <label class="label">Address line 2<input v-model="f.address.line2" maxlength="200"></label>
              <div class="two"><label class="label">City<input v-model="f.address.city" maxlength="100"></label><label class="label">State or region<input v-model="f.address.region" maxlength="100"></label></div>
              <div class="two"><label class="label">Postal code<input v-model="f.address.postal" maxlength="20"></label><label class="label">Country<input v-model="f.address.country" maxlength="100"></label></div>
            </template>
          </template>
          <template v-else-if="step === 3">
            <h2>Registered agent</h2><p class="muted sm">Every US company needs a registered agent in its state to receive official mail.</p>
            <label class="chk"><input v-model="f.agent" type="radio" value="ours"> Use ours (recommended)</label>
            <label class="chk"><input v-model="f.agent" type="radio" value="theirs"> I have my own registered agent</label>
            <label v-if="f.agent === 'theirs'" class="label">Agent name and address<textarea v-model="f.agent_details" rows="2" maxlength="500" /></label>
          </template>
          <template v-else-if="step === 4">
            <h2>Owners</h2>
            <label v-if="f.entity_type === 'llc'" class="label">How will it be managed?<select v-model="f.management"><option value="member">By its members (owners)</option><option value="manager">By a manager</option></select></label>
            <div v-for="(m, i) in f.members" :key="i" class="member">
              <div class="two"><label class="label">Full name<input v-model="m.name" maxlength="200"></label><label class="label">Ownership %<input v-model="m.ownership" inputmode="decimal"></label></div>
              <div class="two"><label class="label">Email<input v-model="m.email" type="email" maxlength="254"></label><label class="label">Country of residence<input v-model="m.country" maxlength="100"></label></div>
              <label class="label">Address<input v-model="m.address" maxlength="500"></label>
              <button v-if="f.members.length > 1" type="button" class="link" @click="f.members.splice(i, 1)">Remove owner</button>
            </div>
            <div class="row"><button type="button" class="btn secondary" @click="f.members.push({ name: '', email: '', ownership: 0, address: '', country: '' })">Add owner</button><span :class="Math.abs(ownSum - 100) > 0.01 ? 'error' : 'muted'">Total {{ ownSum }}%</span></div>
          </template>
          <template v-else-if="step === 5">
            <h2>Add-ons</h2>
            <p v-if="!data.addons.length" class="muted">No add-ons available.</p>
            <label v-for="i in data.addons" :key="i.code" class="addon" :class="{ on: f.addons.includes(i.code) }"><input v-model="f.addons" type="checkbox" :value="i.code"><span><b>{{ i.name }}</b><em v-if="i.description">{{ i.description }}</em></span><strong>{{ usd(Number(i.price)) }}{{ i.billing === 'monthly' ? '/mo' : i.billing === 'annual' ? '/yr' : '' }}</strong></label>
          </template>
          <template v-else-if="step === 6">
            <h2>Your details</h2>
            <div class="two"><label class="label">Full name<input v-model="f.contact.name" maxlength="200"></label><label class="label">Email<input v-model="f.contact.email" type="email" maxlength="254"></label></div>
            <div class="two"><label class="label">Phone<input v-model="f.contact.phone" maxlength="40"></label><label class="label">Country<input v-model="f.contact.country" maxlength="100"></label></div>
            <input v-model="f.website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          </template>
          <template v-else>
            <h2>Review your order</h2>
            <dl class="rev"><dt>Company</dt><dd>{{ f.names.filter((n) => n.trim()).join(' / ') }} {{ f.entity_type === 'llc' ? 'LLC' : 'Inc.' }}</dd><dt>State</dt><dd>{{ f.state }}</dd>
              <dt>Address</dt><dd>{{ f.useVirtual ? 'Virtual office' : [f.address.line1, f.address.city, f.address.country].filter(Boolean).join(', ') }}</dd><dt>Registered agent</dt><dd>{{ f.agent === 'ours' ? 'Ours' : 'Your own' }}</dd>
              <dt>Owners</dt><dd>{{ f.members.map((m) => m.name + ' (' + m.ownership + '%)').join(', ') }}</dd><dt>Contact</dt><dd>{{ f.contact.name }} · {{ f.contact.email }}</dd></dl>
          </template>
          <p v-if="msg" class="error" role="alert">{{ msg }}</p>
          <div class="nav"><button v-if="step > 0" type="button" class="btn secondary" @click="step--">Back</button><span />
            <button v-if="step < steps.length - 1" type="button" class="btn" @click="next">Continue</button>
            <button v-else type="button" class="btn" :disabled="busy" @click="pay">{{ busy ? 'Placing order…' : (data.online ? 'Pay ' + usd(total) + ' by card' : 'Place order for ' + usd(total)) }}</button></div>
        </div>
        <aside class="card sum"><h2>Your order</h2>
          <div v-if="pkg" class="li"><span>{{ pkg.name }} ({{ f.state }})</span><b>{{ usd(Number(pkg.price)) }}</b></div>
          <div v-for="i in picked" :key="i.code" class="li"><span>{{ i.name }}{{ i.billing === 'monthly' ? ' × 12 months' : '' }}</span><b>{{ usd(qty(i) * Number(i.price)) }}</b></div>
          <div class="li tot"><span>Total</span><b>{{ usd(total) }}</b></div>
          <p class="muted sm">State filing fees included. {{ data.online ? 'Pay securely by card.' : 'We will email you an invoice with bank transfer details.' }}</p></aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.wrap { max-width: 1040px; margin: 0 auto; } .muted { color: var(--c-muted); } .sm { font-size: 13px; } .error { color: var(--c-danger); }
.steps { display: flex; flex-wrap: wrap; gap: 4px 18px; list-style: none; padding: 0; margin: 14px 0 18px; font-size: 13px; } .steps button { background: none; border: 0; padding: 4px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .steps button:disabled { cursor: default; }
.steps .on button { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; } .steps .done button { color: var(--c-blue-deep); }
.grid { display: grid; grid-template-columns: 1fr 320px; gap: 14px; align-items: start; } .main { display: flex; flex-direction: column; gap: 12px; } .main h2 { margin: 0; }
label.label { display: flex; flex-direction: column; gap: 6px; } input, select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; }
.types { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .type { text-align: left; background: #fff; border: 1px solid var(--c-rule-strong); padding: 14px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
.type b { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); } .type span { font-size: 13px; color: var(--c-ink-soft); } .type em { font-style: normal; font-weight: 600; } .type.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); }
.member { background: var(--c-paper-2); padding: 12px; display: flex; flex-direction: column; gap: 8px; } .row { display: flex; gap: 12px; align-items: center; }
.addon { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--c-rule); padding: 12px; cursor: pointer; } .addon.on { border-color: var(--c-navy); } .addon input { width: auto; margin-top: 3px; }
.addon span { flex: 1; display: flex; flex-direction: column; gap: 2px; } .addon em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .addon strong { font-weight: 600; white-space: nowrap; }
.rev { display: grid; grid-template-columns: 140px 1fr; gap: 8px 14px; margin: 0; font-size: 14px; } .rev dt { color: var(--c-muted); } .rev dd { margin: 0; }
.nav { display: flex; gap: 10px; align-items: center; margin-top: 6px; } .nav span { flex: 1; }
.sum { position: sticky; top: 12px; } .sum h2 { margin: 0 0 10px; } .li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .li.tot { font-weight: 600; border-bottom: 0; font-size: 15px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; align-self: flex-start; } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .two, .types { grid-template-columns: 1fr; } .sum { position: static; } }
</style>
