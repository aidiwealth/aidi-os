<script setup lang="ts">
// The bear, base and bull values on one line with today's price marked, so it is clear at a glance where the price
// sits against the range of values.
import { usd } from '~/shared/market-format'
const props = defineProps<{ bear: number | null; base: number | null; bull: number | null; price: number }>()
const vals = computed(() => [props.bear, props.base, props.bull, props.price].filter((x): x is number => x != null && Number.isFinite(x)))
const lo = computed(() => Math.min(...vals.value) * 0.94), hi = computed(() => Math.max(...vals.value) * 1.06)
const at = (v: number | null) => (v == null ? null : ((v - lo.value) / (hi.value - lo.value || 1)) * 100)
// Labels near either end are anchored inwards so they never run off the card.
const anchor = (v: number | null) => { const x = at(v) ?? 50; return x < 15 ? 'translateX(0)' : x > 85 ? 'translateX(-100%)' : 'translateX(-50%)' }
</script>
<template>
  <div class="fr" role="img" :aria-label="'Bear ' + usd(bear) + ', base ' + usd(base) + ', bull ' + usd(bull) + ', price ' + usd(price)">
    <div class="ln"><span v-if="bear != null && bull != null" class="band" :style="{ left: at(bear) + '%', width: (at(bull)! - at(bear)!) + '%' }" />
      <i v-for="[k, v] in ([['bear', bear], ['base', base], ['bull', bull]] as const)" v-show="v != null" :key="k" class="mk" :class="k" :style="{ left: at(v) + '%' }" />
      <i class="px" :style="{ left: at(price) + '%' }" /></div>
    <div class="lb"><span v-for="[k, l, v] in ([['bear', 'Bear', bear], ['base', 'Base', base], ['bull', 'Bull', bull]] as const)" v-show="v != null" :key="k" :style="{ left: at(v) + '%', transform: anchor(v) }">{{ l }} {{ usd(v) }}</span></div>
    <div class="pl" :style="{ left: at(price) + '%', transform: anchor(price) }">Price {{ usd(price) }}</div>
  </div>
</template>
<style scoped>
.fr { position: relative; padding: 22px 8px 26px; }
.ln { position: relative; height: 6px; background: var(--c-paper-2); }
.band { position: absolute; top: 0; bottom: 0; background: #d6e3ee; }
.mk { position: absolute; top: -4px; width: 2px; height: 14px; background: var(--c-blue-deep); transform: translateX(-1px); } .mk.base { width: 3px; background: var(--c-navy); }
.px { position: absolute; top: -9px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid var(--c-ink); transform: translateX(-6px); }
.lb span { position: absolute; top: 40px; transform: translateX(-50%); font-size: 12px; color: var(--c-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.pl { position: absolute; top: 0; transform: translateX(-50%); font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
