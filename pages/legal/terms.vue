<script setup lang="ts">
// Terms of use (end-user licence agreement), for the product the visitor is on (Finvry or Aidi).
import type { LegalSection } from '~/components/LegalDoc.vue'
definePageMeta({ layout: false })
const brand = useBrand(), n = brand.name
useHead({ title: 'Terms of use · ' + n })
const sections: LegalSection[] = [
  { id: 'agreement', title: 'The agreement', body: [
    'These terms are an agreement between you (and the company you act for) and the operator of ' + n + ' ("we", "us"). By creating an account or using ' + n + ', you accept them. If you use ' + n + ' for a company, you confirm you may bind it.'] },
  { id: 'licence', title: 'Your licence', body: [
    'We grant you a limited, non-exclusive, non-transferable, revocable licence to use ' + n + ' for your own business during your subscription. You may not resell, copy, reverse-engineer or use ' + n + ' to build a competing product, or use it unlawfully.'] },
  { id: 'accounts', title: 'Accounts and your data', body: [
    'You are responsible for the people you invite, the roles you give them and keeping sign-in details safe. You own the data you put into ' + n + ', including data imported from connected services. You give us permission to host and process it only to provide the service to you, as described in our privacy policy.'] },
  { id: 'sharing', title: 'Links you share', body: [
    'You decide what to share and with whom. Anyone with a link you create (an investor page, a shared forecast or cap table, a deck, a data room or a report link) can see what it shows until you turn it off or it expires. You are responsible for having the right to share that information.'] },
  { id: 'equity', title: 'Cap tables, e-signing and certificates', body: [
    ['Signatures made in ' + n + ' are electronic signatures, which signers agree to use. ' + n + ' keeps a record of each signature (name, time, IP address and browser) with the signed document.',
      'You are responsible for your company\'s approvals, such as board consents, and for meeting the securities and tax rules that apply to your issuances, grants and SAFEs.',
      'Cap tables, certificates and models (rounds, exits, conversions) are only as accurate as the information entered. Your company\'s legal records remain the official record of who owns what.'] ] },
  { id: 'ai', title: 'AI features and imports', body: [
    'AI features read the files and figures you give them and propose results, such as a cap table from a lawyer\'s spreadsheet, a forecast from an accountant\'s file, figures from a past report, or a draft document. Review every result before you save, sign or send it; AI output can be incomplete or wrong.'] },
  { id: 'connected', title: 'Connected services', body: [
    'When you connect a third-party service, such as your accounting software or a bank account through our read-only bank feed, you authorise us to read the data you approve, on your behalf. Your use of that service is also governed by its own terms. You can disconnect at any time; we then delete the access tokens.'] },
  { id: 'api', title: 'Data API and AI tools', body: [
    'API keys give access to your workspace\'s data. Keep them secret, give each system its own key, and revoke keys you no longer use. We may limit request rates to keep the service reliable.'] },
  { id: 'use', title: 'Acceptable use', body: [
    'Do not use ' + n + ' to break the law, mislead investors, send unsolicited bulk messages, upload malicious code, probe or overload the service, or access data that is not yours.'] },
  { id: 'fees', title: 'Plans and fees', body: [
    'Paid plans are billed in advance as shown at checkout and renew until cancelled. You can cancel at any time; the plan then runs to the end of the period already paid. Fees are non-refundable except where the law requires otherwise. We will tell you before a price change applies to you.'] },
  { id: 'advice', title: 'No advice', body: [
    n + ' provides software and information. It is not a broker-dealer, funding portal, investment adviser, bank, law firm or accounting firm, and does not provide legal, tax, accounting or investment advice. You are responsible for decisions you make using it.'] },
  { id: 'availability', title: 'Availability and changes', body: [
    'We work to keep ' + n + ' available and secure but do not guarantee it will be uninterrupted or error-free. We may improve or change features. We will tell you in advance about material changes to these terms.'] },
  { id: 'liability', title: 'Liability', body: [
    'To the extent the law allows, ' + n + ' is provided "as is", and our total liability to you for any claim is limited to the fees you paid in the 12 months before the claim. We are not liable for indirect or consequential losses.'] },
  { id: 'ending', title: 'Ending the agreement', body: [
    'You may stop using ' + n + ' at any time. We may suspend or end access if you breach these terms. On request, we will export or delete your data in line with our privacy policy.'] },
  { id: 'law', title: 'Governing law', body: ['These terms are governed by the laws of the State of California.'] }]
</script>
<template>
  <LegalDoc kind="terms" title="Terms of use" updated="14 October 2026" contact="support@finvry.com" :sections="sections"
    :intro="'The agreement for using ' + n + ': what you can expect from us, and what we ask of you.'" />
</template>
