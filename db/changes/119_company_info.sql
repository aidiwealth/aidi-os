-- Secondaries: the company's website, logo and details read from its site (description, socials, location).
ALTER TABLE wm.secondaries ADD COLUMN IF NOT EXISTS website text CHECK (length(website) <= 300),
  ADD COLUMN IF NOT EXISTS logo_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_info jsonb;
