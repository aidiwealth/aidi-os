-- Files a services client or the services team uploads (job files, intake files, info-request files, inbox attachments)
-- belong to the services desk, not to the operator's own Documents library. Support inbox attachments likewise.
ALTER TABLE core.documents ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'org';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_area_check') THEN
    ALTER TABLE core.documents ADD CONSTRAINT documents_area_check CHECK (area IN ('org','services','support'));
  END IF;
END $$;
UPDATE core.documents d SET area = 'services' WHERE area = 'org' AND (
     EXISTS (SELECT 1 FROM services.job_events e WHERE e.document_id = d.id)
  OR EXISTS (SELECT 1 FROM services.request_files f WHERE f.document_id = d.id)
  OR EXISTS (SELECT 1 FROM services.messages m WHERE m.document_id = d.id)
  OR EXISTS (SELECT 1 FROM services.intakes i, jsonb_array_elements(i.files) x WHERE x->>'doc_id' = d.id::text));
UPDATE core.documents d SET area = 'support' WHERE area = 'org'
  AND EXISTS (SELECT 1 FROM support.messages m, jsonb_array_elements(m.attachments) x WHERE x->>'doc_id' = d.id::text);
CREATE INDEX IF NOT EXISTS documents_area ON core.documents (area);
