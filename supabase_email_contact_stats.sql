-- Adds a running scoreboard to each contact: how many emails they've been
-- sent, delivered, opened, and clicked. Updated incrementally as events
-- happen (see pages/api/email/send.js and pages/api/email/track.js) rather
-- than recalculated from email_sends on every page load.
--
-- Run this once in the Supabase SQL editor.

alter table email_contacts
  add column if not exists emails_sent      integer not null default 0,
  add column if not exists emails_delivered integer not null default 0,
  add column if not exists emails_opened    integer not null default 0,
  add column if not exists emails_clicked   integer not null default 0;

-- Safely increments any combination of the four counters for a contact,
-- matched by email (case-insensitive). Called once per event instead of
-- doing a read-then-write from the app, so concurrent sends can't clobber
-- each other's counts.
create or replace function bump_email_contact_stats(
  p_email      text,
  p_sent       integer default 0,
  p_delivered  integer default 0,
  p_opened     integer default 0,
  p_clicked    integer default 0
) returns void
language sql
as $$
  update email_contacts
  set emails_sent      = emails_sent      + p_sent,
      emails_delivered = emails_delivered + p_delivered,
      emails_opened    = emails_opened    + p_opened,
      emails_clicked   = emails_clicked   + p_clicked
  where lower(email) = lower(p_email);
$$;

-- One-time backfill from existing email_sends history, so contacts who
-- were already emailed before this migration show correct totals instead
-- of starting at zero.
update email_contacts c
set emails_sent      = s.sent_count,
    emails_delivered = s.sent_count,   -- no bounce feed yet, so delivered = sent for now
    emails_opened     = s.opened_count,
    emails_clicked     = s.clicked_count
from (
  select
    lower(email) as email,
    count(*) filter (where status = 'sent')      as sent_count,
    count(*) filter (where opened_at is not null) as opened_count,
    count(*) filter (where clicked_at is not null) as clicked_count
  from email_sends
  group by lower(email)
) s
where lower(c.email) = s.email;
