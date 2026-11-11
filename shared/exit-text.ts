// The AI's reasons for its exit multiples, without any sentence that states the company's own revenue, ARR or
// valuation from elsewhere (an old figure from the web, say): the company's current figures are the ones that count.
export function ownFigures(text: string, company: string): string {
  const first = company.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/)
  if (first.length < 3) return text
  const money = /(\$|usd|₦|ngn)\s?~?\d|\b(revenue|arr|ttm)\b[^.]*\d|\d[\d.,]*\s?(m|k|million|bn)\b[^.]*\b(revenue|arr|ttm)\b/i
  return sentences.filter((x) => !(x.toLowerCase().includes(first) && money.test(x))).join(' ')
}
