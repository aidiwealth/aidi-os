// The kind of business a Financials subject is (Business type), so margins are judged against similar companies.
// The group has none of its own: it takes the main company's.
export async function businessModelOf(subject: string): Promise<string | null> {
  const org = await currentOrg()
  const all = (org?.settings.business_models as Record<string, string> | undefined) ?? {}
  if (subject === 'group') { const main = await companyEntityId(); return main ? all['entity:' + main] ?? null : null }
  return all[subject] ?? null
}
