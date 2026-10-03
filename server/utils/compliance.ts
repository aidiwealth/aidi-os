// Compliance rules shared by the API.
export const CATEGORIES: Record<string, string> = {
  tax: 'Tax', annual_return: 'Annual return', franchise_tax: 'Franchise tax', registered_agent: 'Registered agent', licence: 'Licence',
  regulatory: 'Regulatory filing', insurance: 'Insurance', banking: 'Banking / KYC', other: 'Other'
}
export const CATEGORY_KEYS = ['tax', 'annual_return', 'franchise_tax', 'registered_agent', 'licence', 'regulatory', 'insurance', 'banking', 'other'] as const
export const RECURRENCES = ['none', 'monthly', 'quarterly', 'annual'] as const

// The next due date after `from` for a recurrence (keeps the day of month where possible).
export function rollForward(from: string, recurrence: string): string | null {
  if (recurrence === 'none') return null
  const [y, m, d] = from.split('-').map(Number) as [number, number, number]
  const add = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 12
  const target = new Date(Date.UTC(y, m - 1 + add, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}
