<script setup lang="ts">
// A small animated sparkle that shows AI at work (in buttons and next to "Reading…" text). Still when the person
// asks for reduced motion.
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>
<template>
  <svg class="spk" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <path class="s1" d="M12 2.5c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7Z" />
    <path class="s2" d="M19 14.5c.25 2 1 2.75 3 3-2 .25-2.75 1-3 3-.25-2-1-2.75-3-3 2-.25 2.75-1 3-3Z" />
  </svg>
</template>
<style scoped>
.spk { display: inline-block; vertical-align: -3px; flex: none; overflow: visible; }
.s1 { fill: currentColor; transform-origin: 12px 9.5px; animation: spk-a 1.6s ease-in-out infinite; }
.s2 { fill: currentColor; opacity: .7; transform-origin: 19px 17.5px; animation: spk-b 1.6s ease-in-out infinite; }
@keyframes spk-a { 0%, 100% { transform: scale(.82) rotate(0deg); } 50% { transform: scale(1.06) rotate(45deg); } }
@keyframes spk-b { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(.55); opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .s1, .s2 { animation: none; } }
</style>
