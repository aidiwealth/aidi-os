<script setup lang="ts">
// What a sheet or file would change, before anything is written: new and changed rows (with what changes) and
// how many are unchanged. Accept writes it in; Dismiss leaves everything as it is.
import type { ImportSummary } from '~/shared/growth'
defineProps<{ summary: ImportSummary; busy?: boolean; what: string }>()
const emit = defineEmits<{ accept: []; dismiss: [] }>()
</script>
<template>
  <div class="ir">
    <p class="hd"><b>{{ summary.added }} new</b>, <b>{{ summary.changed }} changed</b>, {{ summary.unchanged }} unchanged{{ summary.skipped ? ', ' + summary.skipped + ' rows skipped' : '' }}. Nothing is saved until you accept.</p>
    <div v-if="summary.sample.length" class="ls"><div v-for="(s, i) in summary.sample" :key="i" class="it"><span class="tg" :class="s.what">{{ s.what === 'new' ? 'New' : 'Changed' }}</span><b>{{ s.name }}</b><small>{{ s.changes.join(' · ') }}</small></div></div>
    <p v-if="summary.added + summary.changed > summary.sample.length" class="mut">Showing the first {{ summary.sample.length }} of {{ summary.added + summary.changed }}.</p>
    <p v-if="!summary.added && !summary.changed" class="mut">Your {{ what }} already match.</p>
    <div class="ac"><button class="btn secondary" :disabled="busy" @click="emit('dismiss')">Dismiss</button><button class="btn" :disabled="busy || (!summary.added && !summary.changed)" @click="emit('accept')">{{ busy ? 'Saving…' : 'Accept ' + (summary.added + summary.changed) + ' update' + (summary.added + summary.changed === 1 ? '' : 's') }}</button></div>
  </div>
</template>
<style scoped>
.ir { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--c-rule); padding: 12px 14px; background: #fff; } .hd { margin: 0; font-size: 14px; } .mut { margin: 0; color: var(--c-muted); font-size: 12.5px; }
.ls { max-height: 260px; overflow: auto; border-top: 1px solid var(--c-rule); } .it { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 2px 10px; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .it small { grid-column: 2; color: var(--c-ink-soft); font-size: 12px; }
.tg { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--c-blue-deep); align-self: start; padding-top: 1px; } .tg.changed { color: var(--c-ink-soft); }
.ac { display: flex; justify-content: flex-end; gap: 8px; }
</style>
