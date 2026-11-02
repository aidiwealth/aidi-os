-- 175_meeting_tasks.sql — Action items in meeting minutes are tasks. Each action gets a stable id; each becomes a task
-- for its owner (linked back to the minutes), kept in step both ways: ticking it in the minutes or on Tasks does both.
-- Every action already in past minutes, open and done, becomes a task now.
BEGIN;
ALTER TABLE core.tasks ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES core.meeting_minutes(id) ON DELETE CASCADE;
ALTER TABLE core.tasks ADD COLUMN IF NOT EXISTS meeting_action text;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_meeting_action ON core.tasks (meeting_id, meeting_action) WHERE meeting_id IS NOT NULL;

-- A stable id on every action item.
UPDATE core.meeting_minutes m SET actions = (SELECT jsonb_agg(CASE WHEN a ? 'id' THEN a ELSE a || jsonb_build_object('id', gen_random_uuid()::text) END ORDER BY o)
  FROM jsonb_array_elements(m.actions) WITH ORDINALITY x(a, o))
 WHERE jsonb_array_length(m.actions) > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(m.actions) a WHERE NOT a ? 'id');

-- Past and present actions become tasks (open ones open, done ones done), for their owner when the owner is on the team.
WITH acts AS (
  SELECT m.organization_id, m.id AS meeting_id, m.title AS meeting, m.held_at, m.updated_at, m.created_by, e.name AS entity, a->>'id' AS aid, trim(a->>'text') AS txt,
         nullif(a->>'owner_id', '') AS owner_id, nullif(trim(a->>'owner'), '') AS owner, nullif(a->>'due', '') AS due, coalesce((a->>'done')::boolean, false) AS done
    FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id, jsonb_array_elements(m.actions) a
   WHERE coalesce(trim(a->>'text'), '') <> '')
INSERT INTO core.tasks (organization_id, meeting_id, meeting_action, title, notes, business, status, priority, due_on, assignee_id, link, created_by, created_at, completed_at, completed_by)
SELECT a.organization_id, a.meeting_id, a.aid, left(a.txt, 200),
       'From the minutes of ' || a.meeting || ' (' || to_char(a.held_at, 'DD Mon YYYY') || ').' || CASE WHEN length(a.txt) > 200 THEN E'\n' || a.txt ELSE '' END
         || CASE WHEN a.owner IS NOT NULL AND u.id IS NULL THEN E'\nOwner: ' || a.owner ELSE '' END,
       CASE WHEN a.entity ILIKE '%haven%' THEN 'haven' WHEN a.entity ILIKE '%technolog%' THEN 'technology' WHEN a.entity ILIKE '%wealth%' OR a.entity ILIKE '%finance%' THEN 'wealth' WHEN a.entity ILIKE '%ventures%' THEN 'ventures' ELSE 'group' END,
       CASE WHEN a.done THEN 'done' ELSE 'todo' END, 'normal',
       CASE WHEN a.due ~ '^\d{4}-\d{2}-\d{2}$' THEN a.due::date END, u.id, '/meetings/' || a.meeting_id, a.created_by, a.held_at,
       CASE WHEN a.done THEN a.updated_at END, CASE WHEN a.done THEN a.created_by END
  FROM acts a
  LEFT JOIN core.memberships mb ON a.owner_id ~ '^[0-9a-f-]{36}$' AND mb.user_id = a.owner_id::uuid AND mb.organization_id = a.organization_id AND mb.status = 'active'
  LEFT JOIN core.users u ON u.id = mb.user_id
ON CONFLICT DO NOTHING;
INSERT INTO core.task_events (organization_id, task_id, user_id, kind, body, at)
SELECT t.organization_id, t.id, t.created_by, 'created', 'From meeting minutes', t.created_at FROM core.tasks t
 WHERE t.meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM core.task_events e WHERE e.task_id = t.id);
COMMIT;
