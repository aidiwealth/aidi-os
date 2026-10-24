<script setup lang="ts">
// Setting up two-step verification, one step at a time: why, scan the code, enter the 6-digit code (boxes that move on
// as you type, paste a whole code, sent as soon as it is complete), then save the recovery codes before going on.
const props = withDefaults(defineProps<{ framed?: boolean }>(), { framed: true })
const emit = defineEmits<{ done: [] }>()
const brand = useBrand()
const step = ref<0 | 1 | 2>(0), busy = ref(false), msg = ref(''), copied = ref(''), saved = ref(false)
const setup = ref<{ secret: string; qr: string } | null>(null), codes = ref<string[]>([])
const code = ref(''), boxes = ref<{ focus: () => void } | null>(null)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
async function start() {
  busy.value = true; msg.value = ''
  try { setup.value = await $fetch('/api/account/mfa', { method: 'POST', body: { action: 'start' } }); step.value = 1; await nextTick(); boxes.value?.focus() }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
async function enable() {
  if (code.value.length !== 6 || busy.value) return
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ recovery_codes: string[] }>('/api/account/mfa', { method: 'POST', body: { action: 'enable', code: code.value } }); codes.value = r.recovery_codes; step.value = 2 }
  catch (e) { msg.value = err(e); code.value = ''; await nextTick(); boxes.value?.focus() } finally { busy.value = false }
}
function copy(text: string, what: string) { void navigator.clipboard?.writeText(text); copied.value = what; setTimeout(() => (copied.value = ''), 1800) }
function download() {
  const t = brand.name + ' recovery codes\n' + new Date().toISOString().slice(0, 10) + '\nEach code works once. Keep them somewhere safe.\n\n' + codes.value.join('\n') + '\n'
  const u = URL.createObjectURL(new Blob([t], { type: 'text/plain' })), a = document.createElement('a'); a.href = u; a.download = brand.name.toLowerCase() + '-recovery-codes.txt'; a.click(); URL.revokeObjectURL(u)
}
const APPS = ['Google Authenticator', 'Microsoft Authenticator', '1Password', 'Authy']
</script>
<template>
  <div class="mw" :class="{ framed: props.framed }">
    <ol class="prog" aria-label="Progress"><li v-for="(l, i) in ['Get ready', 'Scan and confirm', 'Save recovery codes']" :key="l" :class="{ on: step === i, done: step > i }"><span>{{ step > i ? '✓' : i + 1 }}</span>{{ l }}</li></ol>

    <div v-if="step === 0" class="pane">
      <div class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg></div>
      <h2>Protect your account</h2>
      <p class="lead">Two-step verification adds a 6-digit code from an app on your phone to your sign-in. Even if someone gets into your email, they cannot get into {{ brand.name }}.</p>
      <div class="apps"><span v-for="a in APPS" :key="a">{{ a }}</span><span class="more">or any authenticator app</span></div>
      <button class="btn big" :disabled="busy" @click="start">{{ busy ? 'Preparing…' : 'Get started' }}</button>
    </div>

    <div v-else-if="step === 1 && setup" class="pane">
      <h2>Scan, then enter the code</h2>
      <p class="lead">Open your authenticator app, add an account, and scan this code.</p>
      <div class="scan"><div class="qr" v-html="setup.qr" /></div>
      <p class="key">Can't scan? Enter this key: <code>{{ setup.secret }}</code> <button class="lk" type="button" @click="copy(setup.secret.replace(/\s/g, ''), 'key')">{{ copied === 'key' ? 'Copied' : 'Copy' }}</button></p>
      <label class="cl">The 6-digit code from the app</label>
      <CodeBoxes ref="boxes" v-model="code" :disabled="busy" :invalid="!!msg" @complete="enable" />
      <p v-if="msg" class="error">{{ msg }}</p>
      <p v-else class="hint">{{ busy ? 'Checking…' : 'The code changes every 30 seconds; it is checked as soon as all six digits are in.' }}</p>
      <button class="lk back" type="button" @click="step = 0; code = ''; msg = ''">Back</button>
    </div>

    <div v-else-if="step === 2" class="pane">
      <div class="ic ok" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
      <h2>Two-step verification is on</h2>
      <p class="lead">If you lose your phone, sign in with one of these recovery codes. Each works once, and they will not be shown again.</p>
      <div class="codes"><code v-for="c in codes" :key="c">{{ c }}</code></div>
      <div class="acts"><button class="btn secondary" type="button" @click="copy(codes.join('\n'), 'codes')">{{ copied === 'codes' ? 'Copied' : 'Copy all' }}</button><button class="btn secondary" type="button" @click="download">Download</button></div>
      <label class="chk"><input v-model="saved" type="checkbox"> I have saved my recovery codes somewhere safe</label>
      <button class="btn big" :disabled="!saved" @click="emit('done')">Continue</button>
    </div>
  </div>
</template>
<style scoped>
.mw { display: flex; flex-direction: column; gap: 22px; } .mw.framed { background: var(--c-paper); border: 1px solid var(--c-rule); padding: 30px 32px 28px; box-shadow: 0 24px 60px rgba(12,26,46,.08); }
.prog { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; } .prog li { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--c-muted); padding-top: 10px; border-top: 2px solid var(--c-rule); }
.prog li span { width: 20px; height: 20px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); border-radius: 50%; font-size: 11px; font-weight: 600; flex: none; }
.prog li.on { color: var(--c-ink); border-top-color: var(--c-navy); } .prog li.on span { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .prog li.done { color: var(--c-ink-soft); border-top-color: var(--c-blue-deep); } .prog li.done span { border-color: var(--c-blue-deep); color: var(--c-blue-deep); }
.pane { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
.pane h2 { font-size: 22px; } .lead { margin: 0; color: var(--c-ink-soft); font-size: 14.5px; line-height: 1.6; max-width: 400px; }
.ic { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: rgba(95,168,211,.14); color: var(--c-navy); } .ic svg { width: 28px; height: 28px; } .ic.ok { background: var(--c-navy); color: #fff; }
.apps { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 4px 0 6px; } .apps span { font-size: 12px; padding: 4px 10px; border: 1px solid var(--c-rule); background: var(--c-paper-2); color: var(--c-ink-soft); } .apps .more { border: 0; background: none; color: var(--c-muted); }
.btn.big { width: 100%; max-width: 320px; height: 44px; font-size: 15px; margin-top: 6px; }
.scan { padding: 14px; border: 1px solid var(--c-rule); background: #fff; margin: 4px 0; } .qr { width: 188px; height: 188px; } .qr :deep(svg) { width: 100%; height: 100%; display: block; }
.key { margin: 0; font-size: 12.5px; color: var(--c-muted); } code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: var(--c-paper-2); padding: 2px 6px; color: var(--c-ink); letter-spacing: .04em; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; color: var(--c-blue-deep); cursor: pointer; } .back { margin-top: 4px; }
.cl { margin-top: 10px; font-size: 13px; font-weight: 500; color: var(--c-ink); }
.hint { margin: 0; font-size: 12px; color: var(--c-muted); } .error { margin: 0; color: var(--c-danger); font-size: 13px; }
.codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; width: 100%; max-width: 340px; padding: 16px; border: 1px solid var(--c-rule); background: var(--c-paper-2); margin: 4px 0; } .codes code { background: none; padding: 0; font-size: 14px; text-align: center; }
.acts { display: flex; gap: 8px; } .chk { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--c-ink); margin-top: 6px; cursor: pointer; }
@media (max-width: 520px) { .mw.framed { padding: 22px 18px; } .prog li { font-size: 0; gap: 0; } }
</style>
