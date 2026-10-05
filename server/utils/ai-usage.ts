// AI allowances, like Claude's: a 5-hour session (starting with the first AI action after the last session ended) and a
// calendar week (Monday 00:00 UTC). Beyond either, usage is paid from AI credits; with no credits, AI pauses until reset.
export const PACKS: Record<string, { tokens: number; usd: number; ngn: number; label: string }> = {
  small: { tokens: 1_000_000, usd: 10, ngn: 15000, label: '1M tokens' }, medium: { tokens: 5_000_000, usd: 40, ngn: 60000, label: '5M tokens' }, large: { tokens: 15_000_000, usd: 100, ngn: 150000, label: '15M tokens' } }
export interface Allowance { limited: boolean; session: { used: number; limit: number | null; resets_at: string | null }; weekly: { used: number; limit: number | null; resets_at: string }; credits: number; over: boolean; blocked: boolean }
export async function aiAllowance(orgId: string): Promise<Allowance> {
  return asPlatform(async () => {
    const p = (await db().query<{ s: string | null; w: string | null }>('SELECT p.ai_session_tokens::text AS s, p.ai_weekly_tokens::text AS w FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code WHERE o.id = $1', [orgId])).rows[0]
    const sl = p?.s ? Number(p.s) : null, wl = p?.w ? Number(p.w) : null
    const now = new Date(), wk = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
    const r = (await db().query<{ start: string | null; sess: string; week: string }>(`SELECT (SELECT min(created_at) FROM core.ai_runs WHERE organization_id = $1 AND created_at > now() - interval '5 hours')::text AS start,
        coalesce((SELECT sum(input_tokens + output_tokens) FROM core.ai_runs WHERE organization_id = $1 AND billed_to = 'plan' AND created_at > now() - interval '5 hours'), 0)::text AS sess,
        coalesce((SELECT sum(input_tokens + output_tokens) FROM core.ai_runs WHERE organization_id = $1 AND billed_to = 'plan' AND created_at >= $2), 0)::text AS week`, [orgId, wk.toISOString()])).rows[0]!
    const credits = Number((await db().query<{ t: string }>('SELECT tokens::text AS t FROM ai.credits WHERE organization_id = $1', [orgId])).rows[0]?.t ?? 0)
    const su = Number(r.sess), wu = Number(r.week)
    const over = (sl !== null && su >= sl) || (wl !== null && wu >= wl)
    return { limited: sl !== null || wl !== null, session: { used: su, limit: sl, resets_at: r.start ? new Date(new Date(r.start).getTime() + 5 * 3600 * 1000).toISOString() : null },
      weekly: { used: wu, limit: wl, resets_at: new Date(wk.getTime() + 7 * 86400 * 1000).toISOString() }, credits, over, blocked: over && credits <= 0 }
  })
}
const fmtLeft = (iso: string | null) => { if (!iso) return 'soon'; const m = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000)); return m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m + ' min' }
// Called before every AI action. Returns how the action is billed; throws when AI is paused for this workspace.
export async function aiGate(): Promise<{ orgId: string | null; billed: 'plan' | 'credits' }> {
  const orgId = currentOrgId()
  if (!orgId) return { orgId: null, billed: 'plan' }
  const a = await aiAllowance(orgId)
  if (!a.limited || !a.over) return { orgId, billed: 'plan' }
  if (a.credits > 0) return { orgId, billed: 'credits' }
  const sessionOut = a.session.limit !== null && a.session.used >= a.session.limit
  throw apiError('ai_limit', sessionOut ? 'You have used this session\'s AI allowance. It resets in ' + fmtLeft(a.session.resets_at) + ', or buy AI credits in Settings → AI usage to keep going.' : 'You have used this week\'s AI allowance. It resets on Monday, or buy AI credits in Settings → AI usage to keep going.', 429)
}
// After an action billed to credits: take its tokens from the balance (never below zero).
export async function aiChargeCredits(orgId: string, tokens: number): Promise<void> {
  if (tokens > 0) await asPlatform(() => db().query('UPDATE ai.credits SET tokens = greatest(0, tokens - $2), updated_at = now() WHERE organization_id = $1', [orgId, tokens]))
}
