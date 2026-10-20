// Bank connections by country. Live balances come through Plaid, which covers US banks. Nigerian banks need Mono, which
// the Finvry team switches on in the platform settings (platform.settings 'integrations'); until then a Nigerian
// company or subsidiary is not offered "Connect a bank".
export async function monoOn(): Promise<boolean> {
  const r = await asPlatform(() => db().query<{ value: { mono?: boolean } }>("SELECT value FROM platform.settings WHERE key = 'integrations'")).catch(() => ({ rows: [] as { value: { mono?: boolean } }[] }))
  return !!r.rows[0]?.value?.mono
}
const NG = (s: string | null | undefined) => /^(ng|nga|nigeria)\b/i.test(String(s ?? '').trim())
// Whether this company (an entity id: a subsidiary's own page) or, with none, the workspace banks in Nigeria.
export async function nigerianBanking(entityId?: string | null): Promise<boolean> {
  if (entityId) {
    const e = (await db().query<{ currency: string | null; jurisdiction: string | null }>('SELECT currency, jurisdiction FROM core.entities WHERE id = $1', [entityId])).rows[0]
    if (e) return e.currency === 'NGN' || NG(e.jurisdiction)
  }
  const org = await currentOrg()
  const s = (org?.settings ?? {}) as Record<string, unknown>
  return org?.kind === 'company' && (s.currency === 'NGN' || NG(s.country as string))
}
