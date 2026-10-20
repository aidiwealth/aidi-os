<script setup lang="ts">
// Shown while AI works on a page (What to do next, the analysis, reports): the animated sparkle, what it is doing
// now (the steps take turns every few seconds, and the seconds so far after a while), and grey placeholders in the
// shape of what is coming, so the page never looks stuck.
const props = withDefaults(defineProps<{ steps?: string[]; skeleton?: number; compact?: boolean }>(), { steps: () => ['Thinking…'], skeleton: 0, compact: false })
const i = ref(0), secs = ref(0)
let t: ReturnType<typeof setInterval> | undefined
onMounted(() => { t = setInterval(() => { secs.value++; if (secs.value % 3 === 0 && i.value < props.steps.length - 1) i.value++ }, 1000) })
onBeforeUnmount(() => clearInterval(t))
</script>
<template>
  <div class="ait" :class="{ compact }" role="status" aria-live="polite">
    <div class="ln"><span class="mk"><AiSpark :size="compact ? 16 : 20" /></span><Transition name="aif" mode="out-in"><span :key="i" class="tx">{{ steps[i] }}</span></Transition><span v-if="secs >= 8" class="sc">{{ secs }}s</span></div>
    <div v-if="skeleton" class="sk"><div v-for="n in skeleton" :key="n" class="card"><i class="a" /><i class="b" /><i class="c" /><i class="c s" /></div></div>
  </div>
</template>
<style scoped>
.ait { display: flex; flex-direction: column; gap: 14px; margin: 0 0 16px; }
.ln { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--c-ink-soft); } .compact .ln { font-size: 13px; gap: 8px; }
.mk { width: 34px; height: 34px; display: grid; place-items: center; background: var(--c-navy); color: #fff; flex: none; } .compact .mk { width: 26px; height: 26px; }
.tx { display: inline-block; } .sc { font-size: 12px; color: var(--c-muted); font-variant-numeric: tabular-nums; }
.aif-enter-active, .aif-leave-active { transition: opacity .25s, transform .25s; } .aif-enter-from { opacity: 0; transform: translateY(4px); } .aif-leave-to { opacity: 0; transform: translateY(-4px); }
.sk { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.sk .card { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.sk i { display: block; height: 10px; background: linear-gradient(90deg, #eef1f5 0%, #f7f9fb 40%, #eef1f5 80%); background-size: 200% 100%; animation: sh 1.4s linear infinite; }
.sk .a { width: 30%; height: 12px; } .sk .b { width: 85%; height: 16px; } .sk .c { width: 100%; } .sk .c.s { width: 70%; }
@keyframes sh { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .sk i { animation: none; } .aif-enter-active, .aif-leave-active { transition: none; } }
</style>
