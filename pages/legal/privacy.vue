<script setup lang="ts">
// Privacy policy, for the product the visitor is on (Finvry or Aidi).
definePageMeta({ layout: 'public' })
const host = import.meta.client ? location.hostname : useRequestURL().hostname
const name = computed(() => (/finvry/i.test(host) ? 'Finvry' : 'Aidi'))
useHead({ title: () => 'Privacy policy · ' + name.value })
</script>
<template>
  <div class="wrap"><h1>{{ name }} privacy policy</h1><p class="mut">Last updated 7 October 2026</p>
    <h2>What we collect</h2><p>Account details (name, email, company); the business and financial information you add or import (for example statements, cap tables, investor lists, documents); data from services you connect, such as QuickBooks reports or Google Sheets you share with us; and basic usage and device information that keeps the service secure.</p>
    <h2>How we use it</h2><p>Only to provide and improve {{ name }}: to show your dashboards, prepare reports and updates, run the features you ask for (including AI features that read the data you submit), keep accounts secure, and send service emails. We do not sell personal data, and we do not use your data to advertise to you.</p>
    <h2>Connected services</h2><p>When you connect QuickBooks, we read the accounting reports you approve (profit and loss, balance sheet, cash flow and company name). Access tokens are encrypted and are deleted when you disconnect. We read Google Sheets only when you give us a link and ask us to import it.</p>
    <h2>Sharing</h2><p>We share data only with service providers that run {{ name }} for us (hosting, email, payments, AI processing), under contracts that protect it; with people you choose to share with (for example investors you send an update to); and where the law requires.</p>
    <h2>Security and retention</h2><p>Data is encrypted in transit and at rest, access is limited to those who need it, and sensitive identifiers and tokens are stored encrypted. We keep your data while your account is active and delete it on request or after the account closes, unless the law requires us to keep it.</p>
    <h2>Your rights</h2><p>You can access, correct, export or delete your data, and object to some uses, by writing to us. Depending on where you live (for example California or Nigeria) you may have further rights under local law.</p>
    <h2>Contact</h2><p><a href="mailto:privacy@finvry.com">privacy@finvry.com</a></p></div>
</template>
<style scoped>
.wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 70px; line-height: 1.65; color: var(--c-ink-soft); } h1 { color: var(--c-ink); margin: 0 0 4px; } h2 { color: var(--c-ink); font-size: 17px; margin: 26px 0 6px; } .mut { color: var(--c-muted); font-size: 13px; }
</style>