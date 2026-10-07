// US (and fallback) KYC: upload the client's ID document; staff then mark KYC verified.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const f = ((await readMultipartFormData(event)) ?? []).find((p) => p.name === 'file' && p.filename && p.data.length)
  if (!/^[0-9a-f-]{36}$/.test(id) || !f) throw apiError('invalid', 'Choose the ID document.')
  const mime = f.type || 'application/octet-stream'
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'Upload a PDF or an image.')
  const doc = randomUUID(), key = 'documents/' + doc + '.' + (mime === 'application/pdf' ? 'pdf' : mime.split('/')[1])
  await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [doc, 'KYC ID — ' + (f.filename ?? 'document').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150), key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
  await db().query("UPDATE wm.clients SET kyc_doc_id = $2, kyc_status = CASE WHEN kyc_status = 'verified' THEN kyc_status ELSE 'pending' END, kyc_provider = coalesce(kyc_provider, 'document'), updated_at = now() WHERE id = $1", [id, doc])
  await audit({ event, actorUserId: user.userId, action: 'wm.kyc_doc', objectType: 'wm_client', objectId: id })
  return { ok: true }
})
