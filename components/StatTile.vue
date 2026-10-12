<script setup lang="ts">
// The one metric box used across Finvry: white flat box, small grey label, big number, small grey note underneath
// (Overview style), with an optional soft icon square on the left (client-home style). Clickable with `to` or `clickable`.
const props = defineProps<{ label: string; value?: string | number; icon?: string; tone?: 'b' | 'n' | 'r' | 'g' | 'a' | 'c'; to?: string; on?: boolean; red?: boolean; note?: string; clickable?: boolean; pos?: boolean; noteTone?: 'up' | 'dn' | 'warn' | 'red' | '' }>()
const P: Record<string, string> = {
  billing: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Zm3 5h4m-4 4h4m-4 4h2',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  chat: 'M4 5h16v11H8l-4 4V5Z',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6',
  calendar: 'M3.5 5h17v15h-17zM3.5 10h17M8 3v4M16 3v4',
  inbox: 'M3 13l3-8h12l3 8v6H3v-6Zm0 0h5l1 2h6l1-2h5',
  money: 'M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 9v.5M18 14.5v.5',
  chart: 'M4 20V10m6 10V4m6 16v-8m4 8H2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6m1-9a3 3 0 1 0 0-6m2 15h3c0-2.6-1.6-4.8-4-5.6',
  building: 'M5 21V4h9v17M14 9h5v12M8 8h3m-3 4h3m-3 4h3M3 21h18',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  doc: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6m-6 4h6',
}
const Link = resolveComponent('NuxtLink')
const tag = computed(() => (props.to ? Link : props.clickable ? 'button' : 'div'))
</script>
<template>
  <component :is="tag" :to="to" :type="clickable && !to ? 'button' : undefined" class="fx-st" :class="{ on, act: to || clickable, ic: icon }">
    <span v-if="icon" class="fx-si" :class="tone ?? 'n'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path :d="P[icon] ?? P.chart" /></svg></span>
    <span class="fx-sx"><em>{{ label }}</em><b :class="{ red, pos }"><slot>{{ value }}</slot></b><i v-if="note || $slots.note" :class="noteTone"><slot name="note">{{ note }}</slot></i></span>
  </component>
</template>
<style scoped>
.fx-st { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--c-rule); padding: 16px 18px; text-decoration: none; color: inherit; font: inherit; text-align: left; min-width: 0; transition: border-color .12s; }
.fx-st.act { cursor: pointer; } .fx-st.act:hover, .fx-st.on { border-color: var(--c-navy); } .fx-st.on { box-shadow: inset 0 -2px 0 var(--c-navy); }
.fx-si { width: 44px; height: 44px; display: grid; place-items: center; flex: none; align-self: center; } .fx-si svg { width: 21px; height: 21px; }
.fx-si.n { background: #eef0f6; color: var(--c-navy); } .fx-si.b { background: var(--c-signal-soft); color: var(--c-blue-deep); } .fx-si.r { background: #fdecef; color: var(--c-danger); } .fx-si.g { background: #e9f6ee; color: var(--c-ok); } .fx-si.a { background: #fff6e6; color: #a5650b; } .fx-si.c { background: #e6f6fa; color: #0e7490; }
.fx-sx { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.fx-sx em { font-style: normal; font-size: 13px; font-weight: 500; color: var(--c-muted); }
.fx-sx b { font-family: var(--font-heading); font-size: 28px; line-height: 1.15; font-weight: 500; letter-spacing: -.02em; color: var(--c-navy); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .fx-sx b.red { color: var(--c-danger); } .fx-sx b.pos { color: var(--c-ok); }
.fx-sx b :deep(*) { font: inherit; color: inherit; }
.fx-sx i { font-style: normal; font-size: 12px; color: var(--c-muted); } .fx-sx i.up { color: var(--c-ok); } .fx-sx i.dn, .fx-sx i.red { color: var(--c-danger); } .fx-sx i.warn { color: var(--c-warn); }
</style>
