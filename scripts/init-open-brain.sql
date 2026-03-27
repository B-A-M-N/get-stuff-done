create schema if not exists gsd_open_brain;
create extension if not exists vector;

create table if not exists gsd_open_brain.memory_item (
  id bigserial primary key,
  project_scope text,
  memory_type text not null,
  title text not null,
  body_markdown text not null,
  source_uri text,
  source_kind text,
  embedding vector(384),
  importance_score double precision not null default 0,
  confidence_score double precision not null default 0,
  reuse_count integer not null default 0,
  last_recalled_at timestamptz,
  superseded_by bigint references gsd_open_brain.memory_item(id),
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gsd_open_brain.memory_link (
  id bigserial primary key,
  from_id bigint not null references gsd_open_brain.memory_item(id) on delete cascade,
  to_id bigint not null references gsd_open_brain.memory_item(id) on delete cascade,
  relation_type text not null,
  score double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists gsd_open_brain.recall_event (
  id bigserial primary key,
  workflow text,
  phase text,
  plan text,
  query_text text not null,
  retrieved_ids jsonb not null default '[]'::jsonb,
  selected_ids jsonb not null default '[]'::jsonb,
  outcome text,
  feedback_score double precision,
  created_at timestamptz not null default now()
);

create table if not exists gsd_open_brain.consolidation_job (
  id bigserial primary key,
  input_ids jsonb not null default '[]'::jsonb,
  output_id bigint references gsd_open_brain.memory_item(id),
  strategy text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
