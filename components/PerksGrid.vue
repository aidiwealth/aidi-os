<script setup lang="ts">
// Perk cards (public rewards page and the in-app Perks page): category filter, featured offers first, then the rest.
export interface Perk { id: string; partner: string; logo_url: string | null; website: string | null; category: string; headline: string; summary: string; value_usd: number | null; audience: 'all' | 'paid'; featured: boolean; locked?: boolean; claimed_at?: string | null }
const props = defineProps<{ perks: Perk[]; categories: Record<string, string>; cta: string }>()
const emit = defineEmits<{ open: [p: Perk] }>()
const cat = ref('')
const cats = computed(() => Object.entries(props.categories).filter(([k]) => props.perks.some((p) => p.category === k)))
const shown = computed(() => props.perks.filter((p) => !cat.value || p.category === cat.value))
const featured = computed(() => (cat.value ? [] : shown.value.filter((p) => p.featured).slice(0, 3)))
const rest = computed(() => shown.value.filter((p) => !featured.value.includes(p)))
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')
const val = (v: number | null) => (v ? 'Worth $' + (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v)) : '')
</script>
<template>
  <div class="pg">
    <div v-if="cats.length > 1" class="chips" role="tablist"><button type="button" :class="{ on: !cat }" @click="cat = ''">All perks <i>{{ perks.length }}</i></button><button v-for="[k, l] in cats" :key="k" type="button" :class="{ on: cat === k }" @click="cat = k">{{ l }} <i>{{ perks.filter((p) => p.category === k).length }}</i></button></div>
    <div v-if="featured.length" class="feat">
      <article v-for="p in featured" :key="p.id" class="fc" role="button" tabindex="0" @click="emit('open', p)" @keydown.enter="emit('open', p)">
        <span class="ft"><span class="lg big"><img v-if="p.logo_url" :src="p.logo_url" :alt="p.partner"><span v-else class="mono">{{ initials(p.partner) }}</span></span><span class="badge">Featured</span></span>
        <span class="pn">{{ p.partner }}</span><strong class="hl">{{ p.headline }}</strong><span class="sm">{{ p.summary }}</span>
        <span class="fb"><span class="tags"><em>{{ categories[p.category] ?? 'Other' }}</em><em v-if="val(p.value_usd)" class="v">{{ val(p.value_usd) }}</em><em v-if="p.audience === 'paid'" class="pd">Paid plans</em></span><span class="go" :class="{ done: p.claimed_at }">{{ p.claimed_at ? '✓ Claimed' : p.locked ? 'Upgrade to unlock' : cta }} →</span></span>
      </article>
    </div>
    <div v-if="rest.length" class="grid">
      <article v-for="p in rest" :key="p.id" class="pc" role="button" tabindex="0" @click="emit('open', p)" @keydown.enter="emit('open', p)">
        <span class="top"><span class="lg"><img v-if="p.logo_url" :src="p.logo_url" :alt="p.partner"><span v-else class="mono">{{ initials(p.partner) }}</span></span><span class="pn">{{ p.partner }}<em>{{ categories[p.category] ?? 'Other' }}</em></span></span>
        <strong class="hl">{{ p.headline }}</strong><span class="sm">{{ p.summary }}</span>
        <span class="fb"><span class="tags"><em v-if="val(p.value_usd)" class="v">{{ val(p.value_usd) }}</em><em v-if="p.audience === 'paid'" class="pd">Paid plans</em></span><span class="go" :class="{ done: p.claimed_at }">{{ p.claimed_at ? '✓ Claimed' : p.locked ? 'Upgrade to unlock' : cta }} →</span></span>
      </article>
    </div>
    <p v-if="!shown.length" class="empty">New perks are on the way. Check back soon.</p>
  </div>
</template>
<style scoped>
.pg { display: flex; flex-direction: column; gap: 18px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 7px 13px; font: inherit; font-size: 13px; cursor: pointer; color: var(--c-ink-soft); } .chips button i { font-style: normal; color: var(--c-muted); margin-left: 4px; font-size: 12px; }
.chips button.on { background: #00183A; border-color: #00183A; color: #fff; } .chips button:hover:not(.on) { border-color: #00183A; color: #00183A; } .chips button.on i { color: rgba(255,255,255,.65); }
.feat { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.fc { position: relative; display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 24px; border: 1px solid var(--c-rule-strong); background: #fff; transition: border-color .15s; }
.fc:hover { border-color: #00183A; }
.ft { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; } .badge { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--c-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.pc { display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 18px; background: #fff; border: 1px solid var(--c-rule); transition: border-color .15s; }
.pc:hover { border-color: #00183A; }
.top { display: flex; gap: 12px; align-items: center; margin-bottom: 4px; }
.lg { width: 44px; height: 44px; flex: none; display: grid; place-items: center; background: #fff; border: 1px solid var(--c-rule); overflow: hidden; } .lg.big { width: 56px; height: 56px; } .lg img { max-width: 80%; max-height: 80%; object-fit: contain; }
.mono { width: 100%; height: 100%; display: grid; place-items: center; background: #f2f3f5; color: #00183A; font-weight: 600; font-size: 14px; letter-spacing: .02em; }
.pn { display: flex; flex-direction: column; font-size: 14px; font-weight: 600; color: var(--c-ink); } .pn em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--c-muted); }
.fc .pn { font-size: 13px; color: var(--c-muted); font-weight: 500; }
.hl { font-family: var(--font-heading); font-size: 19px; line-height: 1.25; font-weight: 600; color: #00183A; letter-spacing: -.01em; } .fc .hl { font-size: 23px; }
.sm { font-size: 13.5px; line-height: 1.5; color: var(--c-ink-soft); flex: 1; }
.fb { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--c-rule); flex-wrap: wrap; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; } .tags { gap: 0; } .tags em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .tags em + em::before { content: '·'; margin: 0 6px; } .tags .v { color: var(--c-ink); font-weight: 500; }
.go { font-size: 13px; font-weight: 600; color: #00183A; white-space: nowrap; } .fc:hover .go, .pc:hover .go { text-decoration: underline; } .go.done { color: var(--c-muted); font-weight: 500; }
.empty { background: #fff; border: 1px dashed var(--c-rule-strong); padding: 32px; text-align: center; color: var(--c-muted); margin: 0; }
</style>
