// An uploaded workbook (Excel or CSV) kept as a restricted document, so the rows chosen from it can be brought in
// once after the founder has picked them (an uploaded file does not stay in step like a link).
import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

export interface SheetUpload { buf: Buffer; ext: 'xlsx' | 'csv'; name: string; docId: string; fields: Record<string, string> }

export async function storeSheetUpload(event: H3Event): Promise<SheetUpload> {
  const parts = await readMultipartFormData(event)
  const file = parts?.find((x) => x.name === 'file' && x.filename)
  const fields: Record<string, string> = {}
  for (const p of parts ?? []) if (!p.filename && p.name) fields[p.name] = p.data.toString().slice(0, 600)
  const ext = (file?.filename ?? '').split('.').pop()?.toLowerCase()
  if (!file?.data.length || (ext !== 'xlsx' && ext !== 'csv')) throw apiError('invalid', 'Upload an Excel (.xlsx) or CSV file.')
  if (file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'That file is too large (15 MB maximum).', 413)
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext, mime = ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime }).catch((e: Error) => { console.error('[sheets] upload store', e.message); throw apiError('storage', 'Could not store the file just now. Try again in a minute.', 503) })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)",
    [docId, 'Financial model — ' + (file.filename ?? 'workbook').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 120), key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex')])
  return { buf: Buffer.from(file.data), ext, name: file.filename ?? 'workbook', docId, fields }
}

export async function loadSheetUpload(docId: string): Promise<{ buf: Buffer; ext: 'xlsx' | 'csv' }> {
  const d = (await db().query<{ storage_key: string; mime_type: string }>("SELECT storage_key, mime_type FROM core.documents WHERE id = $1 AND title LIKE 'Financial model — %'", [docId])).rows[0]
  if (!d) throw apiError('not_found', 'That upload was not found. Upload the file again.', 404)
  return { buf: Buffer.from(await getObject(d.storage_key)), ext: d.mime_type === 'text/csv' ? 'csv' : 'xlsx' }
}
