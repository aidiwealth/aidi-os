// Client Services analytics: workload, overdue, turnaround, fees, by service and client. Filter by delivering entity.
import { z } from 'zod'
const Q = z.object({ entity: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), range: z.enum(['90d', '12m', 'all']).default('all') })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Bad filter.')
  const { entity, range } = q.data
  const since = rangeSql(range), bucket = bucketFor(range)
  const ef = ''
  const args: string[] = []; void entity
  // Fees are what clients actually paid on service invoices (paid date; NGN converted to USD), falling back to a
  // job's quoted fee only when it has no invoice. A job logged after the fact (an old order) is dated from its
  // invoice, not from the day it was entered, and is left out of turnaround.
  const ngn = (await fxRate('NGN', 'USD')) ?? 0
  const J = `WITH inv AS (SELECT job_id, min(issue_date) AS first_issue FROM services.invoices WHERE job_id IS NOT NULL AND status <> 'void' GROUP BY 1),
    jj AS (SELECT j.*, (inv.first_issue IS NOT NULL AND inv.first_issue < (j.created_at::date - 7)) AS backfilled,
                  CASE WHEN inv.first_issue IS NOT NULL AND inv.first_issue < (j.created_at::date - 7) THEN inv.first_issue::timestamptz ELSE j.created_at END AS opened_at
             FROM services.jobs j LEFT JOIN inv ON inv.job_id = j.id),
    jd AS (SELECT jj.*, CASE WHEN jj.status = 'completed' THEN CASE WHEN jj.backfilled THEN jj.opened_at ELSE jj.completed_at END END AS done_at FROM jj),
    pay AS (SELECT i.client_id, i.job_id, coalesce(i.paid_at, i.issue_date)::timestamptz AS at, CASE WHEN i.currency = 'NGN' THEN i.amount * ${ngn} ELSE i.amount END AS usd
              FROM services.invoices i WHERE i.status = 'paid'
            UNION ALL SELECT j.client_id, j.id, j.done_at, j.fee_usd FROM jd j WHERE j.done_at IS NOT NULL AND j.fee_usd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM services.invoices i WHERE i.job_id = j.id AND i.status <> 'void'))`
  const k = await one<{ open: number; overdue: number; waiting: number; created: number; completed: number; avg_days: string | null; clients: number; first: string | null }>(
    `${J} SELECT count(*) FILTER (WHERE j.status NOT IN ('completed','cancelled'))::int AS open,
            count(*) FILTER (WHERE j.status NOT IN ('completed','cancelled') AND j.due_date < current_date)::int AS overdue,
            count(*) FILTER (WHERE j.status = 'waiting_client')::int AS waiting,
            count(*) FILTER (WHERE j.opened_at >= ${since})::int AS created,
            count(*) FILTER (WHERE j.done_at >= ${since})::int AS completed,
            (avg(extract(epoch FROM (j.completed_at - j.created_at)) / 86400) FILTER (WHERE j.completed_at >= ${since} AND NOT j.backfilled))::numeric(10,1)::text AS avg_days,
            count(DISTINCT j.client_id) FILTER (WHERE j.status NOT IN ('completed','cancelled'))::int AS clients,
            to_char(least(min(j.opened_at), (SELECT min(at) FROM pay)), 'YYYY-MM-DD') AS first
       FROM jd j`)
  const f = await one<{ fees: string | null; pipeline: string | null }>(
    `${J} SELECT (SELECT sum(usd) FROM pay WHERE at >= ${since})::text AS fees,
            (SELECT sum(CASE WHEN i.currency = 'NGN' THEN i.amount * ${ngn} ELSE i.amount END) FROM services.invoices i WHERE i.status = 'sent')::text AS pipeline`)
  const created = await db().query<{ b: string; v: number }>(`${J} SELECT to_char(date_trunc('${bucket}', j.opened_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM jd j WHERE j.opened_at >= ${since} GROUP BY 1 ORDER BY 1`)
  const done = await db().query<{ b: string; v: number }>(`${J} SELECT to_char(date_trunc('${bucket}', j.done_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM jd j WHERE j.done_at >= ${since} GROUP BY 1 ORDER BY 1`)
  const fees = await db().query<{ b: string; v: string }>(`${J} SELECT to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') AS b, sum(usd)::text AS v FROM pay WHERE at >= ${since} GROUP BY 1 ORDER BY 1`)
  const byService = await db().query<{ service: string; c: number }>(`SELECT j.service, count(*)::int AS c FROM services.jobs j WHERE j.status NOT IN ('completed','cancelled') ${ef} GROUP BY 1 ORDER BY 2 DESC`, args)
  const byStatus = await db().query<{ status: string; c: number }>(`SELECT j.status, count(*)::int AS c FROM services.jobs j WHERE true ${ef} GROUP BY 1`, args)
  const topClients = await db().query<{ name: string; v: string; jobs: number }>(
    `${J} SELECT * FROM (SELECT c.name, coalesce((SELECT sum(usd) FROM pay p WHERE p.client_id = c.id AND p.at >= ${since}), 0)::text AS v,
            (SELECT count(*)::int FROM jd j WHERE j.client_id = c.id AND (j.opened_at >= ${since} OR j.status NOT IN ('completed','cancelled'))) AS jobs
       FROM services.clients c) x ORDER BY v::numeric DESC, jobs DESC LIMIT 8`)
  const overdueList = await db().query<{ id: string; title: string; client: string; due_date: string }>(
    `SELECT j.id, j.title, c.name AS client, to_char(j.due_date, 'YYYY-MM-DD') AS due_date FROM services.jobs j JOIN services.clients c ON c.id = j.client_id
      WHERE j.status NOT IN ('completed','cancelled') AND j.due_date < current_date ${ef} ORDER BY j.due_date LIMIT 8`, args)
  const keys = seriesKeys(range, bucket, k.first ? k.first.slice(0, 7) + '-01' : undefined)
  return {
    range, bucket,
    kpis: { ...k, avgDays: k.avg_days === null ? null : Number(k.avg_days), fees: Number(f.fees ?? 0), pipelineFees: Number(f.pipeline ?? 0) },
    createdSeries: fillSeries(created.rows, keys), completedSeries: fillSeries(done.rows, keys), feeSeries: fillSeries(fees.rows, keys),
    byService: byService.rows.map((r) => ({ label: SERVICES[r.service] ?? r.service, c: r.c })),
    byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.c])),
    topClients: topClients.rows.filter((r) => Number(r.v) > 0 || r.jobs > 0).slice(0, 6).map((r) => ({ name: r.name, fees: Number(r.v), jobs: r.jobs })),
    overdue: overdueList.rows
  }
})
