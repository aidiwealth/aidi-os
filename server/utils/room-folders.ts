// Data room folders: files keep the name of their top-level category in fundraise.files.folder (what everything that
// files documents by name relies on). After folders are renamed or moved, this sets each file's category name, and its
// room when given, in one statement so the folder and the name never disagree.
export async function resyncFiles(folderIds: string[], room: string | null = null) {
  if (!folderIds.length) return
  await db().query(`WITH RECURSIVE up AS (SELECT f.id AS start, f.id, f.parent_id, f.name FROM fundraise.folders f WHERE f.id = ANY($1::uuid[])
      UNION ALL SELECT up.start, p.id, p.parent_id, p.name FROM fundraise.folders p JOIN up ON p.id = up.parent_id)
    UPDATE fundraise.files x SET folder = left(r.name, 60), room_id = coalesce($2::uuid, x.room_id)
    FROM (SELECT start, name FROM up WHERE parent_id IS NULL) r WHERE x.folder_id = r.start`, [folderIds, room])
}
