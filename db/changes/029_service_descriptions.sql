-- 029_service_descriptions.sql — short descriptions for the services founders can order.
BEGIN;
UPDATE services.catalog SET description = v.d FROM (VALUES
  ('virtual_office', 'A US business address with mail scanning and forwarding.'),
  ('de_mailbox', 'A Delaware mailing address for official and bank mail.'),
  ('registered_agent', 'Your registered agent in the state of formation, renewed yearly.'),
  ('llc_formation', 'Form a US LLC: name check, filing with the state and formation documents.'),
  ('inc_formation', 'Form a Delaware C-Corp ready for investors: filing, bylaws and founder stock.'),
  ('ein', 'Get your company''s US tax ID (EIN) from the IRS.'),
  ('operating_agreement', 'An operating agreement (LLC) or bylaws (Inc) drafted for your company.'),
  ('irs_annual', 'Federal tax return and required forms (e.g. 1120, 5472) prepared and filed.'),
  ('de_franchise', 'Delaware franchise tax and annual report filed on time.'),
  ('ca_state', 'California state filings and franchise tax handled for you.')
) AS v(code, d) WHERE services.catalog.code = v.code AND (services.catalog.description IS NULL OR services.catalog.description = '');
COMMIT;
