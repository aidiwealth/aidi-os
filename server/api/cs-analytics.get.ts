// Client Services analytics: workload, overdue, turnaround, fees, by service and client. Filter by delivering entity.
import { z } from 'zod'
const Q = z.object({ entity: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), range: z.enum(['90d', '12m', 'all']).default('12m') })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Bad filter.')
  const { entity, range } = q.data
  const since = rangeSql(range), bucket = bucketFor(range)
  const ef = ''
  const args: string[] = []; void entity
  const k = await one<{ open: number; overdue: number; waiting: number; created: number; completed: number; avg_days: string | null; fees: string | null; pipeline_fees: string | null; clients: number }>(
    `SELECT count(*) FILTER (WHERE j.status NOT IN ('completed','cancelled'))::int AS open,
            count(*) FILTER (WHERE j.status NOT IN ('completed','cancelled') AND j.due_date < current_date)::int AS overdue,
            count(*) FILTER (WHERE j.status = 'waiting_client')::int AS waiting,
            count(*) FILTER (WHERE j.created_at >= ${since})::int AS created,
            count(*) FILTER (WHERE j.completed_at >= ${since})::int AS completed,
            (avg(extract(epoch FROM (j.completed_at - j.created_at)) / 86400) FILTER (WHERE j.completed_at >= ${since}))::numeric(10,1)::text AS avg_days,
            (sum(j.fee_usd) FILTER (WHERE j.completed_at >= ${since}))::text AS fees,
            (sum(j.fee_usd) FILTER (WHERE j.status NOT IN ('completed','cancelled')))::text AS pipeline_fees,
            count(DISTINCT j.client_id) FILTER (WHERE j.status NOT IN ('completed','cancelled'))::int AS clients
       FROM services.jobs j WHERE true ${ef}`, args)
  const created = await db().query<{ b: string; v: number }>(`SELECT to_char(date_trunc('${bucket}', j.created_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM services.jobs j WHERE j.created_at >= ${since} ${ef} GROUP BY 1 ORDER BY 1`, args)
  const done = await db().query<{ b: string; v: number }>(`SELECT to_char(date_trunc('${bucket}', j.completed_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM services.jobs j WHERE j.completed_at >= ${since} ${ef} GROUP BY 1 ORDER BY 1`, args)
  const fees = await db().query<{ b: string; v: string }>(`SELECT to_char(date_trunc('${bucket}', j.completed_at), 'YYYY-MM-DD') AS b, sum(coalesce(j.fee_usd, 0))::text AS v FROM services.jobs j WHERE j.completed_at >= ${since} ${ef} GROUP BY 1 ORDER BY 1`, args)
  const byService = await db().query<{ service: string; c: number }>(`SELECT j.service, count(*)::int AS c FROM services.jobs j WHERE j.status NOT IN ('completed','cancelled') ${ef} GROUP BY 1 ORDER BY 2 DESC`, args)
  const byStatus = await db().query<{ status: string; c: number }>(`SELECT j.status, count(*)::int AS c FROM services.jobs j WHERE true ${ef} GROUP BY 1`, args)
  const topClients = await db().query<{ name: string; v: string; jobs: number }>(
    `SELECT c.name, coalesce(sum(j.fee_usd), 0)::text AS v, count(*)::int AS jobs FROM services.jobs j JOIN services.clients c ON c.id = j.client_id
      WHERE j.created_at >= ${since} ${ef} GROUP BY 1 ORDER BY sum(j.fee_usd) DESC NULLS LAST, count(*) DESC LIMIT 6`, args)
  const overdueList = await db().query<{ id: string; title: string; client: string; due_date: string }>(
    `SELECT j.id, j.title, c.name AS client, to_char(j.due_date, 'YYYY-MM-DD') AS due_date FROM services.jobs j JOIN services.clients c ON c.id = j.client_id
      WHERE j.status NOT IN ('completed','cancelled') AND j.due_date < current_date ${ef} ORDER BY j.due_date LIMIT 8`, args)
  const keys = seriesKeys(range, bucket, created.rows[0]?.b)
  return {
    range, bucket,
    kpis: { ...k, avgDays: k.avg_days === null ? null : Number(k.avg_days), fees: Number(k.fees ?? 0), pipelineFees: Number(k.pipeline_fees ?? 0) },
    createdSeries: fillSeries(created.rows, keys), completedSeries: fillSeries(done.rows, keys), feeSeries: fillSeries(fees.rows, keys),
    byService: byService.rows.map((r) => ({ label: SERVICES[r.service] ?? r.service, c: r.c })),
    byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.c])),
    topClients: topClients.rows.map((r) => ({ name: r.name, fees: Number(r.v), jobs: r.jobs })),
    overdue: overdueList.rows
  }
})
