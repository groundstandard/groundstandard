-- Submissions from the Custom Form Builder, one row per lead.
--
-- The first form_submissions table was shaped for the Duda forms: a fixed set
-- of columns, one of them literally called consent2. Forms built here ask
-- whatever a gym needs, so the shape has to come from the form, not the table.
--
-- The rule is: n8n writes ONE column — payload, the body exactly as the embed
-- sent it — and the trigger below fills everything else in from it. Nothing is
-- ever lost, the workflow has nothing to map, and a new field on a form needs
-- no change anywhere. The typed columns exist so the builder's Report tab can
-- sort, search and count without opening every JSON blob.
--
-- Each row is tied to its form by id (looked up from the slug the embed sends),
-- so renaming a form does not orphan its leads. A test lead from the builder's
-- "Send a test lead" button goes to the CRM only and never arrives here; the
-- is_test flag is for a workflow that forwards one anyway.

create table if not exists form_submissions_v2 (
  id            bigint generated always as identity primary key,
  received_at   timestamptz not null default now(),
  submitted_at  timestamptz,

  -- which form
  form_id       uuid references forms (id) on delete set null,
  form_slug     text,
  form_name     text,

  -- who
  name          text,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,

  -- every answer the visitor gave, by field name
  answers       jsonb not null default '{}'::jsonb,

  -- where it was submitted from
  source_url       text,
  source_hostname  text,
  source_pathname  text,
  source_referrer  text,

  -- which campaign brought them
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  gclid         text,
  fbclid        text,
  msclkid       text,

  is_test       boolean not null default false,

  -- the body as it arrived; everything above is derived from it
  payload       jsonb not null
);

create index if not exists fsv2_form_idx     on form_submissions_v2 (form_id, submitted_at desc);
create index if not exists fsv2_slug_idx     on form_submissions_v2 (form_slug, submitted_at desc);
create index if not exists fsv2_site_idx     on form_submissions_v2 (source_hostname, submitted_at desc);
create index if not exists fsv2_when_idx     on form_submissions_v2 (submitted_at desc);

alter table form_submissions_v2 enable row level security;

-- Staff read it in the builder; staff may clear a test lead that slipped in.
-- The only writer is n8n with the service role, which is not subject to RLS.
drop policy if exists fsv2_staff_read   on form_submissions_v2;
drop policy if exists fsv2_staff_delete on form_submissions_v2;
create policy fsv2_staff_read   on form_submissions_v2 for select to authenticated using (true);
create policy fsv2_staff_delete on form_submissions_v2 for delete to authenticated using (is_test);

grant select, delete on form_submissions_v2 to authenticated;

-- This project's default privileges hand anon everything on a new table.
-- Leads are the last thing that should be readable with the public key.
revoke all on form_submissions_v2 from anon;

-- Fill the typed columns from the payload. Anything the workflow set itself is
-- kept; anything it left null is read from the body.
create or replace function form_submissions_v2_fill()
returns trigger
language plpgsql
as $$
declare
  p jsonb := coalesce(new.payload, '{}'::jsonb);
  stamp text := nullif(p->>'_submitted_at', '');
begin
  new.form_slug  := coalesce(new.form_slug,  nullif(p->>'_form', ''));
  new.form_name  := coalesce(new.form_name,  nullif(p->>'_form_name', ''), nullif(p->>'form_name', ''));

  new.first_name := coalesce(new.first_name, nullif(trim(p->>'first_name'), ''));
  new.last_name  := coalesce(new.last_name,  nullif(trim(p->>'last_name'), ''));
  new.name       := coalesce(new.name, nullif(trim(p->>'name'), ''),
                             nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''));
  new.email      := coalesce(new.email, nullif(lower(trim(p->>'email')), ''));
  new.phone      := coalesce(new.phone, nullif(trim(p->>'phone'), ''));

  new.source_url      := coalesce(new.source_url,      nullif(p->>'_source_url', ''), nullif(p->>'page_url', ''));
  new.source_hostname := coalesce(new.source_hostname, nullif(p->>'_source_hostname', ''));
  new.source_pathname := coalesce(new.source_pathname, nullif(p->>'_source_pathname', ''));
  new.source_referrer := coalesce(new.source_referrer, nullif(p->>'_source_referrer', ''));

  new.utm_source   := coalesce(new.utm_source,   p->>'utm_source');
  new.utm_medium   := coalesce(new.utm_medium,   p->>'utm_medium');
  new.utm_campaign := coalesce(new.utm_campaign, p->>'utm_campaign');
  new.utm_term     := coalesce(new.utm_term,     p->>'utm_term');
  new.utm_content  := coalesce(new.utm_content,  p->>'utm_content');
  new.gclid        := coalesce(new.gclid,        p->>'gclid');
  new.fbclid       := coalesce(new.fbclid,       p->>'fbclid');
  new.msclkid      := coalesce(new.msclkid,      p->>'msclkid');

  new.is_test := new.is_test or coalesce(p->>'_test', '') in ('true', '1');

  -- The embed stamps the moment of submission; a body without one is stamped
  -- on arrival. A stamp that is not a timestamp is ignored rather than fatal.
  if new.submitted_at is null then
    if stamp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
      begin
        new.submitted_at := stamp::timestamptz;
      exception when others then
        new.submitted_at := null;
      end;
    end if;
    new.submitted_at := coalesce(new.submitted_at, new.received_at, now());
  end if;

  if new.form_id is null and new.form_slug is not null then
    select id into new.form_id from forms where slug = new.form_slug;
  end if;

  -- The answers are the payload minus our own bookkeeping: the underscored
  -- keys, the campaign parameters, and the CRM-compatibility duplicates the
  -- embed adds beside the fields.
  new.answers := coalesce((
    select jsonb_object_agg(key, value)
    from jsonb_each(p)
    where left(key, 1) <> '_'
      and key not in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                      'gclid', 'fbclid', 'msclkid', 'form_name', 'page_url', 'source')
  ), '{}'::jsonb);

  return new;
end $$;

drop trigger if exists form_submissions_v2_fill on form_submissions_v2;
create trigger form_submissions_v2_fill
  before insert on form_submissions_v2
  for each row execute function form_submissions_v2_fill();
