// Bank account kinds from the live feed: cards and loans are money owed, never cash. A credit card's "current" balance
// is what is owed on it.
type K = { type?: string | null; subtype?: string | null }
export const isCard = (a: K) => a.type === 'credit' || a.subtype === 'credit card'
export const isDebt = (a: K) => ['credit', 'loan'].includes(a.type ?? '') || ['credit card', 'loan', 'line of credit', 'mortgage', 'student', 'auto'].includes(a.subtype ?? '') && a.type !== 'depository'
// Paying a card's bill from a bank account: a transfer between the company's own accounts (the card's purchases are
// the spend).
export const CARD_PAY = /\b(payment|pymt|pmt|autopay|auto pay|thank you|epay|bill pay)\b/i
