<script setup lang="ts">
// Privacy policy, for the product the visitor is on (Finvry or Aidi).
import type { LegalSection } from '~/components/LegalDoc.vue'
definePageMeta({ layout: false })
const brand = useBrand(), n = brand.name
useHead({ title: 'Privacy policy · ' + n })
const contact = 'privacy@finvry.com'
const sections: LegalSection[] = [
  { id: 'scope', title: 'Who we are and what this covers', body: [
    'This policy explains how ' + n + ' ("we", "us") handles personal data when you use the ' + n + ' web app, its public links (for example investor pages, shared forecasts and cap tables, data rooms, signing links and founder report links), its Data API and its connection for AI tools.',
    'For the business data a company puts into ' + n + ', the company is in charge of that data and we process it on its behalf. For account, billing and security data, we decide how it is used.'] },
  { id: 'collect', title: 'What we collect', body: [
    'Data you give us or add to your workspace:',
    ['Account details: name, email, company, role and sign-in records.',
      'Business and financial information: statements, metrics, forecasts, cap tables, share classes, grants, SAFEs and notes, investor and contact lists, investor updates, decks and documents.',
      'Signing records: when someone signs a document in ' + n + ', the name and signature they give, the time, IP address and browser details, kept with the signed document as evidence.',
      'Billing details, handled by our payment provider; we do not store full card numbers.'],
    'Data from services you choose to connect:',
    ['Accounting reports you approve, such as profit and loss, balance sheet and cash flow.',
      'Bank accounts you connect through our read-only bank feed: account names, the last four digits, balances and transactions. We cannot move money.',
      'Spreadsheets and files you share or upload for us to read.'],
    'Data collected when people use public links:',
    ['Shared forecasts, cap tables, decks and data rooms record who opened them (the name and email the viewer enters, if asked), when, and for how long, and show this to the workspace that shared them.',
      'Founder report links record when they were opened and what was submitted.'],
    'Basic usage and device data (pages visited, errors, approximate location from IP address) and cookies needed to keep you signed in and remember your choices.'] },
  { id: 'use', title: 'How we use it', body: [
    'Only to provide and improve ' + n + ':',
    ['Run the features you ask for: dashboards, boards, forecasts, cap tables, investor updates, data rooms, e-signing and certificates, compliance reminders and the Data API.',
      'Run AI features on the data you submit (for example reading a lawyer\'s cap table, an accountant\'s forecast or a past report, drafting documents, and answering questions in the AI analyst).',
      'Keep accounts secure, prevent abuse and fix problems.',
      'Send service emails: sign-in links, signing requests and signed copies, view and submission alerts, reminders and receipts.'],
    'We do not sell personal data. We do not use your business data to advertise to you, and the AI providers we use do not train their models on it.'] },
  { id: 'ai', title: 'AI features', body: [
    'When you use an AI feature, the relevant files or figures are sent to our AI processing provider to produce the result, under terms that forbid using them for training. AI output can be wrong; you review it before it is saved, signed or sent.'] },
  { id: 'sharing', title: 'Who we share it with', body: [
    ['People you choose: investors you send updates to, viewers of links you share, signers you send documents to, and team members you invite.',
      'Service providers that run ' + n + ' for us: hosting and databases, email delivery, payments, AI processing, the bank feed and file storage. They act on our instructions under contracts that protect the data.',
      'Authorities, where the law requires it, or to protect people and the service.',
      'A buyer or successor, if ' + n + ' is sold or merged, under this policy.'],
    'Investor contact details your team adds are never shown to the companies you hold, and a company using ' + n + ' is not told who holds it in a portfolio.'] },
  { id: 'connected', title: 'Connected services', body: [
    'Connections are read-only and you can disconnect them at any time. Access tokens are stored encrypted and deleted when you disconnect. Your use of a connected service is also covered by that service\'s own terms and privacy policy.'] },
  { id: 'security', title: 'Security', body: [
    'Data is encrypted in transit and at rest. Each workspace is kept separate at the database level, access within a workspace follows the roles you set, and sensitive identifiers, signatures and tokens are stored encrypted. Signed documents carry a record of who signed and when. No system is perfectly secure; we tell affected customers promptly about a breach that puts their data at risk.'] },
  { id: 'retention', title: 'How long we keep it', body: [
    'We keep workspace data while the account is active. When an account closes we delete it within 90 days, except signed documents, billing records and records we must keep by law, which we keep for as long as the law requires. You can ask us to delete data sooner.'] },
  { id: 'rights', title: 'Your rights', body: [
    'You can access, correct, export or delete your personal data, and object to or limit some uses, by writing to us. Depending on where you live (for example California, the UK, the EU or Nigeria) you may have further rights, including the right to complain to a data protection authority. If your data is in a company\'s workspace, we will pass your request to that company and help it respond.'] },
  { id: 'transfers', title: 'International transfers', body: [
    'We and our providers may process data in the United States and other countries. Where the law requires it, we use recognised safeguards such as standard contractual clauses.'] },
  { id: 'children', title: 'Children', body: [n + ' is for businesses and is not meant for anyone under 18. We do not knowingly collect children\'s data.'] },
  { id: 'changes', title: 'Changes to this policy', body: ['We will post changes here and update the date above. If a change is significant, we will tell account owners by email before it takes effect.'] }]
</script>
<template>
  <LegalDoc kind="privacy" title="Privacy policy" updated="14 October 2026" :contact="contact" :sections="sections"
    :intro="'What ' + n + ' collects, why, who sees it and the choices you have. We keep it short and in plain English.'" />
</template>
