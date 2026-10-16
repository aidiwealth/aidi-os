<script setup lang="ts">
// Finvry: perks for this company. Claim one to get its code, link and how to redeem it.
import type { Perk } from '~/components/PerksGrid.vue'
useHead({ title: 'Perks' })
interface Full extends Perk { details: string | null; expires_on: string | null; redeem: string | null; code: string | null; claim_url: string | null }
const { data, refresh, error } = await useFetch<{ paid: boolean; categories: Record<string, string>; perks: Full[] }>('/api/perks')
const sel = ref<Full | null>(null), busy = ref(false), msg = ref(''), copied = ref(false)
const claimed = computed(() => (data.value?.perks ?? []).filter((p) => p.claimed_at).length)
const total = computed(() => (data.value?.perks ?? []).reduce((a, p) => a + (p.value_usd ?? 0), 0))
const k = (v: number) => (v >= 1e6 ? '$' + Math.round(v / 1e5) / 10 + 'M' : v >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + Math.round(v))
function open(p: Perk) { sel.value = (data.value?.perks ?? []).find((x) => x.id === p.id) ?? null; msg.value = ''; copied.value = false }
async function claim() {
  if (!sel.value) return; busy.value = true; msg.value = ''
  try { const r = await $fetch<{ redeem: string | null; code: string | null; claim_url: string | null }>('/api/perks/' + sel.value.id + '/claim', { method: 'POST' }); Object.assign(sel.value, r, { claimed_at: new Date().toISOString() }); await refresh(); sel.value = (data.value?.perks ?? []).find((x) => x.id === sel.value!.id) ?? sel.value }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not claim this perk.' } finally { busy.value = false }
}
async function copy(c: string) { try { await navigator.clipboard.writeText(c); copied.value = true; setTimeout(() => (copied.value = false), 1500) } catch { /* ignore */ } }
</script>
<template>
  <section class="pk">
    <div class="hd">
      <div class="in"><p class="eb">Perks</p><h1>Save on the tools <span>your company runs on.</span></h1><p class="lead">Credits and discounts from Finvry partners, free for companies on Finvry. Claim one to get the code and how to redeem it.</p></div>
      <div class="st"><div><b>{{ data?.perks.length ?? 0 }}</b><span>perks available</span></div><div><b>{{ claimed }}</b><span>claimed by you</span></div><div v-if="total"><b>{{ k(total) }}+</b><span>in savings</span></div></div>
    </div>
    <p v-if="error" class="error">Could not load perks.</p>
    <PerksGrid v-if="data" :perks="data.perks" :categories="data.categories" cta="Get perk" @open="open" />
    <p class="share">Share the full list: <a href="/rewards" target="_blank">app.finvry.com/rewards</a></p>
    <AppModal :open="!!sel" :title="sel?.partner ?? ''" wide @close="sel = null">
      <div v-if="sel" class="md">
        <strong class="mh">{{ sel.headline }}</strong>
        <p>{{ sel.summary }}</p>
        <div v-if="sel.details" class="dt" v-html="renderMarkdown(sel.details)" />
        <p v-if="sel.expires_on" class="mut">Offer ends {{ new Date(sel.expires_on + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }}.</p>
        <div v-if="sel.claimed_at && !sel.locked" class="got">
          <p class="gh">Claimed for your company</p>
          <div v-if="sel.code" class="code"><span>Your code</span><b>{{ sel.code }}</b><button type="button" class="btn secondary sm" @click="copy(sel.code!)">{{ copied ? 'Copied' : 'Copy' }}</button></div>
          <div v-if="sel.redeem" class="dt" v-html="renderMarkdown(sel.redeem)" />
          <a v-if="sel.claim_url" :href="webUrl(sel.claim_url)" target="_blank" rel="noopener" class="btn">Redeem with {{ sel.partner }} →</a>
        </div>
        <p v-else-if="sel.locked" class="lock">This perk is for companies on a paid plan. <NuxtLink to="/settings?s=plan">See plans</NuxtLink></p>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
      <template #foot><a v-if="sel?.website" :href="webUrl(sel.website)" target="_blank" rel="noopener" class="btn secondary">About {{ sel.partner }}</a><span class="sp" /><button class="btn secondary" @click="sel = null">Close</button><button v-if="sel && !sel.claimed_at && !sel.locked" class="btn" :disabled="busy" @click="claim">{{ busy ? 'Claiming…' : 'Claim perk' }}</button></template>
    </AppModal>
  </section>
</template>
<style scoped>
.pk { display: flex; flex-direction: column; gap: 22px; }
.hd { background: #fff; border: 1px solid var(--c-rule); padding: clamp(22px, 3vw, 34px) clamp(22px, 3vw, 36px); display: grid; grid-template-columns: minmax(0, 1.4fr) auto; gap: 28px; align-items: end; }
.eb { margin: 0 0 10px; font-size: 12.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); }
.hd h1 { margin: 0; color: #00183A; font-size: clamp(24px, 3vw, 36px); letter-spacing: -.025em; line-height: 1.1; } .hd h1 span { color: #6b7385; } .lead { margin: 12px 0 0; color: var(--c-ink-soft); font-size: 15px; line-height: 1.55; max-width: 620px; }
.st { display: flex; } .st div { display: flex; flex-direction: column; padding: 0 22px; border-left: 1px solid var(--c-rule-strong); } .st div:first-child { border-left: 0; padding-left: 0; } .st b { font-family: var(--font-heading); font-size: 28px; font-weight: 600; color: #00183A; letter-spacing: -.02em; } .st span { font-size: 12.5px; color: var(--c-muted); white-space: nowrap; }
.share { margin: 0; color: var(--c-muted); font-size: 13px; } .share a { color: #00183A; font-weight: 600; }
.md { display: flex; flex-direction: column; gap: 12px; } .md p { margin: 0; line-height: 1.55; } .mh { font-size: 21px; color: #00183A; } .mut { color: var(--c-muted); font-size: 13px; }
.dt { font-size: 14px; line-height: 1.6; color: var(--c-ink-soft); } .dt :deep(p) { margin: 0 0 8px; } .dt :deep(ul), .dt :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.got { border-top: 1px solid var(--c-rule-strong); padding-top: 16px; display: flex; flex-direction: column; gap: 12px; } .gh { color: var(--c-ink); font-weight: 600; }
.code { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid var(--c-rule-strong); padding: 10px 14px; } .code span { font-size: 12px; color: var(--c-muted); } .code b { flex: 1; font-family: ui-monospace, monospace; font-size: 17px; letter-spacing: .06em; color: #00183A; }
.lock { color: var(--c-ink-soft); font-size: 13.5px; } .lock a { color: inherit; font-weight: 600; }
@media (max-width: 860px) { .hd { grid-template-columns: 1fr; } }
</style>
