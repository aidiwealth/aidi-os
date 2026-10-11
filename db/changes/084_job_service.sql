-- Orders logged with a virtual office first were filed as "Other"; set the service from the order's most significant item.
BEGIN;
UPDATE services.jobs SET service = CASE
  WHEN codes && ARRAY['llc_formation','inc_formation','ein'] THEN 'company_formation'
  WHEN codes && ARRAY['irs_annual'] THEN 'tax_filing'
  WHEN codes && ARRAY['de_franchise','ca_state'] THEN 'annual_compliance'
  WHEN codes && ARRAY['registered_agent'] THEN 'registered_agent'
  WHEN codes && ARRAY['operating_agreement'] THEN 'legal_review'
  ELSE service END
WHERE service = 'other' AND codes IS NOT NULL AND cardinality(codes) > 0;
COMMIT;
