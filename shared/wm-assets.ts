// Asset types staff can switch off for a client who does not want them: hidden in the portal, refused when buying,
// left out of the suggested mix and of the AI's suggestions. Keys match the Fortress buckets where there is one.
export const ASSET_TYPES: { key: string; label: string; note: string }[] = [
  { key: 'stocks', label: 'Shares and funds', note: 'Stocks and ETFs' },
  { key: 'crypto', label: 'Crypto', note: 'Bitcoin, Ethereum and other coins' },
  { key: 'metals', label: 'Gold and silver', note: 'Precious metals' },
  { key: 'real_estate', label: 'Property', note: 'Real estate' },
  { key: 'private', label: 'Private company deals', note: 'Pre-IPO and secondaries' },
  { key: 'savings', label: 'Savings plans', note: 'Aidi savings plans' },
  { key: 'tbills', label: 'Treasury bills and fixed deposits', note: 'Short-term government savings' },
]
export const assetLabel = (k: string) => ASSET_TYPES.find((a) => a.key === k)?.label ?? k
