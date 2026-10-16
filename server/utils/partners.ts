import { randomBytes } from 'node:crypto'
// Partner discounts: VCs, incubators, accelerators, startup communities and universities get a code; their startups
// redeem it (at sign-up or in Settings) for a discount on Finvry plans. Approved, listed partners appear publicly.
export const PARTNER_KINDS: Record<string, string> = { vc: 'Venture capital', incubator: 'Incubator', accelerator: 'Accelerator', startup: 'Startup', community: 'Startup community', university: 'University', other: 'Other' }
export interface Partner { id: string; name: string; kind: string; website: string | null; logo_url: string | null; contact_name: string | null; contact_email: string | null; note: string | null; code: string | null; discount_pct: number; months: number | null; max_redemptions: number | null; expires_on: string | null; status: string; listed: boolean; created_at: string; redemptions?: number }
export const normCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '')

// A code that can be used now: approved partner, not expired, not used up.
export async function partnerForCode(code: string): Promise<Partner> {
  const c = normCode(code)
  if (!/^[A-Z0-9-]{4,30}$/.test(c)) throw apiError('bad_code', 'That code is not valid. Check it with your partner.')
  const p = (await asPlatform(() => db().query<Partner & { used: number }>("SELECT p.*, to_char(p.expires_on, 'YYYY-MM-DD') AS expires_on, (SELECT count(*)::int FROM platform.partner_redemptions r WHERE r.partner_id = p.id) AS used FROM platform.partners p WHERE p.code = $1", [c]))).rows[0]
  if (!p || p.status !== 'approved') throw apiError('bad_code', 'That code is not valid. Check it with your partner.')
  if (p.expires_on && p.expires_on < new Date().toISOString().slice(0, 10)) throw apiError('expired_code', 'That code has expired.')
  if (p.max_redemptions && p.used >= p.max_redemptions) throw apiError('used_code', 'That code has been fully used.')
  return p
}

// Apply a partner code to a workspace: recorded once per partner, and the plan is re-priced.
export async function redeemPartnerCode(orgId: string, code: string): Promise<{ partner: string; pct: number; until: string | null }> {
  const p = await partnerForCode(code)
  const cur = await planDiscount(orgId)
  if (cur && cur.pct >= p.discount_pct && cur.name !== p.name) throw apiError('has_discount', 'This workspace already has a ' + cur.pct + '% discount from ' + cur.name + '.')
  const until = p.months ? new Date(Date.now() + p.months * 30.44 * 86400e3).toISOString().slice(0, 10) : null
  await asPlatform(async () => {
    const r = await db().query('INSERT INTO platform.partner_redemptions (partner_id, organization_id, discount_pct, until) VALUES ($1,$2,$3,$4) ON CONFLICT (partner_id, organization_id) DO NOTHING', [p.id, orgId, p.discount_pct, until])
    if (!r.rowCount) throw apiError('used_code', 'This workspace has already used a code from ' + p.name + '.')
    await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('partner_discount', jsonb_build_object('partner_id', $2::text, 'name', $3::text, 'pct', $4::int, 'until', $5::text, 'code', $6::text)) WHERE id = $1", [orgId, p.id, p.name, p.discount_pct, until, p.code])
  })
  await syncPlanSubscription(orgId).catch((e) => console.error('[partners] reprice', e))
  return { partner: p.name, pct: p.discount_pct, until }
}

// What the public sees: approved, listed partners (never codes or contacts).
export async function publicPartners(): Promise<{ id: string; name: string; kind: string; kind_label: string; website: string | null; logo_url: string | null; discount_pct: number; months: number | null }[]> {
  const rows = (await asPlatform(() => db().query<Partner>("SELECT id, name, kind, website, logo_url, discount_pct, months FROM platform.partners WHERE status = 'approved' AND listed AND (expires_on IS NULL OR expires_on >= current_date) ORDER BY name"))).rows
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, kind_label: PARTNER_KINDS[r.kind] ?? 'Partner', website: r.website, logo_url: r.logo_url, discount_pct: r.discount_pct, months: r.months }))
}
// 10 random characters (about 50 bits), so codes cannot be guessed from the partner's public name.
export const newPartnerCode = (name: string) => (name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'PARTNER') + '-' + Array.from(randomBytes(10), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
