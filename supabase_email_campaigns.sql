create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  stage text,
  status text not null default 'queued',  -- queued | sending | done | failed
  contacts jsonb not null default '[]',
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  already_sent int not null default 0,
  cursor int not null default 0,          -- index into contacts for next batch
  batch_size int not null default 10,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_status_idx on email_campaigns (status);
