<script setup lang="ts">
// A deal card in the Meridian layout: a coloured tile with the title and its sector and stage, then the lead
// investor, minimum investment, post-money cap and days left on the platform, with pass and star buttons.
// Used on Secondaries (star = interested, thumbs-down = pass) and on clients' Deal flow (star = I'm interested).
interface Deal { id: string; title: string; sector?: string | null; stage?: string | null; lead?: string | null; co_investors?: string | null; min_investment?: number | null; valuation?: string | null; closes_at?: string | null; status?: string }
const props = withDefaults(defineProps<{ deal: Deal; clickable?: boolean; source?: string | null; react?: boolean; starred?: boolean; passed?: boolean; starLabel?: string; passLabel?: string }>(),
  { clickable: false, source: null, react: false, starred: false, passed: false, starLabel: 'Interested', passLabel: 'Pass' })
defineEmits<{ open: []; star: []; pass: [] }>()
const tone = computed(() => { let h = 0; for (const c of props.deal.id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'tone-' + ((h % 6) + 1) })
const names = computed(() => [props.deal.lead, props.deal.co_investors].filter(Boolean).join(', ').split(/\s*,\s*/).filter(Boolean))
const initials = (s: string) => s.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'
const usd = (v: number | null | undefined) => (v == null ? '—' : 'US$' + Math.round(v).toLocaleString('en-US'))
const left = computed(() => {
  const d = props.deal.closes_at; if (!d) return '—'
  const n = Math.round((new Date(d + 'T00:00:00Z').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) / 86400e3)
  return props.deal.status === 'expired' || n < 0 ? 'Closed' : String(n)
})
</script>
<template>
  <!-- A div, not a button: the card holds its own buttons (pass, star), and buttons cannot sit inside a button. -->
  <div class="fcard" :class="{ act: clickable, dimc: passed }" :role="clickable ? 'button' : undefined" :tabindex="clickable ? 0 : undefined" @click="clickable && $emit('open')" @keydown.enter.self="clickable && $emit('open')">
    <div class="ftile" :class="tone">
      <h3>{{ deal.title }}</h3>
      <div class="ftags"><span v-if="deal.sector" class="ftag">{{ deal.sector }}</span><span v-if="deal.stage" class="ftag">{{ deal.stage }}</span></div>
    </div>
    <div class="fbody">
      <div class="fwho"><span class="fav">{{ initials(names[0] || '·') }}</span>
        <span><b>{{ names.length ? names.join(', ') : 'Not named' }}</b><em>{{ names.length > 1 ? 'Investors' : 'Lead investor' }}</em></span>
        <span class="fx" @click.stop><slot name="actions" />
          <template v-if="react">
            <button type="button" class="ic" :class="{ on: passed }" :title="passLabel" :aria-label="passLabel" :aria-pressed="passed" @click="$emit('pass')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.3 15H10z" /><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" /></svg></button>
            <button type="button" class="ic" :class="{ on: starred, st: starred }" :title="starLabel" :aria-label="starLabel" :aria-pressed="starred" @click="$emit('star')"><svg viewBox="0 0 24 24" width="18" height="18" :fill="starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg></button>
          </template></span></div>
      <div class="kv">
        <div><span>Min. investment</span><b>{{ usd(deal.min_investment) }}</b></div>
        <div><span>Post-money cap</span><b>{{ deal.valuation || '—' }}</b></div>
        <div><span>Days left{{ source ? ' on ' + source : '' }}</span><b>{{ left }}</b></div>
      </div>
      <slot />
    </div>
  </div>
</template>
<style scoped>
div.fcard.act:focus-visible { outline: 2px solid var(--c-blue-deep); outline-offset: 2px; }
.kv { margin-top: 2px; }
.ic { background: none; border: 0; padding: 4px; color: var(--c-muted); cursor: pointer; display: inline-flex; } .ic:hover { color: var(--c-ink); } .ic.on { color: var(--c-ink); } .ic.st { color: #b8860b; }
.dimc { opacity: .62; }
</style>
