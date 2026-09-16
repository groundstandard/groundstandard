-- Forms we own, instead of forms Duda owns.
--
-- Bobby, September 16: "Duda is going bye bye. We need to build the forms using
-- the AI. Code the forms. Then the webhook needs to send to GHL."
--
-- The lesson from the outage that week is built into the shape of this: the form
-- definition lives here, and each site embeds one line that reads it. Change a
-- field or a webhook and every site has it immediately. Nothing to republish.
-- Thirteen sites sat on a stale widget for eight weeks because the old way
-- pinned a copy into each site.

create table forms (
  id            uuid primary key default gen_random_uuid(),

  -- What the embed asks for. Short, readable, and stable — it goes in the
  -- script tag on the client's site.
  slug          text not null unique,
  name          text not null,
  site_hostname text,

  -- Where a submission goes. The GoHighLevel webhook is the point of the whole
  -- thing; the reporting copy is ours, and is what makes an outage visible.
  ghl_webhook_url text,
  report_enabled  boolean not null default true,

  -- Bobby, on the call: an adult enquiry and a youth enquiry should not land on
  -- the same page.
  redirect_enabled boolean not null default false,
  redirect_adult   text,
  redirect_youth   text,

  -- The fields themselves: [{ name, label, type, required, options[], placeholder }]
  -- Ordered as they appear. Kept as jsonb because the whole point is that Bobby
  -- changes this without anyone writing a migration.
  fields        jsonb not null default '[]'::jsonb,

  -- Wording he asked for by name.
  submit_label    text not null default 'Send',
  success_message text not null default 'Thank you. We will be in touch shortly.',
  error_message   text not null default 'Something went wrong. Please try again.',
  privacy_url     text,
  terms_url       text,

  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create index forms_slug_idx on forms (slug) where active;

alter table forms enable row level security;

-- Staff sign in to the agency tool, so they edit through their own session.
create policy forms_staff_read   on forms for select to authenticated using (true);
create policy forms_staff_write  on forms for insert to authenticated with check (true);
create policy forms_staff_update on forms for update to authenticated using (true) with check (true);

-- The embed on a client's site is anonymous, and must read the definition to
-- render it. It gets the definition and nothing else — submissions are written
-- through the existing reporting path, not through this table.
create policy forms_public_read on forms for select to anon using (active);

grant select on forms to anon;
grant select, insert, update on forms to authenticated;

-- This project's default privileges hand anon every privilege on a new public
-- table, so the grant above adds nothing and RLS ends up being the only thing in
-- front of the table. Take the rest away as well: one policy written loosely
-- later should not be the difference between a form people can read and a table
-- anyone on the internet can rewrite.
revoke insert, update, delete, truncate, references, trigger on forms from anon;

-- Touch updated_at on every change, so "when did this last move" is answerable
-- without trusting whoever wrote the row to remember.
create or replace function forms_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger forms_touch before update on forms
  for each row execute function forms_touch_updated_at();
