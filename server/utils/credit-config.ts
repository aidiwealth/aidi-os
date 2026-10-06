// Admin-editable settings for loan applications and credit scoring (stored on the workspace).
export interface CreditConfig { loans_enabled: boolean; countries: string[]; auto_checks: boolean; require_bvn: boolean; max_amount: Record<string, number>; bands: { excellent: number; good: number; fair: number }; default_rate: number; default_tenor: number }
export async function loanSettings(): Promise<CreditConfig> {
  const s = ((await currentOrg())?.settings ?? {}) as Record<string, unknown>
  const c = (s.credit_config ?? {}) as Partial<CreditConfig>
  return { ...CREDIT_DEFAULTS, ...c, bands: { ...CREDIT_DEFAULTS.bands, ...(c.bands ?? {}) }, max_amount: { ...(c.max_amount ?? {}) } }
}
export async function creditchekKey(): Promise<string> {
  const env = useRuntimeConfig().creditchekSecretKey as string
  if (env) return env
  const enc = ((await currentOrg())?.settings as Record<string, unknown> | undefined)?.creditchek_key_enc as string | undefined
  return enc ? decryptText(enc) : ''
}
export function bandFor(score: number | null, b: CreditConfig['bands']): string | null { return score == null ? null : score >= b.excellent ? 'Excellent' : score >= b.good ? 'Good' : score >= b.fair ? 'Fair' : 'Poor' }
export const CREDIT_DEFAULTS = { loans_enabled: true, countries: [] as string[], auto_checks: true, require_bvn: true, max_amount: {} as Record<string, number>, bands: { excellent: 750, good: 680, fair: 600 }, default_rate: 24, default_tenor: 12 } satisfies CreditConfig
