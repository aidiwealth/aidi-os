// What kind of business a company is, so margins are judged against similar companies (a messaging or telecom company
// passes carrier fees through cost of revenue; a software company does not). Typical gross margin ranges, in %.
export interface BusinessModel { key: string; label: string; short: string; gm: [number, number] | null; why: string }
export const BUSINESS_MODELS: BusinessModel[] = [
  { key: 'saas', label: 'Software (SaaS)', short: 'software', gm: [65, 85], why: 'hosting and support are most of cost of revenue' },
  { key: 'cpaas', label: 'Messaging, voice or telecom (CPaaS)', short: 'messaging and telecom', gm: [15, 35], why: 'carrier and network fees pass through cost of revenue' },
  { key: 'marketplace', label: 'Marketplace', short: 'marketplace', gm: [40, 75], why: 'on net revenue (take rate); lower when gross bookings are reported as revenue' },
  { key: 'fintech', label: 'Fintech or payments', short: 'fintech and payments', gm: [30, 65], why: 'processing, bank and network fees sit in cost of revenue' },
  { key: 'commerce', label: 'E-commerce or hardware', short: 'e-commerce and hardware', gm: [20, 45], why: 'the goods sold are most of cost of revenue' },
  { key: 'services', label: 'Services or agency', short: 'services', gm: [25, 50], why: 'the people delivering the work are cost of revenue' },
  { key: 'other', label: 'Other', short: '', gm: null, why: '' }]
export const modelOf = (k: string | null | undefined) => BUSINESS_MODELS.find((m) => m.key === k) ?? null
