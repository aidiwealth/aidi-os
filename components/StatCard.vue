<script setup lang="ts">
// Stat tile in the Finvry client-home style: soft icon square, small label, big value. Link (to), button (@click) or plain.
const props = defineProps<{ label: string; value?: string | number; sub?: string; icon?: string; tone?: 'b' | 'n' | 'r' | 'g' | 'c' | 'a'; to?: string; on?: boolean; alert?: boolean }>()
const attrs = useAttrs()
const NuxtLink = resolveComponent('NuxtLink')
const tag = computed(() => (props.to ? NuxtLink : attrs.onClick ? 'button' : 'div'))
const SVG: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17v.5"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
  money: '<rect x="3" y="6" width="18" height="12"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
}
</script>
<template>
  <component :is="tag" :to="to" :type="tag === 'button' ? 'button' : undefined" class="scd" :class="{ on, act: tag !== 'div' }">
    <span v-if="icon" class="si" :class="tone ?? 'n'"><svg v-if="SVG[icon]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" v-html="SVG[icon]" /><AppIcon v-else :name="icon" /></span>
    <span class="sx"><em>{{ label }}</em><b :class="{ red: alert }"><slot>{{ value }}</slot></b><i v-if="sub">{{ sub }}</i></span>
  </component>
</template>
<style scoped>
.scd { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--c-rule); padding: 16px; text-decoration: none; color: inherit; font: inherit; text-align: left; min-width: 0; transition: border-color .12s; }
.scd.act { cursor: pointer; } .scd.act:hover { border-color: var(--c-navy); } .scd.on { border-color: var(--c-navy); box-shadow: inset 0 -3px 0 var(--c-navy); }
.si { width: 42px; height: 42px; display: grid; place-items: center; flex: none; } .si svg, .si :deep(svg) { width: 21px; height: 21px; }
.si.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .si.n { background: #eef0f6; color: var(--c-navy); } .si.r { background: #fdecef; color: var(--c-danger); } .si.g { background: #e9f6ee; color: var(--c-ok); } .si.c { background: #e6f6fa; color: #0e7490; } .si.a { background: #fff6e6; color: #a5650b; }
.sx { display: flex; flex-direction: column; min-width: 0; } .sx em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .sx b { font-size: 22px; font-weight: 600; letter-spacing: -.01em; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .sx b.red { color: var(--c-danger); } .sx i { font-style: normal; font-size: 12px; color: var(--c-muted); }
</style>
