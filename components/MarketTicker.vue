<script setup lang="ts">
// The live market strip: indices, Bitcoin and Ether, gold, the 3-month T-bill and the Fed funds rate, refreshed every
// 30 seconds while the page is open and in view. Shown only to people the server answers for (Wealth management team
// members, or wealth clients in their portal); anyone else gets nothing, not an empty bar.
const props = defineProps<{ client?: boolean }>()
interface Item { key: string; name: string; value: number; unit: 'usd' | 'usd_oz' | 'pct'; change: number | null; change_unit: 'pct' | 'pts'; as_of: string | null; source: string; closed?: boolean }
const items = ref<Item[]>([]), at = ref(''), off = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
async function load() {
  if (off.value || (typeof document !== 'undefined' && document.hidden)) return
  try { const r = await $fetch<{ items: Item[]; at: string }>(props.client ? '/api/w/ticker' : '/api/wm/ticker'); items.value = r.items; at.value = r.at }
  catch (e) { const s = (e as { statusCode?: number }).statusCode; if (s === 401 || s === 403 || s === 404) { off.value = true; items.value = [] } }
}
const onVis = () => { if (!document.hidden) void load() }
onMounted(() => { void load(); timer = setInterval(load, 30_000); document.addEventListener('visibilitychange', onVis) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVis) })
const fmt = (x: Item) => {
  if (x.unit === 'pct') return x.value.toFixed(2) + '%'
  const v = x.value >= 1000 ? Math.round(x.value).toLocaleString('en-US') : x.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v + (x.unit === 'usd_oz' ? '/oz' : '')
}
const chg = (x: Item) => (x.change === null ? '' : x.change === 0 ? 'Unchanged' : (x.change > 0 ? '▲ ' : '▼ ') + Math.abs(x.change).toFixed(2) + (x.change_unit === 'pct' ? '%' : ' pts'))
const dir = (x: Item) => (x.change === null || x.change === 0 ? 'flat' : x.change > 0 ? 'up' : 'dn')
const time = computed(() => (at.value ? new Date(at.value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''))
const sources = computed(() => [...new Set(items.value.map((x) => x.source))].join(', '))
</script>
<template>
  <div v-if="items.length" class="tk" role="region" aria-label="Markets" data-nosearch>
    <div class="lv" :title="'Updated every 30 seconds · ' + sources"><i aria-hidden="true" />Live · {{ time }}</div>
    <div class="vp"><div class="tr" :class="{ still: items.length < 4 }">
      <template v-for="n in (items.length < 4 ? 1 : 2)" :key="n">
        <span v-for="x in items" :key="n + x.key" class="it" :aria-hidden="n === 2 ? 'true' : undefined" :title="x.source + (x.closed ? ' · market closed, last price' : '')">
          <span class="nm">{{ x.name }}</span><span class="v">{{ fmt(x) }}</span><span v-if="chg(x)" class="c" :class="dir(x)">{{ chg(x) }}</span>
        </span>
      </template>
    </div></div>
  </div>
</template>
<style scoped>
.tk { display: flex; align-items: stretch; border: 1px solid var(--c-rule); background: #fff; overflow: hidden; margin-bottom: 18px; }
.lv { display: flex; align-items: center; gap: 6px; padding: 0 14px; border-right: 1px solid var(--c-rule); font-size: 12px; color: var(--c-blue-deep); white-space: nowrap; }
.lv i { width: 6px; height: 6px; background: var(--c-blue); border-radius: 50%; }
.vp { flex: 1; min-width: 0; overflow: hidden; }
.tr { display: flex; gap: 28px; width: max-content; padding: 10px 16px; white-space: nowrap; font-size: 13px; animation: move 45s linear infinite; }
.tr.still { animation: none; }
.tk:hover .tr { animation-play-state: paused; }
.it { display: inline-flex; gap: 8px; align-items: baseline; }
.nm { color: var(--c-muted); } .v { font-weight: 600; font-variant-numeric: tabular-nums; } .c { font-variant-numeric: tabular-nums; }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .flat { color: var(--c-muted); }
@keyframes move { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .tr { animation: none; flex-wrap: wrap; width: auto; row-gap: 6px; } .tr > span[aria-hidden='true'] { display: none; } }
</style>
