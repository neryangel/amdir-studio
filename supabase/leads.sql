-- studio_leads: leads from the AMDIR studio site (contact form + Event Pro Studio pilot form).
-- NOT APPLIED ANYWHERE. Review, then run once in the Supabase SQL editor of the studio project
-- (see DEPLOY.he.md). Written by the server function only, with the secret/service key.
--
-- Privacy:
--   * RLS is enabled and there are NO policies: anon/authenticated clients can neither read nor write.
--     Only the server function (service_role, which bypasses RLS) inserts rows.
--   * No raw IP is stored, only a salted hash (ip_hash) for abuse review.
--   * Soft delete: set deleted_at instead of DELETE (matches the AMDIR convention).
--
-- Retention (24 months): leads older than 24 months are purged. Suggested monthly job
-- (pg_cron, or run by hand), after a soft-delete grace period of 30 days:
--   update public.studio_leads set deleted_at = now()
--     where deleted_at is null and created_at < now() - interval '24 months';
--   delete from public.studio_leads
--     where deleted_at is not null and deleted_at < now() - interval '30 days';
-- (The hard delete is the only DELETE allowed on this table, and only for retention.)

create extension if not exists pgcrypto;

create table if not exists public.studio_leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  source            text not null check (source in ('contact', 'pilot')),
  name              text not null check (char_length(name) between 1 and 120),
  contact           text not null check (char_length(contact) between 1 and 200),
  contact_type      text not null check (contact_type in ('email', 'phone')),
  need              text not null check (need in ('clip', 'video', 'ai', 'web', 'pilot', 'other')),
  details           text not null check (char_length(details) between 1 and 4000),
  -- need-specific extras, e.g. {"songUrl": "https://...", "releaseDate": "2026-03"}.
  -- Keys are validated server-side (server/lead/schema.ts, BRIEF_GROUPS). Null when none were given.
  brief             jsonb check (brief is null or (jsonb_typeof(brief) = 'object' and pg_column_size(brief) < 4096)),
  -- consent record
  privacy_consent   boolean not null check (privacy_consent = true),
  marketing_opt_in  boolean not null default false,
  notice_version    text not null,
  consent_at        timestamptz not null,
  -- abuse review without storing the raw IP
  ip_hash           text,
  -- workflow
  status            text not null default 'new' check (status in ('new', 'replied', 'closed', 'spam')),
  deleted_at        timestamptz
);

comment on table public.studio_leads is
  'Leads from the studio site. Retention: 24 months, then soft delete + purge after 30 days (see file header).';

alter table public.studio_leads enable row level security;
alter table public.studio_leads force row level security;
-- Intentionally no policies.
revoke all on table public.studio_leads from anon, authenticated;
grant select, insert, update on table public.studio_leads to service_role;

create index if not exists studio_leads_created_at_idx on public.studio_leads (created_at desc) where deleted_at is null;
create index if not exists studio_leads_status_idx on public.studio_leads (status) where deleted_at is null;
create index if not exists studio_leads_source_idx on public.studio_leads (source, created_at desc);
-- Lets the studio filter by brief answers (e.g. siteGoal) without scanning every row.
create index if not exists studio_leads_brief_idx on public.studio_leads using gin (brief jsonb_path_ops) where brief is not null;
create index if not exists studio_leads_retention_idx on public.studio_leads (created_at) where deleted_at is null;
