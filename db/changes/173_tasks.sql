-- 173_tasks.sql — Tasks for the Aidi team: who is doing what, across every business.
--  core.tasks        one task: title, notes, business, status, priority, due date, who it is for (a person, or all GPs,
--                    or the whole team), a link to the page where the work happens, a checklist, and whether it repeats
--                    (finishing a repeating task creates the next one). Team members never see tasks for GPs.
--  core.task_events  the history of a task: notes, status changes, reassignments, checklist ticks.
-- Then Deborah's first operations tasks (assigned to her if she is on the Aidi team, else to all GPs).
BEGIN;
CREATE TABLE IF NOT EXISTS core.tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  title           text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  notes           text        CHECK (notes IS NULL OR length(notes) <= 4000),
  business        text        NOT NULL DEFAULT 'group' CHECK (business IN ('group', 'ventures', 'technology', 'haven', 'finvry', 'wealth')),
  status          text        NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'waiting', 'done')),
  priority        text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  due_on          date,
  assignee_id     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  assignee_group  text        CHECK (assignee_group IS NULL OR assignee_group IN ('gp', 'team')),
  link            text        CHECK (link IS NULL OR (length(link) <= 300 AND link LIKE '/%')),
  checklist       jsonb       NOT NULL DEFAULT '[]',
  repeat          text        NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'weekly', 'monthly')),
  seed            text,
  repeat_of       uuid        REFERENCES core.tasks(id) ON DELETE SET NULL,
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  completed_by    uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  CHECK (assignee_id IS NULL OR assignee_group IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS tasks_seed ON core.tasks (organization_id, seed) WHERE seed IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_open ON core.tasks (organization_id, status, due_on);
CREATE INDEX IF NOT EXISTS tasks_assignee ON core.tasks (assignee_id, status);
ALTER TABLE core.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.tasks;
CREATE POLICY tenant_isolation ON core.tasks USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tasks TO aidi_os_app;

CREATE TABLE IF NOT EXISTS core.task_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  task_id         uuid        NOT NULL REFERENCES core.tasks(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  kind            text        NOT NULL CHECK (kind IN ('created', 'note', 'status', 'assign', 'check', 'edit')),
  body            text        CHECK (body IS NULL OR length(body) <= 2000),
  at              timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS task_events_task ON core.task_events (task_id, at);
ALTER TABLE core.task_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.task_events;
CREATE POLICY tenant_isolation ON core.task_events USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, DELETE ON core.task_events TO aidi_os_app;

-- The Tasks module, in the Aidi workspace's plan.
UPDATE core.plans SET modules = array_append(modules, 'tasks') WHERE code = 'internal' AND NOT ('tasks' = ANY(modules));

-- Deborah's first tasks (operations; finance and investing stay with Emmanuel).
DO $$
DECLARE org uuid; deb uuid; emm uuid; grp text;
BEGIN
  SELECT id INTO org FROM core.organizations WHERE plan_code = 'internal' ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN RETURN; END IF;
  SELECT u.id INTO deb FROM core.users u JOIN core.memberships m ON m.user_id = u.id AND m.organization_id = org AND m.status = 'active' LEFT JOIN core.people p ON p.id = u.person_id
   WHERE p.full_name ILIKE '%deborah%' OR p.full_name ILIKE '%mayowa%gbolade%' OR u.email ILIKE '%deborah%' ORDER BY u.created_at LIMIT 1;
  SELECT id INTO emm FROM core.users WHERE lower(email) = 'gbolademmanuel@aidiventures.com' LIMIT 1;
  grp := CASE WHEN deb IS NULL THEN 'gp' END;
  IF deb IS NULL THEN RAISE NOTICE 'Deborah is not on the Aidi team yet: her tasks are set for all GPs. Reassign them to her once she joins.'; END IF;
  INSERT INTO core.tasks (organization_id, seed, business, title, notes, priority, due_on, repeat, link, checklist, assignee_id, assignee_group, created_by) VALUES
   (org, 'deb-ff-leads', 'haven', 'Message Furnished Finder leads to fill November and December', 'Goal: every empty night in Nov and Dec booked with 30+ night stays. Reply to new leads the same day.', 'urgent', '2026-11-06', 'weekly', '/rentals', '[]', deb, grp, emm),
   (org, 'deb-lease', 'haven', 'Confirm with Pavan that 30+ night stays are fine under the lease', 'Furnished Finder guests stay a month or more. Get it in writing (email is fine).', 'high', '2026-11-06', 'none', '/rentals', '[]', deb, grp, emm),
   (org, 'deb-rent', 'haven', 'Pay rent to Pavan for Aidi Haven', 'From Aidi Haven''s Chase account, then log it under Rental & Real Estate → Expenses.', 'high', '2026-11-03', 'monthly', '/rentals?t=expenses', '[]', deb, grp, emm),
   (org, 'deb-airbnb-csv', 'haven', 'Upload last month''s Airbnb CSV and log expenses', 'Rental & Real Estate → Money: upload the Airbnb CSV. Expenses: cleaners, gardener, supplies.', 'high', '2026-11-07', 'monthly', '/rentals?t=money', '[]', deb, grp, emm),
   (org, 'deb-filings', 'group', 'Check filings due before year end', 'Aidi Ventures LLC, Aidi Wealth LLC, Aidi Haven LLC and Aidi Technology Ltd: anything due in Nov and Dec. Mark done, or flag to Emmanuel.', 'high', '2026-11-06', 'none', '/compliance', '[]', deb, grp, emm),
   (org, 'deb-capital', 'finvry', 'Verify capital providers so founders can see them', 'Check each provider''s website, cheque size and criteria, then mark it verified. Start with the 25 most relevant.', 'high', '2026-11-13', 'none', '/platform/capital', '[]', deb, grp, emm),
   (org, 'deb-prospects', 'finvry', 'Clean up Investors & grants', 'The list founders search under Fundraising → Find investors and grants.', 'normal', '2026-11-13', 'none', '/platform/prospects',
     '[{"t":"Fix broken links","d":false},{"t":"Turn off expired grants","d":false},{"t":"Add 20 new investors and grants (US and Africa)","d":false}]', deb, grp, emm),
   (org, 'deb-perks', 'finvry', 'Apply for perks for Finvry founders', 'Like firstbase.io/rewards. Apply to each programme; add every approved offer under Perks (shows on app.finvry.com/rewards).', 'normal', '2026-11-20', 'none', '/platform/perks',
     '[{"t":"QuickBooks","d":false},{"t":"Google Cloud","d":false},{"t":"AWS Activate","d":false},{"t":"Deel","d":false},{"t":"Zoho","d":false},{"t":"Pipedrive","d":false},{"t":"Amplitude","d":false},{"t":"Deepgram","d":false},{"t":"Snowflake","d":false},{"t":"Riverside","d":false},{"t":"Zoom","d":false},{"t":"Omnisend","d":false}]', deb, grp, emm),
   (org, 'deb-partners', 'finvry', 'Sign 10 incubators, accelerators or communities as Finvry partners', 'Each partner gets a discount code for its founders.', 'normal', '2026-11-20', 'none', '/platform/partners', '[]', deb, grp, emm),
   (org, 'deb-pitches', 'ventures', 'Sort new pitches', 'Decline clear misfits; flag good ones to Emmanuel. Investment decisions stay with Emmanuel.', 'normal', '2026-11-06', 'weekly', '/deals', '[]', deb, grp, emm),
   (org, 'deb-tolu-reports', 'ventures', 'Remind Tolu to send founder report links and chase missing reports', 'This month''s report link to every portfolio founder; chase anyone who hasn''t sent theirs.', 'normal', '2026-11-10', 'monthly', '/portfolio', '[]', deb, grp, emm)
  ON CONFLICT DO NOTHING;
  INSERT INTO core.task_events (organization_id, task_id, user_id, kind, body)
   SELECT org, t.id, emm, 'created', NULL FROM core.tasks t WHERE t.organization_id = org AND t.seed LIKE 'deb-%' AND NOT EXISTS (SELECT 1 FROM core.task_events e WHERE e.task_id = t.id);
END $$;
COMMIT;
