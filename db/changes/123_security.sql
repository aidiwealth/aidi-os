-- Security hardening (os190).
-- Handoff tokens are single use across every app instance.
ALTER TABLE core.sessions ADD COLUMN IF NOT EXISTS handoff_used_at timestamptz;
-- Public media is an explicit flag set by the media uploaders, not a title prefix anyone could type.
ALTER TABLE core.documents ADD COLUMN IF NOT EXISTS public_media boolean NOT NULL DEFAULT false;
UPDATE core.documents SET public_media = true WHERE NOT public_media AND (title LIKE 'Update media — %' OR title LIKE 'Blog media — %' OR title LIKE 'Perk logo — %' OR title LIKE 'Company logo — %');
-- People limited to some entities see only those entities' notices and fees.
DROP POLICY IF EXISTS entity_scope ON inbox.notices;
CREATE POLICY entity_scope ON inbox.notices AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON wm.fees;
CREATE POLICY entity_scope ON wm.fees AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
