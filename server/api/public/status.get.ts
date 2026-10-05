// Public status: current checks and 90-day daily uptime per component.
export default defineEventHandler(async () => {
  const now = await runChecks()
  const hist = (await asPlatform(() => db().query<{ component: string; day: string; ok: number; total: number }>(
    "SELECT component, to_char(date_trunc('day', checked_at), 'YYYY-MM-DD') AS day, sum(CASE WHEN ok THEN 1 ELSE 0 END)::int AS ok, count(*)::int AS total FROM core.status_checks WHERE checked_at > now() - interval '90 days' GROUP BY 1, 2"))).rows
  const incidents = (await asPlatform(() => db().query("SELECT component, min(checked_at) AS started, max(checked_at) AS last, count(*)::int AS checks FROM core.status_checks WHERE NOT ok AND checked_at > now() - interval '14 days' AND component IN ('app','api','database') GROUP BY component, date_trunc('hour', checked_at) ORDER BY 2 DESC LIMIT 10"))).rows
  return { checked_at: new Date().toISOString(), components: COMPONENTS.filter(([k]) => now.some((x) => x.component === k)).map(([k, label]) => { const c = now.find((x) => x.component === k)!; const h = hist.filter((x) => x.component === k); const ok = h.reduce((a, x) => a + x.ok, 0), tot = h.reduce((a, x) => a + x.total, 0)
    return { key: k, label, ok: c.ok, note: c.note, latency_ms: c.latency_ms, uptime: tot ? Math.round((ok / tot) * 10000) / 100 : null, days: h.map((x) => ({ day: x.day, ok: x.ok, total: x.total })) } }), incidents }
})
