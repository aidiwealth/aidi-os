-- 047_data_updates.sql — corrections after the Oct 2026 import.
BEGIN;
UPDATE portfolio.companies SET founder_email = 'talatu@newllyon.com' WHERE founder_email = 'talatu@newllyon';
UPDATE wealth.holdings SET meta = jsonb_set(meta, '{founder,email}', '"talatu@newllyon.com"') WHERE name = 'Newllyon' AND meta ? 'founder';
UPDATE services.clients SET notes = replace(notes, ' FLAG: formation date not on file.', '') WHERE notes LIKE '%FLAG: formation date not on file.%';
UPDATE wealth.holdings SET notes = replace(notes, 'matures 31 Jul 2026 unless extended', 'maturity extended by one year to 31 Jul 2027 (needs a written amendment signed by both parties)'), meta = meta || '{"maturity": "2027-07-31"}'::jsonb
  WHERE name LIKE 'Termii Inc revolving line%' AND notes LIKE '%matures 31 Jul 2026%';
UPDATE wealth.holdings SET notes = replace(notes, 'repayable with $1,400 interest by 24 Mar 2026 (past due unless extended in writing)', 'repayable with $1,400 interest; term extended by one year to 24 Mar 2027 (needs a written extension signed by both parties)'), meta = meta || '{"due": "2027-03-24"}'::jsonb, as_of = '2026-10-01'
  WHERE name LIKE 'Termii Inc loan to Aidi Haven%' AND notes LIKE '%by 24 Mar 2026%';
COMMIT;
