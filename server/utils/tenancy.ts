// Workspace helpers.
export const LIVE_ORG_STATUSES = ['trial', 'active', 'past_due']

export interface OrgSettings { default_vehicle_id?: string; notify_emails?: string[]; investor_name?: string; thesis?: string; [k: string]: unknown }

export async function currentOrg(): Promise<{ id: string; name: string; slug: string; kind: string; status: string; plan_code: string; settings: OrgSettings } | null> {
  const r = await db().query('SELECT id, name, slug, kind, status, plan_code, settings FROM core.organizations WHERE id = core.current_org()')
  return r.rows[0] ?? null
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
