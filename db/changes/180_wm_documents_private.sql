-- Aidi Wealth client documents (agreements, signed copies, statements, invoices, receipts, savings certificates, the
-- onboarding data record, uploaded financial documents and identity documents) leave the document library: they are
-- restricted and in their own area, reached only through the wealth routes that check who the client is.
ALTER TABLE core.documents DROP CONSTRAINT IF EXISTS documents_area_check;
ALTER TABLE core.documents ADD CONSTRAINT documents_area_check CHECK (area IN ('org','services','support','wm'));
UPDATE core.documents d SET area = 'wm', sensitivity = 'restricted'
 WHERE d.id IN (
   SELECT doc_id FROM wm.client_docs WHERE doc_id IS NOT NULL
   UNION SELECT signed_doc_id FROM wm.client_docs WHERE signed_doc_id IS NOT NULL
   UNION SELECT invoice_doc_id FROM wm.fees WHERE invoice_doc_id IS NOT NULL
   UNION SELECT receipt_doc_id FROM wm.fees WHERE receipt_doc_id IS NOT NULL
   UNION SELECT doc_id FROM wm.statements WHERE doc_id IS NOT NULL
   UNION SELECT certificate_doc_id FROM wm.savings_plans WHERE certificate_doc_id IS NOT NULL
   UNION SELECT document_id FROM wm.profile_docs
   UNION SELECT document_id FROM wm.kyc_items);
