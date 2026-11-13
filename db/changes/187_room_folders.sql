-- Data room folders: categories in the order the company sets, sub-folders inside them (any depth), and link
-- categories that open a folder elsewhere (Google Drive, Dropbox…). fundraise.files.folder keeps the top-level
-- category's name, as before, so everything that files documents by category name keeps working.
CREATE TABLE IF NOT EXISTS fundraise.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES fundraise.rooms(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES fundraise.folders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  position integer NOT NULL DEFAULT 0,
  link_url text CHECK (link_url IS NULL OR (length(link_url) <= 2000 AND link_url ~* '^https?://')),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS folders_room_idx ON fundraise.folders (room_id, parent_id, position);
ALTER TABLE fundraise.folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fundraise.folders;
CREATE POLICY tenant_isolation ON fundraise.folders USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraise.folders TO aidi_os_app;

ALTER TABLE fundraise.files ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES fundraise.folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS files_folder_idx ON fundraise.files (folder_id);

-- Today's categories become top-level folders, in the order they showed (by name).
INSERT INTO fundraise.folders (organization_id, room_id, name, position)
SELECT f.organization_id, f.room_id, f.folder, (row_number() OVER (PARTITION BY f.room_id ORDER BY f.folder))::int - 1
FROM (SELECT DISTINCT organization_id, room_id, folder FROM fundraise.files WHERE room_id IS NOT NULL AND NOT is_deck) f
WHERE NOT EXISTS (SELECT 1 FROM fundraise.folders x WHERE x.room_id = f.room_id AND x.parent_id IS NULL AND x.name = f.folder);
UPDATE fundraise.files f SET folder_id = x.id FROM fundraise.folders x
WHERE f.folder_id IS NULL AND NOT f.is_deck AND x.room_id = f.room_id AND x.parent_id IS NULL AND x.name = f.folder AND x.link_url IS NULL;

-- Keeps a file's folder and its category name in step, whichever one is set:
--   a folder chosen (folder_id) sets the category name to its top-level folder's;
--   a category name given (as every existing insert does) finds or makes that top-level folder in the room.
CREATE OR REPLACE FUNCTION fundraise.file_folder_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rname text; fid uuid;
BEGIN
  IF NEW.room_id IS NULL OR NEW.is_deck THEN RETURN NEW; END IF;
  IF NEW.folder_id IS NOT NULL THEN
    WITH RECURSIVE up AS (
      SELECT id, parent_id, name, room_id FROM fundraise.folders WHERE id = NEW.folder_id
      UNION ALL SELECT p.id, p.parent_id, p.name, p.room_id FROM fundraise.folders p JOIN up ON p.id = up.parent_id)
    SELECT name INTO rname FROM up WHERE parent_id IS NULL AND room_id = NEW.room_id LIMIT 1;
  END IF;
  IF rname IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.folder_id IS DISTINCT FROM OLD.folder_id) THEN NEW.folder := rname; RETURN NEW; END IF;
  IF rname IS NOT NULL AND rname = NEW.folder THEN RETURN NEW; END IF;
  SELECT id INTO fid FROM fundraise.folders WHERE room_id = NEW.room_id AND parent_id IS NULL AND name = NEW.folder AND link_url IS NULL ORDER BY position LIMIT 1;
  IF fid IS NULL THEN
    INSERT INTO fundraise.folders (organization_id, room_id, name, position)
    VALUES (NEW.organization_id, NEW.room_id, NEW.folder, coalesce((SELECT max(position) + 1 FROM fundraise.folders WHERE room_id = NEW.room_id AND parent_id IS NULL), 0))
    RETURNING id INTO fid;
  END IF;
  NEW.folder_id := fid;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS file_folder_sync ON fundraise.files;
CREATE TRIGGER file_folder_sync BEFORE INSERT OR UPDATE OF folder, folder_id, room_id ON fundraise.files FOR EACH ROW EXECUTE FUNCTION fundraise.file_folder_sync();
