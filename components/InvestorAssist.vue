<script setup lang="ts">
import { shortAmount } from '~/shared/compact'
// "Fill with AI" for adding an investor: type a name or firm, or paste an email signature, LinkedIn summary or note.
import type { InvestorGuess } from '~/shared/investor'
const props = withDefaults(defineProps<{ context?: string }>(), { context: '' })
const emit = defineEmits<{ fill: [g: InvestorGuess] }>()
const text = ref(''), busy = ref(false), msg = ref(''), done = ref<InvestorGuess | null>(null)
async function go() {
  busy.value = true; msg.value = ''; done.value = null
  try { const g = await $fetch<InvestorGuess>('/api/ai/investor', { method: 'POST', body: { text: text.value, context: props.context || undefined } }); done.value = g; emit('fill', g) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not read that.' } finally { busy.value = false }
}
const usd = (v: number) => shortAmount(v)
</script>
<template>
  <div class="ia">
    <label class="label">Fill with AI<span class="mut"> · type a name or firm, or paste an email signature, LinkedIn summary or note</span>
      <span class="iar"><textarea v-model="text" rows="2" maxlength="6000" placeholder="e.g. Amara Okafor, Partner at Ventures Platform, amara@venturesplatform.com" @keydown.meta.enter="go" /><button type="button" class="btn secondary sm" :disabled="busy || text.trim().length < 2" @click="go">{{ busy ? 'Reading…' : 'Fill' }}</button></span></label>
    <p v-if="done" class="mut">Filled what was empty. {{ done.known ? 'Cheque size and focus are from public information; check them.' : 'Not a well-known investor, so only what you gave was used.' }}{{ done.ticket_min_usd || done.ticket_max_usd ? ' Typical cheque ' + [done.ticket_min_usd, done.ticket_max_usd].filter((x): x is number => !!x).map(usd).join('–') + '.' : '' }}{{ done.stages.length ? ' Stages: ' + done.stages.join(', ') + '.' : '' }}</p>
    <p v-if="msg" class="error">{{ msg }}</p>
  </div>
</template>
<style scoped>
.ia { background: var(--c-paper-3); border: 1px solid var(--c-line-soft); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.iar { display: flex; gap: 8px; align-items: flex-start; margin-top: 4px; } .iar textarea { flex: 1; font: inherit; font-size: 13.5px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); background: #fff; resize: vertical; }
.mut { font-size: 12.5px; color: var(--c-muted); margin: 0; font-weight: 400; } .error { color: var(--c-danger); font-size: 13px; margin: 0; }
</style>
