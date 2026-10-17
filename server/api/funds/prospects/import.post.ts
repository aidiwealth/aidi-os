// Read a list of prospective LPs: an uploaded Excel / CSV / PDF / Word file, or a Google Sheet (or Excel online)
// link. Runs in the background; with a pipeline, each LP is also ranked by how likely it is to commit. Nothing is
// saved until someone picks.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('lp_import', user.userId, 20, 60 * 60 * 1000)
  const parts = (await readMultipartFormData(event)) ?? []
  const val = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  const link = val('url'), pid = val('pipeline_id')
  if (pid && (!/^[0-9a-f-]{36}$/.test(pid) || !(await db().query('SELECT 1 FROM funds.lp_pipelines WHERE id = $1', [pid])).rowCount)) throw apiError('not_found', 'Pipeline not found.', 404)
  const files = parts.filter((p) => p.filename && p.data?.length).slice(0, 5).map((p) => ({ name: p.filename!, data: Buffer.from(p.data) }))
  if (!files.length && !link) throw apiError('invalid', 'Add the list, or paste a Google Sheet link.')
  if (link && !/^https:\/\//i.test(link)) throw apiError('invalid', 'Paste the sheet\'s https:// share link.')
  if (files.some((f) => f.data.length > 20 * 1024 * 1024)) throw apiError('too_large', 'Files can be up to 20 MB.', 413)
  const sheet = files.find((f) => /\.(xlsx|csv)$/i.test(f.name))
  if (files.length && !sheet && !files.every((f) => /\.(pdf|docx|txt|md)$/i.test(f.name))) throw apiError('bad_type', 'Use Excel (.xlsx), CSV, PDF or Word (.docx).')
  const id = await startAiJob(event, 'lp_import', user.userId, async (set) => {
    let rows: LpRow[], tab = '', from = ''
    if (link) { await set('fetch', {}); const f = await fetchLinkedSheet(link); from = f.provider + ' link'; await set('read', {}); const r = await lpRowsFromGrids(await readGrids(f.buf, f.ext, { tabs: 20, rows: 800, cols: 40 }), 'lp-import'); rows = r.rows; tab = r.sheet }
    else if (sheet) { from = sheet.name; await set('read', {}); const r = await lpRowsFromGrids(await readGrids(sheet.data, /\.csv$/i.test(sheet.name) ? 'csv' : 'xlsx', { tabs: 20, rows: 800, cols: 40 }), 'lp-import'); rows = r.rows; tab = r.sheet }
    else { from = files.map((f) => f.name).join(', '); await set('read', {}); rows = await lpRowsFromDocs(files, 'lp-import') }
    const have = new Set((await db().query<{ k: string }>('SELECT lower(name) AS k FROM funds.lp_prospects')).rows.map((r) => r.k))
    if (pid) { await set('score', { done: 0, total: rows.length }); await scoreLps(rows, (await pipelineMandate(pid)).text, 'lp-pipeline:' + pid, (done, total) => set('score', { done, total })); rows.sort((a, b) => (b.likelihood ?? 0) - (a.likelihood ?? 0)) }
    return { rows: rows.map((r) => ({ ...r, on_list: have.has(r.name.toLowerCase()) })), from, tab, source: link ? 'sheet' : 'import' }
  }, (err) => {
    const e = err as { statusCode?: number; data?: { error?: { message?: string } } }
    if (link && (!e.statusCode || e.statusCode !== 402)) return { message: e.statusCode && e.data?.error?.message ? e.data.error.message : 'Could not open that sheet.', advice: ['Share it so anyone with the link can view it.', 'Or download it as Excel and drop the file here.'] }
    return aiJobError(err, ['Check the file has one row per LP with a name column.', 'Or add LPs one by one.'])
  })
  return { id }
})
