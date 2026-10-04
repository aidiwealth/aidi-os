// Sharing settings: the company's address, branding, watermark and NDA.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const b = (await db().query('SELECT logo_id, bg, fg, hide_finvry, watermark, nda_enabled, nda_scopes, nda_text FROM fundraise.brand LIMIT 1')).rows[0] ?? null
  const page = (await db().query<{ slug: string; published: boolean }>('SELECT slug, published FROM financials.public_pages LIMIT 1')).rows[0] ?? null
  const suggest = org.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || org.slug
  const sigs = await db().query('SELECT id, scope, name, email, company, signature, signed_at FROM fundraise.nda_signatures ORDER BY signed_at DESC LIMIT 500')
  return { handle: page?.slug ?? '', suggest, published: !!page?.published, base: brands().finvry.url + '/', brand: b, default_nda: DEFAULT_NDA.replaceAll('{{COMPANY}}', org.name), paid: org.plan_code !== 'company_free', signatures: sigs.rows }
})
