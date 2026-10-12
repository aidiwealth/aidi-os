// QuickBooks is a paid feature for Finvry companies: Startup, Scale (or a trial of either), or switched on by our team.
export async function qbAllowed(): Promise<boolean> {
  const org = await currentOrg()
  if (!org || org.kind !== 'company') return true
  const o = (await asPlatform(() => db().query<{ plan_code: string; extra: unknown }>("SELECT plan_code, settings->'extra_modules' AS extra FROM core.organizations WHERE id = $1", [org.id]))).rows[0]
  return !!o && (o.plan_code !== 'company_free' || (Array.isArray(o.extra) && (o.extra as string[]).includes('quickbooks')))
}
export async function requireQb(): Promise<void> {
  if (!(await qbAllowed())) throw apiError('upgrade_required', 'QuickBooks is available on the Startup and Scale plans. Upgrade to connect your books.', 402)
}
