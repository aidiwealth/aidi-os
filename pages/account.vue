<script setup lang="ts">
// Account security: turn on two-step verification with an authenticator app.
useHead({ title: 'Account security' })
const { data: me } = await useFetch<{ email: string }>('/api/auth/me', { key: 'me' })
const { data: st, refresh } = await useFetch<{ enabled: boolean; enabled_at: string | null; recovery_left: number }>('/api/account/mfa', { key: 'mfa' })
const setup = ref<{ secret: string; qr: string } | null>(null), code = ref(''), codes = ref<string[]>([]), msg = ref(''), busy = ref(false), mode = ref<'' | 'disable' | 'recovery'>('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function act(action: string) { busy.value = true; msg.value = ''; try {
    const r = await $fetch<{ secret?: string; qr?: string; recovery_codes?: string[] }>('/api/account/mfa', { method: 'POST', body: { action, code: code.value || undefined } })
    if (action === 'start') { setup.value = { secret: r.secret!, qr: r.qr! }; code.value = '' }
    else { if (r.recovery_codes) codes.value = r.recovery_codes; setup.value = null; code.value = ''; mode.value = ''; await refresh() }
  } catch (e) { msg.value = err(e) } finally { busy.value = false } }
function copyCodes() { navigator.clipboard?.writeText(codes.value.join('\n')) }
</script>
<template>
  <section class="acc">
    <p class="label">Account</p><h1>Account security</h1><p class="lead">Signed in as <b>{{ me?.email }}</b>. You sign in with a code sent to your email; two-step verification adds a code from an authenticator app on your phone.</p>
    <div class="card">
      <div class="hd"><div><h2>Two-step verification</h2><p class="mut">Use Google Authenticator, Microsoft Authenticator, 1Password, Authy or any app that supports authenticator codes.</p></div><span class="pill" :class="{ on: st?.enabled }">{{ st?.enabled ? 'On' : 'Off' }}</span></div>
      <div v-if="codes.length" class="rc"><h3>Save your recovery codes</h3><p class="mut">Each code works once if you lose your phone. Store them somewhere safe; they will not be shown again.</p><div class="grid"><code v-for="c in codes" :key="c">{{ c }}</code></div><div class="row"><button class="btn secondary sm" @click="copyCodes">Copy codes</button><button class="btn sm" @click="codes = []">I have saved them</button></div></div>
      <template v-else-if="!st?.enabled">
        <button v-if="!setup" class="btn" :disabled="busy" @click="act('start')">Set up two-step verification</button>
        <div v-else class="setup"><div class="qr" v-html="setup.qr" /><div class="steps"><p><b>1.</b> Scan this QR code with your authenticator app.</p><p class="mut sm">Can't scan? Enter this key: <code>{{ setup.secret }}</code></p><p><b>2.</b> Enter the 6-digit code it shows.</p>
          <div class="row"><input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><button class="btn" :disabled="busy || code.length !== 6" @click="act('enable')">Turn on</button></div><button class="lnk" @click="setup = null">Cancel</button></div></div>
      </template>
      <template v-else>
        <p class="mut">On since {{ st.enabled_at ? new Date(st.enabled_at).toLocaleDateString('en-GB') : '' }} · {{ st.recovery_left }} recovery codes left.</p>
        <div v-if="mode" class="row"><input v-model="code" maxlength="20" :placeholder="'Code from your app or a recovery code'"><button class="btn" :class="{ danger: mode === 'disable' }" :disabled="busy || code.length < 6" @click="act(mode)">{{ mode === 'disable' ? 'Turn off' : 'Get new codes' }}</button><button class="lnk" @click="mode = ''; code = ''">Cancel</button></div>
        <div v-else class="row"><button class="btn secondary" @click="mode = 'recovery'">New recovery codes</button><button class="btn secondary" @click="mode = 'disable'">Turn off</button></div>
      </template>
      <p v-if="msg" class="error">{{ msg }}</p>
    </div>
  </section>
</template>
<style scoped>
.acc { max-width: 760px; } h1 { margin: 0; } .lead { color: var(--c-muted); margin: 6px 0 18px; } .card { display: flex; flex-direction: column; gap: 14px; }
.hd { display: flex; justify-content: space-between; gap: 14px; } h2 { margin: 0 0 4px; font-size: 17px; } h3 { margin: 0 0 4px; font-size: 15px; } .mut { color: var(--c-muted); margin: 0; font-size: 13.5px; } .sm { font-size: 12.5px; }
.pill { height: fit-content; font-size: 12px; font-weight: 600; padding: 3px 10px; background: var(--c-paper-2); color: var(--c-muted); } .pill.on { background: rgba(31,122,77,.1); color: var(--c-ok); }
.setup { display: grid; grid-template-columns: 200px 1fr; gap: 22px; align-items: start; } .qr { width: 200px; height: 200px; border: 1px solid var(--c-rule); } .qr :deep(svg) { width: 100%; height: 100%; display: block; }
.steps p { margin: 0 0 10px; } code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: var(--c-paper-2); padding: 2px 6px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .row input { font: inherit; font-size: 15px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); width: 220px; letter-spacing: .08em; }
.lnk { background: none; border: 0; color: var(--c-muted); cursor: pointer; font: inherit; font-size: 13px; padding: 0; } .btn.danger { background: var(--c-danger); border-color: var(--c-danger); }
.rc { background: var(--c-paper-2); padding: 16px; } .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 12px 0; } .grid code { background: #fff; text-align: center; padding: 6px; }
.error { color: var(--c-danger); margin: 0; } @media (max-width: 640px) { .setup { grid-template-columns: 1fr; } }
</style>
