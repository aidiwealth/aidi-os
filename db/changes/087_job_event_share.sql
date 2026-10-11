-- Job timeline entries stay append-only, except the switch that shares a file with the client (or makes it team-only).
GRANT UPDATE (visible_to_client) ON services.job_events TO aidi_os_app;
