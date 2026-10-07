// Defaults: everything that needs a licence is off. Subscription fees follow the low end of premium wealth-tech
// subscriptions (US $49/month; Nigeria ₦25,000/month). Advisory fee 1% stepping down to 0.5% as assets grow.
export function wmDefaults() {
  return {
    US: { managed: false, advisor: true, self_directed: false, savings: false, alpaca: false, busha: false, anchor: false, plaid: true, savings_provider: 'manual', savings_vendor: '', savings_rate: 0, subscription: 49, currency: 'USD' },
    NG: { managed: false, advisor: true, self_directed: false, savings: false, alpaca: false, busha: false, anchor: false, plaid: false, savings_provider: 'manual', savings_vendor: 'Cowrywise (Sprout)', savings_rate: 0, subscription: 25000, currency: 'NGN' },
    advisory_tiers: [{ upto: 1_000_000, pct: 1 }, { upto: 5_000_000, pct: 0.75 }, { upto: null, pct: 0.5 }],
    gold_usd_oz: null as number | null, silver_usd_oz: null as number | null, spot_as_of: null as string | null }
}
