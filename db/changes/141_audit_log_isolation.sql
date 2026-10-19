-- 141_audit_log_isolation.sql — audit entries that belong to no company (sign-ins before a workspace is chosen,
-- platform-level actions) were visible to a database connection with no company set. Reading them now needs the
-- platform path; writing them is unchanged (a sign-in still records itself before a workspace is known).
BEGIN;
DROP POLICY IF EXISTS tenant_isolation ON core.audit_log;
CREATE POLICY tenant_isolation ON core.audit_log
  USING (core.is_bypass() OR (organization_id IS NOT NULL AND organization_id = core.current_org()))
  WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
COMMIT;
