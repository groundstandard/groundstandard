-- Where a visitor goes after submitting, as rules rather than a fixed pair.
--
-- The first version had two boxes: adult enquiries here, youth enquiries there,
-- with "youth" hardwired to a program answer starting with Youth or Kids. Real
-- forms ask more than that — "what are you interested in?" — and a gym wants the
-- BJJ enquiry on the BJJ page. So: a list of rules, read top to bottom, "if this
-- field is this answer, go here", and one address for everyone else. Add a rule
-- for each answer that deserves its own page; the list can be as long as needed.
--
-- The two old columns stay for now, and their values are carried over below so
-- nothing changes for a form that is live today: the adult address becomes the
-- "everyone else" address, and the youth address becomes one rule per program
-- option that starts with Youth or Kids — the exact cases the old code sent
-- there.

alter table forms add column if not exists redirect_rules jsonb not null default '[]'::jsonb;
alter table forms add column if not exists redirect_default text;

update forms
set redirect_default = redirect_adult
where redirect_default is null
  and redirect_adult is not null and redirect_adult <> '';

update forms f
set redirect_rules = coalesce((
  select jsonb_agg(jsonb_build_object(
    'field', fld->>'name',
    'value', trim(case when position('=' in opt) > 0 then split_part(opt, '=', 2) else opt end),
    'url',   f.redirect_youth))
  from jsonb_array_elements(f.fields) fld
  cross join jsonb_array_elements_text(fld->'options') opt
  where fld->>'type' = 'select'
    and (lower(trim(opt)) like 'youth%' or lower(trim(opt)) like 'kid%')
), '[]'::jsonb)
where f.redirect_youth is not null and f.redirect_youth <> ''
  and f.redirect_rules = '[]'::jsonb;
