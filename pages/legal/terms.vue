<script setup lang="ts">
// End-user licence agreement (terms of use), for the product the visitor is on (Finvry or Aidi).
definePageMeta({ layout: 'public' })
const host = import.meta.client ? location.hostname : useRequestURL().hostname
const name = computed(() => (/finvry/i.test(host) ? 'Finvry' : 'Aidi'))
useHead({ title: () => 'Terms of use · ' + name.value })
</script>
<template>
  <div class="wrap"><h1>{{ name }} terms of use</h1><p class="mut">End-user licence agreement · last updated 7 October 2026</p>
    <h2>1. The agreement</h2><p>These terms are an agreement between you (and the company you act for) and the operator of {{ name }} ("we"). By creating an account or using {{ name }}, you accept them.</p>
    <h2>2. Licence</h2><p>We grant you a limited, non-exclusive, non-transferable, revocable licence to use {{ name }} for your own business during your subscription. You may not resell, copy, reverse-engineer or use {{ name }} to build a competing product, or use it unlawfully.</p>
    <h2>3. Your accounts and data</h2><p>You are responsible for your users and for keeping their sign-in details safe. You own the data you put into {{ name }}, including data imported from connected services such as QuickBooks, Google Sheets, Plaid or banks. You give us permission to host and process it only to provide the service to you.</p>
    <h2>4. Connected services</h2><p>When you connect a third-party service (for example Intuit QuickBooks), you authorise us to read the data you approve, on your behalf. Your use of that service is also governed by its own terms. You can disconnect at any time; we then delete the access tokens.</p>
    <h2>5. Fees</h2><p>Paid plans are billed in advance as shown at checkout. Fees are non-refundable except where the law requires otherwise.</p>
    <h2>6. No advice</h2><p>{{ name }} provides software and information. It does not provide legal, tax, accounting or investment advice. You are responsible for decisions you make using it.</p>
    <h2>7. Availability and changes</h2><p>We work to keep {{ name }} available and secure but do not guarantee it will be uninterrupted or error-free. We may improve or change features; we will tell you in advance about material changes to these terms.</p>
    <h2>8. Liability</h2><p>To the extent the law allows, {{ name }} is provided "as is", and our total liability to you for any claim is limited to the fees you paid in the 12 months before the claim. We are not liable for indirect or consequential losses.</p>
    <h2>9. Ending the agreement</h2><p>You may stop using {{ name }} at any time. We may suspend or end access if you breach these terms. On request, we will export or delete your data in line with our privacy policy.</p>
    <h2>10. Contact</h2><p>Questions about these terms: <a href="mailto:support@finvry.com">support@finvry.com</a>. These terms are governed by the laws of the State of California.</p></div>
</template>
<style scoped>
.wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 70px; line-height: 1.65; color: var(--c-ink-soft); } h1 { color: var(--c-ink); margin: 0 0 4px; } h2 { color: var(--c-ink); font-size: 17px; margin: 26px 0 6px; } .mut { color: var(--c-muted); font-size: 13px; }
</style>