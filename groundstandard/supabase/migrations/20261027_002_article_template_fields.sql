-- What a site's blog template needs that public_article() did not hand it.
--
-- Webstudio expressions can read, join and choose between values, but they
-- cannot format a date or count words. So the dates and the reading time now
-- arrive ready to show, the address arrives as a path the template can link
-- to, and the structured data arrives as the JSON text a JsonLd block takes.
-- Same two functions with the same signatures: a template reading only the
-- fields from 001 is unaffected.
--
-- Dates are in New York time. Every site here serves US schools, and an
-- article published late at night in Manila should carry the date its readers
-- saw it go up.

-- What a reader would see of an article's HTML: tags gone, the usual entities
-- turned back into characters, whitespace collapsed.
create or replace function article_text(p_html text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(coalesce(p_html, ''), '<[^>]+>', ' ', 'g'),
      '&nbsp;', ' '), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
    '\s+', ' ', 'g'))
$$;

create or replace function public_article(site text, slug text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select json_build_object(
      'found', true,
      'slug', p.published_slug,
      'path', rtrim(s.blog_path, '/') || '/' || p.published_slug,
      'url', article_url(s.domain, s.blog_path, p.published_slug),
      'title', p.published_title,
      'content', p.published_content,
      'excerpt', coalesce(nullif(btrim(p.published_excerpt), ''), left(t.body, 180)),
      'seo_title', coalesce(nullif(btrim(p.published_seo_title), ''), p.published_title),
      'seo_description', d.description,
      'cover_image', nullif(btrim(p.published_cover_image), ''),
      'author', s.name,
      'first_published_at', p.first_published_at,
      'published_at', p.published_at,
      'date_iso', to_char(p.first_published_at at time zone 'America/New_York', 'YYYY-MM-DD'),
      'date_label', to_char(p.first_published_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY'),
      'minutes', greatest(1, round(coalesce(array_length(regexp_split_to_array(nullif(t.body, ''), ' '), 1), 0) / 230.0))::int,
      'jsonld_text', json_strip_nulls(json_build_object(
        '@context', 'https://schema.org',
        '@type', 'BlogPosting',
        'headline', p.published_title,
        'description', d.description,
        'image', nullif(btrim(p.published_cover_image), ''),
        'datePublished', p.first_published_at,
        'dateModified', p.published_at,
        'mainEntityOfPage', article_url(s.domain, s.blog_path, p.published_slug),
        'author', json_build_object('@type', 'Organization', 'name', s.name),
        'publisher', json_build_object('@type', 'Organization', 'name', s.name)))::text)
    from article_posts p
    join article_sites s on s.id = p.published_site_id
    cross join lateral (select article_text(p.published_content) as body) t
    cross join lateral (
      select coalesce(nullif(btrim(p.published_seo_description), ''),
                      nullif(btrim(p.published_excerpt), ''),
                      left(t.body, 155)) as description
    ) d
    where s.key = public_article.site
      and s.active
      and p.status = 'published'
      and p.published_slug = public_article.slug
    limit 1
  ), json_build_object('found', false))
$$;

create or replace function public_articles(site text, page integer default 1, per_page integer default 12)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select id, domain, blog_path from article_sites where key = public_articles.site and active
  ),
  live as (
    select p.*, row_number() over (order by p.first_published_at desc nulls last, p.research_id desc) as n
      from article_posts p
     where p.published_site_id = (select id from s) and p.status = 'published'
  ),
  shown as (
    select * from live
     where n >  (greatest(coalesce(public_articles.page, 1), 1) - 1) * greatest(1, least(coalesce(public_articles.per_page, 12), 50))
       and n <= greatest(coalesce(public_articles.page, 1), 1) * greatest(1, least(coalesce(public_articles.per_page, 12), 50))
  )
  select json_build_object(
    'total', (select count(*) from live),
    'page', greatest(coalesce(public_articles.page, 1), 1),
    'items', coalesce((
      select json_agg(json_build_object(
          'slug', shown.published_slug,
          'path', rtrim((select blog_path from s), '/') || '/' || shown.published_slug,
          'title', shown.published_title,
          'excerpt', coalesce(nullif(btrim(shown.published_excerpt), ''), left(article_text(shown.published_content), 180)),
          'cover_image', nullif(btrim(shown.published_cover_image), ''),
          'first_published_at', shown.first_published_at,
          'date_iso', to_char(shown.first_published_at at time zone 'America/New_York', 'YYYY-MM-DD'),
          'date_label', to_char(shown.first_published_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY'),
          'url', article_url((select domain from s), (select blog_path from s), shown.published_slug))
        order by shown.n)
      from shown), '[]'::json))
$$;

revoke all on function public_article(text, text) from public;
revoke all on function public_articles(text, integer, integer) from public;
grant execute on function public_article(text, text) to anon, authenticated;
grant execute on function public_articles(text, integer, integer) to anon, authenticated;
