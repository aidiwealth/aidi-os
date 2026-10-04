<script setup lang="ts">
// The balance card: bank and account, the balance in large type, and the details along the bottom.
defineProps<{ title: string; label: string; value: number | string | null; currency: string; sub?: string; footLabel?: string; footValue?: string; tag?: string }>()
</script>
<template>
  <div class="wc">
    <div class="wt"><b>{{ title }}</b><svg viewBox="0 0 40 28" class="chip" aria-hidden="true"><rect x="1" y="1" width="38" height="26" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M14 1v26M26 1v26M1 10h13M26 10h13M1 18h13M26 18h13" fill="none" stroke="currentColor" stroke-width="1.4" /></svg></div>
    <span class="wl">{{ label }}</span>
    <b class="wv"><Money :value="value" :currency="currency" /></b>
    <span v-if="sub" class="ws">{{ sub }}</span>
    <div class="wf"><div v-if="footLabel"><span class="fl">{{ footLabel }}</span><span class="fv">{{ footValue }}</span></div><div class="wr"><b>{{ currency }}</b><span v-if="tag">{{ tag }}</span></div></div>
  </div>
</template>
<style scoped>
.wc { background: linear-gradient(135deg, #0c1a2e 0%, #1c3d63 55%, #2f6494 100%); color: #fff; padding: 26px 28px; display: flex; flex-direction: column; min-height: 230px; }
.wt { display: flex; justify-content: space-between; align-items: center; } .wt b { font-family: var(--font-heading); font-weight: 500; font-size: 26px; } .chip { width: 40px; color: rgba(255,255,255,.55); }
.wl { margin-top: 28px; font-size: 13px; color: rgba(255,255,255,.75); } .wv { font-size: 40px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; } .ws { font-size: 13px; color: rgba(255,255,255,.7); margin-top: 4px; }
.wf { margin-top: auto; padding-top: 22px; display: flex; justify-content: space-between; align-items: flex-end; } .fl { display: block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6); } .fv { font-size: 15px; }
.wr { text-align: right; } .wr b { display: block; font-size: 15px; letter-spacing: .06em; } .wr span { font-size: 12px; color: rgba(255,255,255,.7); }
</style>
