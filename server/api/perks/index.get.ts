// Perks for this Finvry company: every live perk, which ones it has claimed, and which need a paid plan.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const org = await currentOrg()
  if (org?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const paid = await onPaidPlan()
  const rows = (await asPlatform(() => db().query<PerkRow>('SELECT ' + PERK_COLS + ' FROM core.perks WHERE ' + LIVE + ' ORDER BY featured DESC, sort, partner'))).rows
  const claimed = new Map((await db().query<{ perk_id: string; claimed_at: string }>('SELECT perk_id, claimed_at FROM core.perk_claims')).rows.map((r) => [r.perk_id, r.claimed_at]))
  return { paid, categories: PERK_CATEGORIES, perks: rows.map((p) => { const c = claimed.get(p.id), locked = p.audience === 'paid' && !paid
    return { id: p.id, partner: p.partner, logo_url: p.logo_url, website: p.website, category: p.category, headline: p.headline, summary: p.summary, details: p.details, value_usd: p.value_usd, audience: p.audience, featured: p.featured, expires_on: p.expires_on, locked, claimed_at: c ?? null,
      redeem: c && !locked ? p.redeem : null, code: c && !locked ? p.code : null, claim_url: c && !locked ? p.claim_url : null } }) }
})
