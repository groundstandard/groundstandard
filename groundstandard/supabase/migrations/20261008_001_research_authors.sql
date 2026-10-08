-- Who generated each article, so the feed can be split by person.
--
-- Bobby, 8 October: separate the article feed by who generated each article,
-- so each writer can tell which ones they made.
--
-- The rows are created by n8n, which has never known who asked. Rather than
-- teach the workflow to carry a user through, the app files a claim just before
-- it calls n8n — this person, this keyword, this many — and a trigger on
-- Research stamps each new row with the oldest open claim for its keyword. The
-- app already relies on n8n's rows carrying the keyword as it was typed (it
-- clears its placeholders that way), so the match is as good as that is.
--
-- The person comes from the signed-in session, auth.uid(), never from anything
-- the browser says about itself, so nobody can file articles under someone
-- else. Articles made before this have no author and stay that way: there is
-- nothing to recover one from.

alter table "Research" add column if not exists created_by uuid;
alter table "Research" add column if not exists created_by_name text;

-- Deliberately no foreign key to auth.users. A constraint is checked after the
-- trigger has run, so a bad value there would fail the insert — and an article
-- that could not be saved because of who made it is the one failure this must
-- never cause.
create index if not exists research_created_by_idx on "Research" (created_by);

create table if not exists research_claims (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  user_name   text,
  keyword     text not null,
  remaining   integer not null check (remaining >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists research_claims_open_idx
  on research_claims (lower(btrim(keyword)), created_at)
  where remaining > 0;

-- Only the functions below touch this table. No policies, and nothing for the
-- public key or a signed-in session to read or write directly.
alter table research_claims enable row level security;
revoke all on research_claims from anon, authenticated;

-- Filed by the app before it asks n8n for articles. Returns the claim's id so
-- a request that fails can withdraw it.
create or replace function rpc_research_claim(p_keyword text, p_count integer default 1, p_name text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_id   bigint;
begin
  if v_user is null or nullif(btrim(coalesce(p_keyword, '')), '') is null then
    return null;
  end if;

  if v_name is null then
    select coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), u.email)
      into v_name
      from auth.users u
     where u.id = v_user;
  end if;

  -- A month of claims is plenty to answer any question about one.
  delete from research_claims where created_at < now() - interval '30 days';

  insert into research_claims (user_id, user_name, keyword, remaining)
  values (v_user, left(v_name, 120), btrim(p_keyword), greatest(1, least(coalesce(p_count, 1), 10)))
  returning id into v_id;

  return v_id;
end $$;

-- A request that failed will not produce its rows. Left open, its claim could
-- hand someone else's later article with the same keyword to this person.
create or replace function rpc_research_claim_cancel(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update research_claims
     set remaining = 0
   where id = p_id
     and user_id = auth.uid();
$$;

revoke all on function rpc_research_claim(text, integer, text) from public, anon;
revoke all on function rpc_research_claim_cancel(bigint) from public, anon;
grant execute on function rpc_research_claim(text, integer, text) to authenticated;
grant execute on function rpc_research_claim_cancel(bigint) to authenticated;

-- Stamp a new article with whoever claimed its keyword. Two hours covers a
-- batch of ten that n8n is slow with; an older claim is a request that never
-- landed. FOR UPDATE rather than SKIP LOCKED, so a batch inserted all at once
-- queues on its claim instead of skipping past it and losing its author.
create or replace function research_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim bigint;
  v_user  uuid;
  v_name  text;
begin
  if new.created_by is not null then
    return new;
  end if;

  begin
    select c.id, c.user_id, c.user_name
      into v_claim, v_user, v_name
      from research_claims c
     where c.remaining > 0
       and c.created_at > now() - interval '2 hours'
       and lower(btrim(c.keyword)) = lower(btrim(coalesce(new.keyword, '')))
     order by c.created_at, c.id
     limit 1
     for update;

    if v_claim is not null then
      update research_claims set remaining = remaining - 1 where id = v_claim;
      new.created_by := v_user;
      new.created_by_name := v_name;
    end if;
  exception when others then
    -- Never let finding the author stop an article being saved.
    null;
  end;

  return new;
end $$;

revoke all on function research_stamp_author() from public, anon, authenticated;

drop trigger if exists research_stamp_author on "Research";
create trigger research_stamp_author
  before insert on "Research"
  for each row execute function research_stamp_author();
