-- 082_virtual_office_only.sql — mailbox and virtual office are one service: Virtual office. Companies marked as having
-- a mailbox are marked as having a virtual office; the retired Delaware Mailbox stays off sale.
UPDATE services.companies SET virtual_office = true, mailbox = false WHERE mailbox;
UPDATE services.catalog SET active = false WHERE code = 'de_mailbox' AND active;
