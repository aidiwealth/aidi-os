// AI usage for this workspace: session and weekly meters, credits, packs, and usage by day and feature (30 days).
// (The return type is kept loose on purpose: an inferred one makes typed fetch inference too deep.)
export default defineEventHandler(async (event): Promise<Record<string, unknown>> => {
  await requireUser(event)
  const org = (await currentOrg())!
  const a = await aiAllowance(org.id)
  const days = await db().query("SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, sum(input_tokens + output_tokens)::float AS tokens FROM core.ai_runs WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1")
  const tasks = await db().query("SELECT task, count(*)::int AS runs, sum(input_tokens + output_tokens)::float AS tokens FROM core.ai_runs WHERE created_at > now() - interval '30 days' GROUP BY task ORDER BY tokens DESC LIMIT 12")
  const purchases = await db().query('SELECT pack, tokens::float, amount_minor::float, currency, created_at FROM ai.purchases ORDER BY created_at DESC LIMIT 20')
  const w = org.kind === 'company' ? await walletOf(org.id) : null
  return { ...a, plan: org.plan_code, currency: w?.currency ?? 'USD', wallet_minor: w?.balance_minor ?? 0, packs: Object.entries(PACKS).map(([key, p]) => ({ key, ...p })), days: days.rows, tasks: tasks.rows, purchases: purchases.rows }
})
