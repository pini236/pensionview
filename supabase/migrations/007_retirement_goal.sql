-- PensionView: Retirement Goal Tracker
-- Migration 007
--
-- Adds two columns to `profiles` so each member can declare a target monthly
-- pension at a chosen retirement age. The dashboard uses these to render the
-- Retirement Goal card (progress vs. goal, gap, suggested deposit increase).
--
-- `retirement_goal_monthly` — nullable so existing users start in the empty
--   state (which prompts them to set a goal in Settings).
-- `retirement_age` — defaults to 67 (Israeli statutory retirement age for men;
--   women are 65 but 67 is a reasonable default users can override).
-- =============================================================================

alter table profiles add column retirement_goal_monthly numeric;
alter table profiles add column retirement_age integer default 67;
