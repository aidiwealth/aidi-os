// Console: partners (applications and approved), their codes, discount and how many startups redeemed.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const rows = (await asPlatform(() => db().query(`SELECT p.id, p.name, p.kind, p.website, p.logo_url, p.contact_name, p.contact_email, p.note, p.code, p.discount_pct, p.months, p.max_redemptions, to_char(p.expires_on, 'YYYY-MM-DD') AS expires_on, p.status, p.listed, p.created_at,
      (SELECT count(*)::int FROM platform.partner_redemptions r WHERE r.partner_id = p.id) AS redemptions FROM platform.partners p ORDER BY (p.status = 'pending') DESC, p.created_at DESC`))).rows
  const red = (await asPlatform(() => db().query("SELECT r.partner_id, r.discount_pct, to_char(r.until, 'YYYY-MM-DD') AS until, r.redeemed_at, o.id AS org_id, o.name AS org FROM platform.partner_redemptions r JOIN core.organizations o ON o.id = r.organization_id ORDER BY r.redeemed_at DESC LIMIT 1000"))).rows
  return { partners: rows, redemptions: red, kinds: PARTNER_KINDS }
})
