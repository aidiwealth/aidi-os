<script setup lang="ts">
// A legal page (privacy policy, terms): brand header, title block, numbered sections with a contents list that follows
// the reader, and a plain footer with the other legal links. Body items: a string is a paragraph, an array is a list.
export interface LegalSection { id: string; title: string; body: (string | string[])[] }
const props = defineProps<{ kind: 'privacy' | 'terms'; title: string; updated: string; intro: string; sections: LegalSection[]; contact: string }>()
const brand = useBrand()
const home = brand.key === 'finvry' ? 'https://finvry.com' : 'https://theaidigroup.com'
const active = ref(props.sections[0]?.id ?? '')
onMounted(() => {
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) active.value = e.target.id }, { rootMargin: '-20% 0px -70% 0px' })
  for (const s of props.sections) { const el = document.getElementById(s.id); if (el) io.observe(el) }
  onBeforeUnmount(() => io.disconnect())
})
</script>
<template>
  <div class="lg">
    <header class="top"><div class="in">
      <a :href="home" class="brand" :aria-label="brand.name + ' home'"><img v-if="brand.key === 'finvry'" src="/brand/finvry-logo.svg" alt="Finvry"><span v-else class="aw"><AidiWordmark /></span></a>
      <nav><NuxtLink to="/legal/privacy" :class="{ on: kind === 'privacy' }">Privacy</NuxtLink><NuxtLink to="/legal/terms" :class="{ on: kind === 'terms' }">Terms</NuxtLink><a :href="home" class="bk">{{ brand.key === 'finvry' ? 'finvry.com' : 'theaidigroup.com' }} ↗</a></nav>
    </div></header>
    <div class="hero"><div class="in">
      <p class="eb">Legal</p><h1>{{ title }}</h1><p class="up">Last updated {{ updated }}</p><p class="lead">{{ intro }}</p>
    </div></div>
    <div class="in body">
      <aside><p class="ct">Contents</p><a v-for="(s, i) in sections" :key="s.id" :href="'#' + s.id" :class="{ on: active === s.id }"><span>{{ i + 1 }}</span>{{ s.title }}</a></aside>
      <article>
        <section v-for="(s, i) in sections" :id="s.id" :key="s.id">
          <h2><span>{{ i + 1 }}.</span>{{ s.title }}</h2>
          <template v-for="(b, j) in s.body" :key="j"><ul v-if="Array.isArray(b)"><li v-for="(li, k) in b" :key="k">{{ li }}</li></ul><p v-else>{{ b }}</p></template>
        </section>
        <div class="ask"><b>Questions?</b><span>Write to <a :href="'mailto:' + contact">{{ contact }}</a>.</span></div>
      </article>
    </div>
    <footer class="ft"><div class="in">
      <span>© {{ new Date().getFullYear() }} {{ brand.name }}</span>
      <nav><NuxtLink to="/legal/privacy">Privacy policy</NuxtLink><NuxtLink to="/legal/terms">Terms of use</NuxtLink><a v-if="brand.key === 'finvry'" href="/developers">API</a><a v-if="brand.key === 'finvry'" href="/status">Status</a><a :href="'mailto:' + contact">Contact</a></nav>
    </div></footer>
  </div>
</template>
<style scoped>
.lg { background: #fff; min-height: 100vh; color: var(--c-ink-soft); }
.in { max-width: 1120px; margin: 0 auto; padding: 0 32px; }
.top { border-bottom: 1px solid var(--c-rule); position: sticky; top: 0; background: #fff; z-index: 5; } .top .in { display: flex; align-items: center; justify-content: space-between; height: 68px; }
.brand { display: flex; text-decoration: none; color: var(--c-navy); } .brand img { height: 26px; } .aw { display: flex; width: 64px; height: 26px; } .aw :deep(svg) { width: 100%; height: 100%; }
.top nav { display: flex; gap: 26px; align-items: center; font-size: 14.5px; } .top nav a { text-decoration: none; color: var(--c-muted); } .top nav a:hover, .top nav a.on { color: var(--c-navy); } .top nav a.on { font-weight: 600; }
.top .bk { border: 1px solid var(--c-rule-strong); padding: 7px 14px; color: var(--c-ink) !important; }
.hero { background: #f6f7f9; border-bottom: 1px solid var(--c-rule); } .hero .in { padding-top: 64px; padding-bottom: 52px; }
.eb { margin: 0 0 12px; font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); }
.hero h1 { font-size: clamp(36px, 5vw, 56px); line-height: 1.04; letter-spacing: -.035em; margin: 0 0 12px; color: var(--c-navy); }
.up { margin: 0 0 22px; font-size: 14px; color: var(--c-muted); } .lead { margin: 0; max-width: 720px; font-size: 18px; line-height: 1.6; color: var(--c-ink-soft); }
.body { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 64px; padding-top: 48px; padding-bottom: 80px; }
aside { position: sticky; top: 92px; align-self: start; display: flex; flex-direction: column; max-height: calc(100vh - 120px); overflow-y: auto; }
.ct { margin: 0 0 10px; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--c-muted); }
aside a { display: flex; gap: 10px; padding: 7px 0 7px 12px; border-left: 2px solid var(--c-rule); font-size: 14px; color: var(--c-muted); text-decoration: none; line-height: 1.35; }
aside a span { font-variant-numeric: tabular-nums; min-width: 16px; } aside a:hover { color: var(--c-ink); } aside a.on { color: var(--c-navy); border-left-color: var(--c-navy); font-weight: 500; }
article { max-width: 740px; }
section { padding: 0 0 34px; margin-bottom: 34px; border-bottom: 1px solid var(--c-rule); scroll-margin-top: 92px; } section:last-of-type { border-bottom: 0; }
h2 { font-size: 22px; letter-spacing: -.02em; margin: 0 0 14px; color: var(--c-navy); display: flex; gap: 10px; } h2 span { color: var(--c-muted); font-weight: 500; }
p, li { font-size: 16px; line-height: 1.7; } p { margin: 0 0 14px; } ul { margin: 0 0 14px; padding-left: 20px; } li { margin-bottom: 6px; } li::marker { color: var(--c-muted); }
a { color: var(--c-blue-deep); }
.ask { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--c-rule); padding: 20px 22px; font-size: 15px; } .ask b { color: var(--c-navy); }
.ft { border-top: 1px solid var(--c-rule); } .ft .in { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 22px; padding-bottom: 22px; font-size: 13.5px; color: var(--c-muted); }
.ft nav { display: flex; gap: 22px; flex-wrap: wrap; } .ft a { color: var(--c-muted); text-decoration: none; } .ft a:hover { color: var(--c-ink); }
@media (max-width: 860px) { .body { grid-template-columns: 1fr; gap: 0; } aside { display: none; } .in { padding: 0 20px; } .top nav { gap: 16px; } .top .bk { display: none; } }
@media print { .top, aside, .ft { display: none; } .body { display: block; } }
</style>
