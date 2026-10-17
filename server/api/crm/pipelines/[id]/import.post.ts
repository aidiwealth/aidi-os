import type { ImpRow } from '~/server/utils/investor-import'
// Upload an investor list (Excel / CSV, or a PDF / Word document) for this pipeline: AI finds the investors and how
// likely each is to invest in this round. Runs in the background; nothing is added until the founder picks.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await requireModule(event, 'fundraising')
  await rateLimit('pipeline_import', user.userId, 15, 60 * 60 * 1000)
  const pid = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(pid) || !(await db().query('SELECT 1 FROM crm.pipelines WHERE id = $1', [pid])).rowCount) throw apiError('not_found', 'Pipeline not found.', 404)
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.filename && p.data?.length).slice(0, 5).map((p) => ({ name: p.filename!, data: Buffer.from(p.data) }))
  if (!files.length) throw apiError('invalid', 'Add the list (Excel, CSV, PDF or Word).')
  if (files.some((f) => f.data.length > 20 * 1024 * 1024)) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const sheet = files.find((f) => /\.(xlsx|csv)$/i.test(f.name))
  if (!sheet && !files.every((f) => /\.(pdf|docx|txt|md)$/i.test(f.name))) throw apiError('bad_type', 'Use Excel (.xlsx), CSV, PDF or Word (.docx).')
  const ref = 'pipeline:' + pid
  const id = await startAiJob(event, 'pipeline_import', user.userId, async (set) => {
    await set('read', { file: (sheet ?? files[0]!).name })
    let rows: ImpRow[], tab = ''
    if (sheet) { const r = await rowsFromGrids(await readGrids(sheet.data, /\.csv$/i.test(sheet.name) ? 'csv' : 'xlsx', { tabs: 20, rows: 600, cols: 40 }), ref); rows = r.rows; tab = r.sheet }
    else rows = await rowsFromDocs(files, ref)
    // Already in this pipeline: kept, but marked.
    const have = new Set((await db().query<{ k: string }>('SELECT lower(investor) AS k FROM crm.deals WHERE pipeline_id = $1', [pid])).rows.map((r) => r.k))
    await set('score', { rows: rows.length, done: 0 })
    await scoreRows(rows, await roundProfile(pid), ref, (done, total) => set('score', { done, total }))
    rows.sort((a, b) => (b.likelihood ?? 0) - (a.likelihood ?? 0))
    return { rows: rows.map((r) => ({ ...r, in_pipeline: have.has(r.name.toLowerCase()) })), file: (sheet ?? files[0]!).name, tab }
  }, (err) => aiJobError(err, ['Check the file has one row per investor with a name column.', 'Or add investors one by one with New investor (Fill with AI).']))
  return { id }
})
