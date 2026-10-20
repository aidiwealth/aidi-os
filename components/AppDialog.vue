<script setup lang="ts">
// The in-app confirm / alert / prompt (utils/dialog.ts): one at a time, Enter answers, Escape cancels.
const cur = computed(() => dialogQueue.list[0] ?? null)
const val = ref(''), inp = ref<HTMLInputElement | null>(null), okb = ref<HTMLButtonElement | null>(null)
watch(cur, async (d) => { if (!d) return; val.value = d.value ?? ''; await nextTick(); if (d.kind === 'prompt') { inp.value?.focus(); inp.value?.select() } else okb.value?.focus() })
function done(v: unknown) { const d = dialogQueue.list.shift(); d?.resolve(v) }
const answer = (yes: boolean) => { const d = cur.value; if (!d) return; if (d.kind === 'confirm') done(yes); else if (d.kind === 'prompt') done(yes ? val.value : null); else done(undefined) }
function onKey(e: KeyboardEvent) { if (!cur.value) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); answer(false) } }
onMounted(() => window.addEventListener('keydown', onKey, true)); onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>
<template>
  <Teleport to="body"><div v-if="cur" class="db" @mousedown.self="answer(false)"><form class="dw" role="alertdialog" aria-modal="true" :aria-label="cur.title || 'Confirm'" @submit.prevent="answer(true)">
    <h2 v-if="cur.title">{{ cur.title }}</h2><p class="msg">{{ cur.message }}</p>
    <input v-if="cur.kind === 'prompt'" ref="inp" v-model="val" :placeholder="cur.placeholder" :required="cur.required" maxlength="2000" :aria-label="cur.message">
    <div class="ac"><button v-if="cur.kind !== 'alert'" type="button" class="btn secondary" @click="answer(false)">{{ cur.cancel || 'Cancel' }}</button><button ref="okb" type="submit" class="btn" :class="{ danger: cur.danger }" :disabled="cur.kind === 'prompt' && cur.required && !val.trim()">{{ cur.ok || 'OK' }}</button></div>
  </form></div></Teleport>
</template>
<style scoped>
.db { position: fixed; inset: 0; background: rgba(12, 26, 46, .45); z-index: 2000; display: flex; align-items: flex-start; justify-content: center; padding: 18vh 16px 16px; }
.dw { background: #fff; width: 100%; max-width: 440px; box-shadow: 0 24px 60px rgba(12, 26, 46, .25); padding: 22px 24px 18px; display: flex; flex-direction: column; gap: 14px; }
h2 { margin: 0; font-size: 18px; } .msg { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--c-ink); white-space: pre-line; }
input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); }
.ac { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; } .btn.danger { background: var(--c-danger); border-color: var(--c-danger); }
</style>
