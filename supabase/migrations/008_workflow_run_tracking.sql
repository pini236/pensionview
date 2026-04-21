-- =============================================================================
-- PensionView — Workflow run tracking (Vercel WDK migration)
-- Migration 008
--
-- Adds columns to track an in-flight WDK workflow run per report. Replaces the
-- HTTP-self-call chain previously orchestrated via the `processing_queue` table.
--
-- The `processing_queue` table itself is intentionally KEPT in this PR for
-- rollback safety; it will be dropped in a follow-up migration once the WDK
-- pipeline is proven in production.
--
-- Columns are nullable so existing reports remain valid; new uploads populate
-- them as the workflow advances.
-- =============================================================================

alter table reports
  add column workflow_run_id      text,
  add column current_step         text,
  add column current_step_detail  jsonb;

-- Enforces "one in-flight workflow per report". start() guards against this in
-- application code, but the partial unique index closes the race window.
create unique index reports_workflow_run_id_unique
  on reports (workflow_run_id)
  where workflow_run_id is not null;

-- Supports the heal-pipelines sweeper / debugging queries that filter by
-- (status, workflow_run_id).
create index idx_reports_status_workflow
  on reports (status, workflow_run_id);

-- No RLS policy changes required:
--   * "Users can read own reports" (001) selects whole rows, so the new
--     columns are automatically readable by row owners.
--   * "Service role full access on reports" (001) covers backend writes.
