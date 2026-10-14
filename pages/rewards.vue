<script setup lang="ts">
// Public: the perks companies get on Finvry (app.finvry.com/rewards). Offers only; codes are in the app after sign-up.
definePageMeta({ layout: false })
import type { Perk } from '~/components/PerksGrid.vue'
const brand = useBrand()
if (brand.key !== 'finvry') await navigateTo('/')
useHead({ title: 'Finvry perks: savings on the tools founders use', meta: [{ name: 'description', content: 'Companies on Finvry get credits and discounts from partners: cloud, software, banking, legal, payroll and more.' }] })
const { data } = await useFetch<{ categories: Record<string, string>; perks: Perk[] }>('/api/public/perks', { default: () => ({ categories: {}, perks: [] }) })
const total = computed(() => data.value.perks.reduce((a, p) => a + (p.value_usd ?? 0), 0))
const partners = computed(() => new Set(data.value.perks.map((p) => p.partner)).size)
const k = (v: number) => (v >= 1e6 ? '$' + Math.round(v / 1e5) / 10 + 'M' : v >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + Math.round(v))
const sel = ref<Perk | null>(null)
</script>
<template>
  <div class="rw">
    <header class="nav"><div class="wrap nv"><a href="https://finvry.com" class="brand" aria-label="Finvry"><img src="/brand/finvry-logo.svg" alt="Finvry"></a><span class="sp" /><a href="https://finvry.com" class="ln hide-sm">Product</a><NuxtLink to="/partners" class="ln hide-sm">Partners</NuxtLink><NuxtLink to="/login" class="ln">Sign in</NuxtLink><NuxtLink to="/start" class="cta">Get started free</NuxtLink></div></header>
    <section class="hero"><div class="wrap hg">
      <div><p class="eb">Finvry perks</p><h1>Save on the tools<br><span>your company runs on.</span></h1></div>
      <div class="hr"><p class="lead">Every company on Finvry gets credits and discounts from our partners: cloud, software, banking, legal, payroll and more. Claim them in your workspace in a couple of clicks.</p>
        <div class="stats"><div><b>{{ data.perks.length }}</b><span>perks</span></div><div><b>{{ partners }}</b><span>partners</span></div><div v-if="total"><b>{{ k(total) }}+</b><span>in savings</span></div></div></div>
    </div></section>
    <main class="wrap body">
      <ol class="how"><li><b>01</b><span><strong>Create your workspace</strong>Free to start. Your company, your numbers, your investors.</span></li><li><b>02</b><span><strong>Open Perks</strong>Every offer, with what you get and who it is for.</span></li><li><b>03</b><span><strong>Claim and save</strong>Get the code or link and redeem it with the partner.</span></li></ol>
      <PerksGrid :perks="data.perks" :categories="data.categories" cta="See offer" @open="(p) => (sel = p)" />
      <section class="band"><div><h2>Claim these with a free Finvry account.</h2><p>Investor updates, fundraising, data room, compliance and your financials in one place, plus every perk on this page.</p></div><div class="bb"><NuxtLink to="/start" class="cta big">Get started free</NuxtLink><NuxtLink to="/login" class="ghost">Sign in</NuxtLink></div></section>
      <p class="part">Want to offer a perk to companies on Finvry? <a href="mailto:support@finvry.com?subject=Finvry%20perks%20partner">Talk to us</a>.</p>
    </main>
    <footer class="ft"><div class="wrap fr"><img src="/brand/finvry-mark.svg" alt="" class="fm"><span>© {{ new Date().getFullYear() }} Finvry</span><span class="sp" /><a href="https://finvry.com">finvry.com</a><NuxtLink to="/partners">Partner discounts</NuxtLink></div></footer>
    <AppModal :open="!!sel" :title="sel?.partner ?? ''" @close="sel = null">
      <div v-if="sel" class="md"><strong class="mh">{{ sel.headline }}</strong><p>{{ sel.summary }}</p><p v-if="sel.audience === 'paid'" class="pd">For companies on a paid Finvry plan.</p><p class="mut">Sign up or sign in to Finvry to claim this perk and get the code.</p></div>
      <template #foot><a v-if="sel?.website" :href="sel.website" target="_blank" rel="noopener" class="btn secondary">About {{ sel.partner }}</a><span class="sp" /><NuxtLink to="/login" class="btn secondary">Sign in</NuxtLink><NuxtLink to="/start" class="btn">Get started free</NuxtLink></template>
    </AppModal>
  </div>
</template>
<style scoped>
.rw { min-height: 100vh; background: #fff; font-family: var(--font-body); color: var(--c-ink); }
/* Same frame as finvry.com: a centred column with generous side padding. */
.wrap { width: 100%; max-width: 1340px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 64px); }
.nav { position: sticky; top: 0; z-index: 5; background: rgba(255,255,255,.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--c-rule); } .nv { display: flex; align-items: center; gap: 22px; height: 68px; }
.brand img { height: 26px; display: block; } .sp { flex: 1; }
.ln { color: var(--c-ink-soft); text-decoration: none; font-size: 14.5px; } .ln:hover { color: #00183A; }
.cta { background: #00183A; color: #fff; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 10px 18px; } .cta:hover { background: #0c2c5c; } .cta.big { padding: 14px 24px; font-size: 15.5px; white-space: nowrap; }
.ghost { color: #00183A; text-decoration: none; font-weight: 600; font-size: 15px; padding: 13px 20px; border: 1px solid var(--c-rule-strong); } .ghost:hover { border-color: #00183A; }
.hero { padding: clamp(56px, 8vw, 110px) 0 clamp(40px, 5vw, 64px); background: #fff; }
.hg { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: clamp(28px, 5vw, 72px); align-items: end; }
.eb { margin: 0 0 18px; font-size: 13px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--c-muted); }
.hero h1 { margin: 0; color: #00183A; font-size: clamp(38px, 4.6vw, 64px); line-height: 1.02; letter-spacing: -.035em; font-weight: 600; } .hero h1 span { color: #6b7385; }
.lead { margin: 0; font-size: 18px; line-height: 1.6; color: var(--c-ink-soft); }
.stats { display: flex; margin-top: 26px; } .stats div { display: flex; flex-direction: column; padding: 0 28px; border-left: 1px solid var(--c-rule-strong); } .stats div:first-child { padding-left: 0; border-left: 0; }
.stats b { font-family: var(--font-heading); font-size: 34px; font-weight: 600; color: #00183A; letter-spacing: -.02em; line-height: 1.1; } .stats span { font-size: 13.5px; color: var(--c-muted); }
.body { padding-top: clamp(36px, 5vw, 64px); padding-bottom: clamp(48px, 6vw, 88px); display: flex; flex-direction: column; gap: 32px; }
.how { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--c-rule-strong); border-bottom: 1px solid var(--c-rule); } .how li { display: flex; flex-direction: column; gap: 10px; padding: 22px 24px 24px 0; } .how li + li { border-left: 1px solid var(--c-rule); padding-left: 24px; }
.how b { font-family: var(--font-heading); font-size: 13px; color: var(--c-muted); letter-spacing: .08em; font-weight: 500; } .how span { display: flex; flex-direction: column; gap: 4px; font-size: 14.5px; line-height: 1.55; color: var(--c-ink-soft); } .how strong { color: #00183A; font-size: 17px; font-weight: 600; }
.band { display: flex; align-items: center; justify-content: space-between; gap: 28px; background: #fff; border-top: 1px solid var(--c-rule-strong); border-bottom: 1px solid var(--c-rule); padding: clamp(28px, 4vw, 44px) 0; } .band h2 { margin: 0 0 8px; color: #00183A; font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -.02em; } .band p { margin: 0; color: var(--c-ink-soft); max-width: 640px; line-height: 1.55; } .bb { display: flex; gap: 10px; flex-wrap: wrap; }
.part { margin: 0; text-align: center; color: var(--c-muted); font-size: 14px; } .part a { color: #00183A; font-weight: 600; }
.ft { border-top: 1px solid var(--c-rule); font-size: 13px; color: var(--c-muted); } .fr { display: flex; align-items: center; gap: 16px; height: 64px; } .ft a { color: var(--c-ink-soft); text-decoration: none; } .fm { height: 20px; }
.md { display: flex; flex-direction: column; gap: 10px; } .md p { margin: 0; line-height: 1.55; } .mh { font-size: 20px; color: #00183A; } .pd { color: #a5650b; font-size: 13px; } .mut { color: var(--c-muted); font-size: 13px; }
@media (max-width: 860px) { .hg { grid-template-columns: 1fr; } .how { grid-template-columns: 1fr; } .how li, .how li + li { border-left: 0; padding-left: 0; } .how li + li { border-top: 1px solid var(--c-rule); } .band { flex-direction: column; align-items: flex-start; } .hide-sm { display: none; } }
</style>
