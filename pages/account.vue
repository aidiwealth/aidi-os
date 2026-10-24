<script setup lang="ts">
// Account security: two-step verification (an authenticator app). Off: the step-by-step set-up. On: when it was turned
// on, recovery codes left, new codes, and turning it off (Finvry asks for it again straight away).
useHead({ title: 'Account security' })
const brand = useBrand()
const { data: me } = await useFetch<{ email: string }>('/api/auth/me', { key: 'me' })
const { data: st, refresh } = await useFetch<{ enabled: boolean; enabled_at: string | null; recovery_left: number }>('/api/account/mfa', { key: 'mfa' })
const mode = ref<'' | 'disable' | 'recovery'>(''), code = ref(''), codes = ref<string[]>([]), msg = ref(''), busy = ref(false), copied = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function act() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ recovery_codes?: string[] }>('/api/account/mfa', { method: 'POST', body: { action: mode.value, code: code.value } }); codes.value = r.recovery_codes ?? []; mode.value = ''; code.value = ''; await refresh(); if (!st.value?.enabled && brand.key === 'finvry') await navigateTo('/security-setup') }
  catch (e) { msg.value = err(e) } finally { busy.value = false }
}
function copyCodes() { void navigator.clipboard?.writeText(codes.value.join('\n')); copied.value = true; setTimeout(() => (copied.value = false), 1800) }
const since = computed(() => (st.value?.enabled_at ? new Date(st.value.enabled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''))
</script>
<template>
  <section class="acc">
    <div><h1>Account security</h1><p class="lead">Signed in as <b>{{ me?.email }}</b>. Email code plus authenticator app.</p></div>
    <div v-if="!st?.enabled" class="card pad"><MfaWizard :framed="false" @done="refresh()" /></div>
    <div v-else class="card">
      <div class="st"><div class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg></div>
        <div class="tx"><h2>Two-step verification is on</h2><p>Since {{ since }} · authenticator app</p></div><span class="pill">On</span></div>
      <div class="rows">
        <div class="row"><div><b>Recovery codes</b><p>{{ st.recovery_left }} of 10 left. Each works once if you lose your phone.</p><div class="meter"><i :style="{ width: st.recovery_left * 10 + '%' }" /></div></div><button class="btn secondary" @click="mode = mode === 'recovery' ? '' : 'recovery'; msg = ''; codes = []">New codes</button></div>
        <div class="row"><div><b>Turn off</b><p>{{ brand.key === 'finvry' ? 'You will need to set it up again right away.' : 'You will sign in with your email code only.' }}</p></div><button class="btn secondary" @click="mode = mode === 'disable' ? '' : 'disable'; msg = ''; codes = []">Turn off</button></div>
      </div>
      <div v-if="mode" class="confirm"><label>Enter a code from your app or a recovery code</label>
        <div class="in"><input v-model="code" maxlength="20" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" @keyup.enter="act"><button class="btn" :class="{ danger: mode === 'disable' }" :disabled="busy || code.replace(/\s/g, '').length < 6" @click="act">{{ busy ? 'Checking…' : mode === 'disable' ? 'Turn off' : 'Make new codes' }}</button></div></div>
      <div v-if="codes.length" class="codes"><p><b>New recovery codes.</b> Old ones no longer work. Save these now; they are shown once.</p><div class="grid"><code v-for="c in codes" :key="c">{{ c }}</code></div><button class="btn secondary" @click="copyCodes">{{ copied ? 'Copied' : 'Copy all' }}</button></div>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
  </section>
</template>
<style scoped>
.acc { max-width: 720px; display: flex; flex-direction: column; gap: 18px; } h1 { margin: 0; } .lead { color: var(--c-muted); margin: 6px 0 0; }
.card { display: flex; flex-direction: column; gap: 0; padding: 0; } .card.pad { padding: 26px 28px; }
.st { display: flex; align-items: center; gap: 14px; padding: 20px 22px; border-bottom: 1px solid var(--c-rule); } .tx { flex: 1; } .tx h2 { font-size: 17px; } .tx p { margin: 2px 0 0; font-size: 13px; color: var(--c-muted); }
.ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--c-navy); color: #fff; flex: none; } .ic svg { width: 22px; height: 22px; }
.pill { font-size: 12px; font-weight: 600; padding: 3px 10px; background: rgba(95,168,211,.16); color: var(--c-navy); }
.rows { display: flex; flex-direction: column; } .row { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 16px 22px; border-bottom: 1px solid var(--c-rule); }
.row b { font-size: 14px; color: var(--c-ink); font-weight: 500; } .row p { margin: 2px 0 0; font-size: 13px; color: var(--c-muted); }
.meter { width: 180px; height: 4px; background: var(--c-paper-3); margin-top: 8px; } .meter i { display: block; height: 100%; background: var(--c-blue-deep); }
.confirm { padding: 16px 22px; background: var(--c-paper-2); display: flex; flex-direction: column; gap: 8px; } .confirm label { font-size: 13px; color: var(--c-ink); }
.in { display: flex; gap: 8px; } .in input { font: inherit; font-size: 16px; letter-spacing: .12em; padding: 9px 12px; border: 1px solid var(--c-rule-strong); width: 200px; background: #fff; }
.btn.danger { background: var(--c-danger); border-color: var(--c-danger); }
.codes { padding: 16px 22px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; } .codes p { margin: 0; font-size: 13.5px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; padding: 14px; background: var(--c-paper-2); border: 1px solid var(--c-rule); width: 100%; max-width: 340px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; text-align: center; color: var(--c-ink); }
.error { color: var(--c-danger); margin: 0; padding: 0 22px 16px; font-size: 13px; }
@media (max-width: 640px) { .row { flex-direction: column; align-items: flex-start; } .in input { width: 100%; } }
</style>
