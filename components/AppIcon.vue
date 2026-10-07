<script setup lang="ts">
// Line icons (24px grid, Telroi style) for the sidebar, top bar and empty states. One distinct icon per feature.
const props = defineProps<{ name: string }>()
const P: Record<string, string> = {
  gem: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18"/><path d="M9.5 4 8 9l4 11 4-11-1.5-5" opacity=".6"/>',
  home: '<rect x="3" y="3" width="8" height="10" rx="1.6"/><rect x="13" y="3" width="8" height="6" rx="1.6"/><rect x="3" y="15" width="8" height="6" rx="1.6"/><rect x="13" y="11" width="8" height="10" rx="1.6"/>',
  financials: '<path d="M3.5 20.5h17"/><rect x="5" y="11" width="3.2" height="7" rx="1"/><rect x="10.4" y="7" width="3.2" height="11" rx="1"/><rect x="15.8" y="4" width="3.2" height="14" rx="1"/>',
  contacts: '<rect x="4" y="3" width="15" height="18" rx="2.2"/><circle cx="11.5" cy="10" r="2.8"/><path d="M7.2 17.2a4.6 4.6 0 0 1 8.6 0"/><path d="M19 7h1.8M19 12h1.8M19 17h1.8" opacity=".6"/>',
  fundraising: '<path d="M4 20 10 14l3.5 3.5L20 10"/><path d="M15 10h5v5"/><path d="M4 4v16h16" opacity=".45"/>',
  updates: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="m4 6.5 8 6 8-6"/><path d="M8 15h3" opacity=".55"/>',
  investor_page: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" opacity=".6"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v1"/><rect x="3" y="7" width="18" height="12" rx="2.5"/><path d="M16 12.5h3.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H16a1.5 1.5 0 0 1 0-3z" fill="currentColor" stroke="none"/>',
  company_services: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18" opacity=".55"/><path d="M11 12.5h2v2h-2z" fill="currentColor" stroke="none"/>',
  documents: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5" opacity=".6"/>',
  compliance: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M16 3v4M8 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" opacity=".75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  cs_inbox: '<path d="M3.5 13.5 6 5.8A1.5 1.5 0 0 1 7.4 4.8h9.2a1.5 1.5 0 0 1 1.4 1L20.5 13.5"/><path d="M3.5 13.5V18A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.5 2.5h-4l-1.5-2.5z"/>',
  services: '<rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 4V3h6v1"/><path d="m8.5 11 1.5 1.5L13 9.5"/><path d="M8.5 16h7" opacity=".6"/>',
  cs_analytics: '<path d="M3 12h4l2.5 6 4-14 2.5 8H21"/>',
  analytics: '<path d="M3 12h4l2.5 6 4-14 2.5 8H21"/>',
  fo_analytics: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" opacity=".6"/>',
  pitches: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  pipeline: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5" opacity=".75"/><rect x="17" y="4" width="4" height="7" rx="1.5" opacity=".5"/>',
  portfolio: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18" opacity=".55"/>',
  funds: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4" opacity=".7"/>',
  credit: '<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10" opacity=".7"/><path d="M12 3 3 8h18z"/>',
  directory: '<path d="M12 3 3.5 7.5 12 12l8.5-4.5z"/><path d="M3.5 12 12 16.5 20.5 12" opacity=".7"/><path d="M3.5 16.5 12 21l8.5-4.5" opacity=".45"/>',
  entities: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" opacity=".65"/>',
  governance: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 7a4 4 0 0 0 6 0z"/><path d="m19 7-3 7a4 4 0 0 0 6 0z"/><path d="M8 21h8"/>',
  banking: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" opacity=".7"/><path d="M3 20.5h18"/>',
  modules: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" opacity=".7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" opacity=".7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  customers: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6" opacity=".7"/>',
  billing: '<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6M9 11h6M9 14.5h4" opacity=".65"/>',
  plans: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m3.5 12 8.5 4.5 8.5-4.5" opacity=".7"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5" opacity=".45"/>',
  professionals: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5a7 7 0 0 1 14 0"/><path d="m12 13.5-1.5 3 1.5 1.5 1.5-1.5z" opacity=".6"/>',
  empty: '<path d="M3.5 13.5 6 5.8A1.5 1.5 0 0 1 7.4 4.8h9.2a1.5 1.5 0 0 1 1.4 1L20.5 13.5"/><path d="M3.5 13.5V18A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.5 2.5h-4l-1.5-2.5z"/>',
  upload: '<path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sign: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 16.5c1.5-2 2.5-2 3 0s1.5 2 4-1" opacity=".7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', dot: '<circle cx="12" cy="12" r="3"/>'
}
const ALIAS: Record<string, string> = { tax_docs: 'documents', wealth_mgmt: 'gem', wm_portal: 'gem', expenses: 'billing', deployments: 'banking', boards: 'analytics', decks: 'pitches', client_raise: 'fundraising', cs_raise: 'fundraising', notices: 'cs_inbox', blog: 'documents', client_inbox: 'cs_inbox', wealth: 'portfolio', cs_tracker: 'pipeline', chart: 'financials', finance: 'wallet' }
const body = computed(() => P[ALIAS[props.name] ?? props.name] ?? P.dot)
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="body" />
</template>
