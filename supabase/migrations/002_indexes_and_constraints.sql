-- Migration 002: Performance indexes, NOT NULL constraints, and improved RLS policies
-- Run after 001_initial_schema.sql

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- Without these, every query does a full sequential scan. Critical for production.

-- Projects: most common query is "all projects for this user, newest first"
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_created
  ON projects(user_id, created_at DESC);

-- Messages: always queried by project_id, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_messages_project_id
  ON messages(project_id);

CREATE INDEX IF NOT EXISTS idx_messages_project_created
  ON messages(project_id, created_at ASC);

-- Agent logs: always queried by project_id
CREATE INDEX IF NOT EXISTS idx_agent_logs_project_id
  ON agent_logs(project_id);


-- ─── NOT NULL constraints ──────────────────────────────────────────────────────
-- Ensure timestamps are never null on core tables

ALTER TABLE profiles
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE projects
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;


-- ─── Improved RLS policies ─────────────────────────────────────────────────────
-- Replace IN (subquery) with EXISTS for better query plan performance.
-- The original IN-style creates an N+1 pattern at scale.

-- Messages: read
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = messages.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Messages: insert
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = messages.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Agent logs: read
DROP POLICY IF EXISTS "Users can view own agent logs" ON agent_logs;
CREATE POLICY "Users can view own agent logs" ON agent_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = agent_logs.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Agent logs: insert
DROP POLICY IF EXISTS "Users can insert own agent logs" ON agent_logs;
CREATE POLICY "Users can insert own agent logs" ON agent_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = agent_logs.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Agent logs: update (for status transitions)
DROP POLICY IF EXISTS "Users can update own agent logs" ON agent_logs;
CREATE POLICY "Users can update own agent logs" ON agent_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = agent_logs.project_id
        AND projects.user_id = auth.uid()
    )
  );
