// Branding, watermark and NDA for a company's shared pages; short-link lookups.
export const RESERVED_HANDLES = new Set(['api', 'partners', '_nuxt', 'c', 'd', 'u', 'login', 'start', 'unsub', 'client', 'platform', 'settings', 'team', 'wallet', 'updates', 'contacts', 'fundraising', 'financials', 'investor-page', 'compliance', 'documents', 'modules',
  'report', 'job', 'pay', 'lp', 'bill', 'info', 'formation', 'share', 'invoice', 'services', 'client-services', 'pipeline', 'portfolio', 'funds', 'entities', 'governance', 'banking', 'credit', 'analytics', 'directory', 'deals', 'family-office', 'admin', 'help', 'about', 'pricing', 'finvry', 'aidi'])
export const DEFAULT_NDA = `MUTUAL NON-DISCLOSURE AGREEMENT

By signing below, you ("Recipient") agree with {{COMPANY}} ("Company") as follows:

1. Confidential Information. Everything the Company shares with you through this page, data room or update, including financial information, business plans, product, customer and investor information, is confidential.
2. Use. You will use the Confidential Information only to evaluate a possible investment in or business relationship with the Company.
3. Protection. You will not disclose the Confidential Information to anyone except your partners, employees and professional advisers who need to know it for that purpose and who are bound by confidentiality obligations at least as protective as these.
4. Exceptions. This does not apply to information that is or becomes public through no fault of yours, that you already lawfully had, or that you develop independently.
5. Return. On request, you will delete or return the Confidential Information.
6. Term. These obligations last for two (2) years from the date you sign.
7. No obligation. Nothing here obliges either party to invest or enter into any transaction.

Signing by typing your name below is your electronic signature.`
export interface Branding { logo_url: string | null; bg: string | null; fg: string | null; hide_finvry: boolean; watermark: boolean; nda_enabled: boolean; nda_scopes: string[]; nda_text: string; org_key: string }
export async function brandingOf(orgId: string): Promise<Branding> {
  const r = (await asPlatform(() => db().query<{ logo_id: string | null; bg: string | null; fg: string | null; hide_finvry: boolean; watermark: boolean; nda_enabled: boolean; nda_scopes: string[]; nda_text: string | null; plan_code: string; name: string }>(
    'SELECT coalesce(b.logo_id, (SELECT p.logo_id FROM financials.public_pages p WHERE p.organization_id = o.id)) AS logo_id, b.bg, b.fg, b.hide_finvry, b.watermark, b.nda_enabled, b.nda_scopes, b.nda_text, o.plan_code, o.name FROM core.organizations o LEFT JOIN fundraise.brand b ON b.organization_id = o.id WHERE o.id = $1', [orgId]))).rows[0]
  const paid = !!r && r.plan_code !== 'company_free'
  return { logo_url: r?.logo_id ? brands().finvry.url + '/api/public/media/' + r.logo_id : null, bg: r?.bg ?? null, fg: r?.fg ?? null, hide_finvry: paid && !!r?.hide_finvry, watermark: !!r?.watermark,
    nda_enabled: !!r?.nda_enabled, nda_scopes: r?.nda_scopes ?? ['room'], nda_text: (r?.nda_text || DEFAULT_NDA).replaceAll('{{COMPANY}}', r?.name ?? 'the Company'), org_key: orgId }
}
// The company logo: set once in Settings and used by the investor page, data room, shared links, updates and
// financial statements (an older investor page logo counts until a new one is set). Current workspace.
export async function companyLogoId(): Promise<string | null> {
  return (await db().query<{ id: string | null }>('SELECT coalesce((SELECT logo_id FROM fundraise.brand LIMIT 1), (SELECT logo_id FROM financials.public_pages LIMIT 1)) AS id')).rows[0]?.id ?? null
}
export async function setCompanyLogo(id: string | null): Promise<void> {
  await db().query('INSERT INTO fundraise.brand (logo_id) VALUES ($1) ON CONFLICT (organization_id) DO UPDATE SET logo_id = EXCLUDED.logo_id, updated_at = now()', [id])
  await db().query('UPDATE financials.public_pages SET logo_id = NULL WHERE logo_id IS NOT NULL')
}
export const logoUrl = (id: string | null) => (id ? brands().finvry.url + '/api/public/media/' + id : null)
// The logo as image bytes for PDFs and Excel (PNG or JPG only).
export async function companyLogoImage(): Promise<{ data: Buffer; ext: 'png' | 'jpeg' } | null> {
  const id = await companyLogoId(); if (!id) return null
  const doc = (await db().query<{ storage_key: string; mime_type: string }>('SELECT storage_key, mime_type FROM core.documents WHERE id = $1', [id])).rows[0]
  if (!doc || !/png|jpe?g/.test(doc.mime_type)) return null
  return getObject(doc.storage_key).then((x) => ({ data: Buffer.from(x), ext: (/png/.test(doc.mime_type) ? 'png' : 'jpeg') as 'png' | 'jpeg' })).catch(() => null)
}
export const ndaOn = (b: Branding, scope: string) => b.nda_enabled && b.nda_scopes.includes(scope)
// A signature is valid for the company for 12 months.
export async function ndaSigned(orgId: string, sigId: unknown): Promise<{ email: string; name: string } | null> {
  if (typeof sigId !== 'string' || !/^[0-9a-f-]{36}$/.test(sigId)) return null
  return (await asPlatform(() => db().query<{ email: string; name: string }>("SELECT email, name FROM fundraise.nda_signatures WHERE id = $1 AND organization_id = $2 AND signed_at > now() - interval '12 months'", [sigId, orgId]))).rows[0] ?? null
}
// A data room link from its token, or from its short address "@handle.name".
export interface RoomLink { id: string; organization_id: string; name: string; file_ids: string[]; require_email: boolean; allow_download: boolean; dead: boolean; notify: boolean; room_id: string | null }
export async function findRoomLink(ref: string): Promise<RoomLink | null> {
  const cols = "l.id, l.organization_id, l.name, l.file_ids, l.room_id, l.require_email, l.allow_download, (l.revoked OR (l.expires_at IS NOT NULL AND l.expires_at < now())) AS dead, (l.last_viewed_at IS NULL OR l.last_viewed_at < now() - interval '1 hour') AS notify"
  const m = ref.match(/^@([a-z0-9][a-z0-9-]{1,40})\.([a-z0-9][a-z0-9-]{1,40})$/)
  if (m) return (await asPlatform(() => db().query<RoomLink>('SELECT ' + cols + ' FROM fundraise.links l JOIN financials.public_pages p ON p.organization_id = l.organization_id AND p.slug = $1 WHERE l.slug = $2', [m[1], m[2]]))).rows[0] ?? null
  if (ref.length < 30) return null
  return (await asPlatform(() => db().query<RoomLink>('SELECT ' + cols + ' FROM fundraise.links l WHERE l.token_hash = $1', [sha256(ref)]))).rows[0] ?? null
}

// The data room a request is about: the one asked for, else the first one (made on first use).
export async function roomId(want?: unknown): Promise<string> {
  if (typeof want === 'string' && /^[0-9a-f-]{36}$/.test(want)) {
    const r = (await db().query<{ id: string }>('SELECT id FROM fundraise.rooms WHERE id = $1', [want])).rows[0]
    if (r) return r.id
    throw apiError('not_found', 'That data room was not found.', 404)
  }
  const first = (await db().query<{ id: string }>('SELECT id FROM fundraise.rooms ORDER BY created_at LIMIT 1')).rows[0]
  return first?.id ?? (await one<{ id: string }>("INSERT INTO fundraise.rooms (name) VALUES ('Data room') RETURNING id")).id
}
