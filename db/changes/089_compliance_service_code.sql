-- Finvry companies: calendar items for services Finvry offers carry the service code, and their names follow the
-- services price list (e.g. "Federal Annual Filing", "State Tax Filing"), so the calendar and the price list match.
BEGIN;
ALTER TABLE compliance.obligations ADD COLUMN IF NOT EXISTS service_code text;
UPDATE compliance.obligations ob SET service_code = CASE
    WHEN ob.title ~* '^Federal (tax return|corporate tax return)' THEN 'irs_annual'
    WHEN ob.title ~* '^Delaware (franchise tax|LLC annual tax)' THEN 'de_franchise'
    WHEN ob.title ~* '^California state filing' THEN 'ca_state'
    WHEN ob.title ~* '^Registered agent renewal' THEN 'registered_agent'
    WHEN ob.title ~* '^Virtual office renewal' THEN 'virtual_office'
    WHEN ob.title ~* '^(Wyoming annual report|State annual report)' THEN 'annual_report' END
  FROM core.entities e JOIN core.organizations o ON o.id = e.organization_id
 WHERE e.id = ob.entity_id AND o.kind = 'company' AND ob.service_code IS NULL;
UPDATE compliance.obligations ob SET title = c.name
  FROM services.catalog c
 WHERE c.code = ob.service_code AND c.organization_id = (SELECT id FROM core.organizations WHERE settings->>'services_operator' = 'true' ORDER BY created_at LIMIT 1)
   AND ob.title <> c.name;
CREATE INDEX IF NOT EXISTS obligations_service_code ON compliance.obligations (service_code) WHERE service_code IS NOT NULL;
COMMIT;
