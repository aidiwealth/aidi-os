// Documents behind a holding: a SAFE, note, share purchase agreement, certificate or side letter attached to the
// holder (and to the SAFE / note or share issuance). Each one is filed in Documents under Financing and, unless the
// person says no, in the data room's "Financing" room, in a folder for its funding round.
import { createHash, randomUUID } from 'node:crypto'

export const HOLDER_DOC_KINDS: Record<string, string> = { safe: 'SAFE', note: 'Convertible note', spa: 'Share purchase agreement', certificate: 'Share certificate', side_letter: 'Side letter', other: 'Other' }
export const ROUNDS = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Bridge', 'Common', 'Other']
const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
export const DOC_EXT = Object.keys(MIME)

// The funding round a document belongs to, from what we know (a chosen round, the share class, the file name).
export function roundOf(...hints: (string | null | undefined)[]): string {
  const t = hints.filter(Boolean).join(' ').toLowerCase()
  if (/pre[\s-]?seed/.test(t)) return 'Pre-seed'
  if (/series[\s-]?seed|\bseed\b/.test(t)) return 'Seed'
  const m = /series[\s-]?([a-e])\b/.exec(t); if (m) return 'Series ' + m[1]!.toUpperCase()
  if (/bridge/.test(t)) return 'Bridge'
  if (/\bsafe\b|convertible|\bnote\b/.test(t)) return 'SAFEs and notes'
  if (/common|founder/.test(t)) return 'Common'
  return 'Other'
}

// Stores an uploaded file in Documents (Financing).
export async function storeFinancingDoc(f: { name: string; data: Buffer }, title: string, entityId: string | null): Promise<string> {
  const ext = (f.name.split('.').pop() ?? '').toLowerCase()
  if (!MIME[ext]) throw apiError('bad_type', 'Upload a PDF, Word, image or Excel file.')
  if (f.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(f.data), contentType: MIME[ext]! }).catch((e: Error) => { console.error('[equity] store doc', e.message); throw apiError('storage', 'Could not store the file just now. Try again in a minute.', 503) })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'financing','normal',$4,$5,$6,$7)",
    [id, entityId, title.replace(/[^A-Za-z0-9 ._()&,'—-]/g, '').slice(0, 200) || 'Financing document', key, MIME[ext], f.data.length, createHash('sha256').update(f.data).digest('hex')])
  return id
}

// The data room's Financing room (made the first time it is needed).
async function financingRoom(): Promise<string> {
  const r = (await db().query<{ id: string }>("SELECT id FROM fundraise.rooms WHERE lower(name) = 'financing' ORDER BY created_at LIMIT 1")).rows[0]
  return r?.id ?? (await one<{ id: string }>("INSERT INTO fundraise.rooms (name, description) VALUES ('Financing', 'SAFEs, notes, share purchase agreements and certificates, by funding round') RETURNING id")).id
}

export interface AttachIn { captableId: string; holderId: string; convertibleId?: string | null; issuanceId?: string | null; documentId: string; kind: string; round?: string | null; hint?: string | null; toRoom: boolean; userId: string | null }
export async function attachHolderDoc(a: AttachIn): Promise<{ id: string; round: string; in_room: boolean }> {
  const h = (await db().query<{ name: string }>('SELECT name FROM equity.holders WHERE id = $1 AND captable_id = $2', [a.holderId, a.captableId])).rows[0]
  if (!h) throw apiError('not_found', 'That holder is not on this cap table.', 404)
  if (a.convertibleId && !(await db().query('SELECT 1 FROM equity.convertibles WHERE id = $1 AND holder_id = $2', [a.convertibleId, a.holderId])).rowCount) a.convertibleId = null
  if (a.issuanceId && !(await db().query('SELECT 1 FROM equity.issuances WHERE id = $1 AND holder_id = $2', [a.issuanceId, a.holderId])).rowCount) a.issuanceId = null
  const cls = a.issuanceId ? (await db().query<{ name: string }>('SELECT c.name FROM equity.issuances i JOIN equity.classes c ON c.id = i.class_id WHERE i.id = $1', [a.issuanceId])).rows[0]?.name : null
  const kind = HOLDER_DOC_KINDS[a.kind] ? a.kind : 'other'
  const round = (a.round && a.round.trim()) || roundOf(cls, a.hint, kind === 'safe' || kind === 'note' ? 'safe' : '')
  const doc = (await db().query<{ title: string }>('SELECT title FROM core.documents WHERE id = $1', [a.documentId])).rows[0]
  if (!doc) throw apiError('not_found', 'Document not found.', 404)
  // Filed under Financing in Documents, named after what it is and whose it is.
  const title = HOLDER_DOC_KINDS[kind] + ' — ' + h.name + (round && round !== 'Other' ? ' (' + round + ')' : '')
  await db().query("UPDATE core.documents SET kind = 'financing', title = CASE WHEN title LIKE 'Cap table source - %' OR title LIKE 'Upload%' THEN $2 ELSE title END WHERE id = $1", [a.documentId, title.slice(0, 200)])
  let roomFile: string | null = null
  if (a.toRoom) {
    const room = await financingRoom()
    roomFile = (await db().query<{ id: string }>('SELECT id FROM fundraise.files WHERE document_id = $1 AND room_id = $2', [a.documentId, room])).rows[0]?.id
      ?? (await one<{ id: string }>('INSERT INTO fundraise.files (document_id, title, folder, room_id) VALUES ($1, $2, $3, $4) RETURNING id', [a.documentId, title.slice(0, 200), round.slice(0, 60), room])).id
  }
  const id = (await one<{ id: string }>(`INSERT INTO equity.holder_docs (captable_id, holder_id, convertible_id, issuance_id, document_id, kind, round, room_file_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (holder_id, document_id) DO UPDATE SET convertible_id = coalesce(EXCLUDED.convertible_id, equity.holder_docs.convertible_id), issuance_id = coalesce(EXCLUDED.issuance_id, equity.holder_docs.issuance_id), kind = EXCLUDED.kind, round = EXCLUDED.round, room_file_id = coalesce(EXCLUDED.room_file_id, equity.holder_docs.room_file_id) RETURNING id`,
    [a.captableId, a.holderId, a.convertibleId ?? null, a.issuanceId ?? null, a.documentId, kind, round.slice(0, 60), roomFile, a.userId])).id
  return { id, round, in_room: !!roomFile }
}
