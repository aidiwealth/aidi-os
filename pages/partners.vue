<script setup lang="ts">
// Public: VCs, incubators, accelerators and communities whose startups get a discount on Finvry, how to redeem it,
// and a form for organisations to apply.
definePageMeta({ layout: 'public' })
useHead({ title: 'Finvry partners — startup discounts', meta: [{ name: 'description', content: 'Startups backed by our partner VCs, incubators and accelerators get a discount on Finvry. See the list and how to redeem.' }] })
interface Pt { id: string; name: string; kind: string; kind_label: string; website: string | null; logo_url: string | null; discount_pct: number; months: number | null }
const { data } = await useFetch<{ partners: Pt[] }>('/api/public/partners', { default: () => ({ partners: [] }) })
const kind = ref('')
const kinds = computed(() => [...new Set((data.value?.partners ?? []).map((p) => p.kind_label))])
const list = computed(() => (data.value?.partners ?? []).filter((p) => !kind.value || p.kind_label === kind.value))
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const ap = reactive({ name: '', kind: 'vc', website: '', contact_name: '', contact_email: '', note: '', website2: '', busy: false, ok: false, err: '' })
async function apply() { ap.busy = true; ap.err = ''; try { const { busy, ok, err, ...body } = ap; void busy; void ok; void err; await $fetch('/api/public/partners/apply', { method: 'POST', body }); ap.ok = true } catch (e) { ap.err = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not send. Try again.' } finally { ap.busy = false } }
</script>
<template>
  <div class="pp">
    <header class="hero"><p class="eb">Finvry partners</p><h1>Startup discounts from the people who back you.</h1><p class="lead">VCs, incubators, accelerators and startup communities on this list give their founders a discount on Finvry: investor updates, fundraising pipeline and data room, board reporting and compliance in one place.</p></header>
    <ol class="how"><li><b>1</b><span><strong>Get your code</strong>Ask your partner for their Finvry code. Codes are private to each partner's founders.</span></li><li><b>2</b><span><strong>Redeem it</strong>Enter it when you <NuxtLink to="/start">sign up</NuxtLink>, or later in Settings → Plan.</span></li><li><b>3</b><span><strong>Save on your plan</strong>The discount applies to your monthly plan for the period shown.</span></li></ol>
    <div v-if="kinds.length > 1" class="chips"><button :class="{ on: !kind }" @click="kind = ''">All</button><button v-for="k in kinds" :key="k" :class="{ on: kind === k }" @click="kind = k">{{ k }}</button></div>
    <div v-if="list.length" class="grid">
      <a v-for="p in list" :key="p.id" class="pc" :href="webUrl(p.website)" target="_blank" rel="noopener">
        <span class="lg"><img v-if="p.logo_url" :src="p.logo_url" :alt="p.name"><span v-else>{{ initials(p.name) }}</span></span>
        <span class="pn"><b>{{ p.name }}</b><em>{{ p.kind_label }}</em></span>
        <span class="off"><strong>{{ p.discount_pct }}%</strong> off{{ p.months ? ' for ' + p.months + ' months' : '' }}</span></a>
    </div>
    <div v-else class="empty">Our first partners are joining now. Back a portfolio of startups? Apply below.</div>
    <section class="apply"><div class="at"><h2>Become a partner</h2><p>Run a fund, incubator, accelerator or founder community? Give your startups a Finvry discount and see them stay investor-ready. We review every application and send you a code.</p></div>
      <form v-if="!ap.ok" class="af" @submit.prevent="apply"><input v-model="ap.website2" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label>Organisation<input v-model="ap.name" required maxlength="200"></label>
        <label>Type<select v-model="ap.kind"><option value="vc">Venture capital</option><option value="incubator">Incubator</option><option value="accelerator">Accelerator</option><option value="community">Startup community</option><option value="university">University</option><option value="startup">Startup</option><option value="other">Other</option></select></label>
        <label>Website<input v-model="ap.website" maxlength="300" placeholder="https://"></label>
        <label>Your name<input v-model="ap.contact_name" required maxlength="200"></label>
        <label class="w">Work email<input v-model="ap.contact_email" type="email" required maxlength="254"></label>
        <label class="w">About your portfolio (optional)<textarea v-model="ap.note" rows="3" maxlength="2000" placeholder="How many startups, which stages and markets" /></label>
        <p v-if="ap.err" class="err w">{{ ap.err }}</p><button class="btn w" :disabled="ap.busy">{{ ap.busy ? 'Sending…' : 'Apply to partner' }}</button></form>
      <p v-else class="done">Thanks — we have your application and will be in touch by email.</p></section>
  </div>
</template>
<style scoped>
.pp { max-width: 1080px; margin: 0 auto; padding: 8px 0 40px; display: flex; flex-direction: column; gap: 28px; }
.eb { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--c-muted); font-weight: 600; } .hero h1 { margin: 0; font-size: clamp(28px, 4vw, 42px); letter-spacing: -.02em; max-width: 760px; } .lead { margin: 12px 0 0; color: var(--c-ink-soft); font-size: 16px; line-height: 1.6; max-width: 760px; }
.how { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--c-rule); background: #fff; } .how li { display: flex; gap: 14px; padding: 18px 20px; } .how li + li { border-left: 1px solid var(--c-rule); } .how b { flex: none; width: 30px; height: 30px; display: grid; place-items: center; background: var(--c-signal-soft); color: var(--c-blue-deep); font-size: 14px; } .how span { display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.45; } .how strong { color: var(--c-ink); font-size: 14.5px; } .how a { color: var(--c-blue-deep); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .chips .on { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; } .pc { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid var(--c-rule); padding: 16px; text-decoration: none; color: inherit; } .pc:hover { border-color: var(--c-navy); }
.lg { width: 52px; height: 52px; flex: none; border: 1px solid var(--c-rule); display: grid; place-items: center; background: #eef0f6; color: var(--c-navy); font-weight: 700; overflow: hidden; } .lg img { max-width: 100%; max-height: 100%; object-fit: contain; background: #fff; }
.pn { flex: 1; display: flex; flex-direction: column; min-width: 0; } .pn b { font-size: 15px; } .pn em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .off { font-size: 12.5px; color: #23784a; background: #e9f6ee; padding: 4px 10px; white-space: nowrap; } .off strong { font-size: 15px; }
.empty { background: #fff; border: 1px dashed var(--c-rule-strong); padding: 28px; text-align: center; color: var(--c-muted); }
.apply { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 24px; background: #fff; border: 1px solid var(--c-rule); padding: 26px 28px; } .at h2 { margin: 0 0 8px; } .at p { margin: 0; color: var(--c-ink-soft); line-height: 1.55; }
.af { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .af .w { grid-column: 1 / -1; } .af label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .af input, .af select, .af textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; border-radius: 0; } .hp { position: absolute; left: -9999px; }
.err { color: var(--c-danger); margin: 0; } .done { color: var(--c-ok); font-weight: 500; }
@media (max-width: 800px) { .how, .apply, .af { grid-template-columns: 1fr; } .how li + li { border-left: 0; border-top: 1px solid var(--c-rule); } }
</style>
