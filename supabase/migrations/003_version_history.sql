-- Migration 003: Build version history + agent_logs analytics columns

-- ── project_versions table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  files JSONB NOT NULL,
  blueprint JSONB,
  prompt TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_created
  ON project_versions(project_id, created_at DESC);

ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project versions" ON project_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own project versions" ON project_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ── agent_logs analytics columns ─────────────────────────────────────────────
-- Store token usage + cost from API mode builds

ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(10, 6);

-- ── profiles GitHub integration ──────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_username TEXT;
