// Workspace helpers.
export const LIVE_ORG_STATUSES = ['trial', 'active', 'past_due']

export interface OrgSettings { public_name?: string; brand?: string; default_vehicle_id?: string; notify_emails?: string[]; investor_name?: string; thesis?: string; [k: string]: unknown }

export async function currentOrg(): Promise<{ id: string; name: string; slug: string; kind: string; status: string; plan_code: string; settings: OrgSettings } | null> {
  let e: ReturnType<typeof useEvent> | undefined; try { e = useEvent() } catch { e = undefined }
  const cacheKey = 'org:' + String(e?.context.orgId ?? '')
  if (e && e.context[cacheKey] !== undefined) return e.context[cacheKey]
  const r = await db().query('SELECT id, name, slug, kind, status, plan_code, settings FROM core.organizations WHERE id = core.current_org()')
  const org = r.rows[0] ?? null
  if (e) e.context[cacheKey] = org
  return org
}

// Who hears about new pitches, reports and reminders: the workspace's notification list, else its admins.
export async function orgNotifyEmails(): Promise<string[]> {
  const org = await currentOrg()
  const list = (org?.settings.notify_emails ?? []).filter((x) => typeof x === 'string' && x.includes('@'))
  if (list.length) return list
  const a = await db().query<{ email: string }>(
    `SELECT DISTINCT u.email FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.user_roles r ON r.user_id = m.user_id
      WHERE m.status = 'active' AND u.status = 'active' AND r.role_code = 'admin' AND r.scope_entity_id IS NULL`)
  return a.rows.map((x) => x.email)
}

// Every live workspace, for scheduled jobs that run per workspace.
export async function liveOrgs(): Promise<{ id: string; name: string }[]> {
  return (await asPlatform(() => db().query<{ id: string; name: string }>('SELECT id, name FROM core.organizations WHERE status = ANY($1::text[]) ORDER BY created_at', [LIVE_ORG_STATUSES]))).rows
}

// How a workspace appears to founders and clients on public links: its name, the name founders see, and its brand.
export async function publicWorkspace(): Promise<{ name: string; firm: string; brand: 'aidi' | 'finvry' }> {
  const org = await currentOrg()
  if (!org) return { name: '', firm: '', brand: 'finvry' }
  return { name: org.name, firm: org.settings.public_name || org.name, brand: org.settings.brand === 'aidi' ? 'aidi' : 'finvry' }
}
