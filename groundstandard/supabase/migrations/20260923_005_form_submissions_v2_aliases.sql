-- The reporting copy now carries firstName and lastName beside first_name and
-- last_name — the names the old Duda widget used, so the reporting that grew
-- up on that shape keeps working. They are the same person twice, not answers,
-- so the trigger leaves them out of `answers` the way it leaves out form_name
-- and page_url. Same function as 004, one line longer; safe to run again.

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

  new.first_name := coalesce(new.first_name, nullif(trim(p->>'first_name'), ''), nullif(trim(p->>'firstName'), ''));
  new.last_name  := coalesce(new.last_name,  nullif(trim(p->>'last_name'), ''),  nullif(trim(p->>'lastName'), ''));
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

  new.answers := coalesce((
    select jsonb_object_agg(key, value)
    from jsonb_each(p)
    where left(key, 1) <> '_'
      and key not in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                      'gclid', 'fbclid', 'msclkid', 'form_name', 'page_url', 'source',
                      'firstName', 'lastName')
  ), '{}'::jsonb);

  return new;
end $$;
