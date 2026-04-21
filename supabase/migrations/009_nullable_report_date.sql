-- =============================================================================
-- PensionView — Nullable report_date
-- Migration 009
--
-- Allows reports.report_date to be NULL until the workflow's validate step
-- extracts it from the PDF cover page. Previously the upload API rejected any
-- file whose name didn't contain MM-YYYY, which forced the user to either
-- rename files or set a per-file date manually (the multi-file upload UI only
-- exposes one shared date).
--
-- The unique (profile_id, report_date) constraint stays as-is: Postgres
-- treats NULLs as distinct in unique indexes, so multiple "date pending"
-- rows for the same profile coexist until extraction populates the date,
-- at which point the constraint catches true duplicates.
-- =============================================================================

alter table reports alter column report_date drop not null;
