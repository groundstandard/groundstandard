-- The Article CMS: where generated articles are read, edited and published.
--
-- Bobby, 26 October: an interface to see all the articles, filter them and
-- scroll through them, where Kris adds links or anything else, and where
-- Publish puts the article on the right website as a new templated page.
--
-- The Article Generator keeps making articles in Research, and nothing here
-- changes that. A post is this tool's own copy of one of those articles, made
-- the first time someone saves it here, so a rewrite in the generator can
-- never wipe out the links an editor added. Each post holds two versions: the
-- working copy being edited, and the live copy a website reads. Only Publish
-- writes the live copy, so a half-finished edit is never on a site.
--
-- A site's blog is one template page in Webstudio, set up once, that asks
-- public_article() for the article at its address. Publishing an article
-- after that is the button and nothing else: no page to create, nothing to
-- rebuild or republish.

create table if not exists article_sites (
  id          uuid primary key default gen_random_uuid(),
  -- The short name a site's template asks for its articles by.
  key         text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  -- The live address, for showing the article's URL. www.example.com
  domain      text,
  blog_path   text not null default '/blog' check (blog_path ~ '^/[a-z0-9/_-]*$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists article_posts (
  -- The Research row this post was made from. No foreign key: the generator
  -- owns that table, and deleting an article there must not fail because of
  -- a post here, nor silently take a live page down with it.
  research_id     bigint primary key,
  site_id         uuid references article_sites (id) on delete set null,
  slug            text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- The working copy.
  title           text not null default '',
  content         text not null default '',
  excerpt         text,
  seo_title       text,
  seo_description text,
  cover_image     text,

  -- What it was made from, so the post stands on its own and can tell when
  -- the generator has rewritten the article since.
  source_keyword  text,
  source_business text,
  source_hash     text,

  -- The live copy. Only rpc_article_publish writes these — the address too, so
  -- changing the site or slug while editing moves nothing until Publish.
  status                    text not null default 'draft' check (status in ('draft', 'published')),
  published_site_id         uuid references article_sites (id) on delete set null,
  published_slug            text,
  published_title           text,
  published_content         text,
  published_excerpt         text,
  published_seo_title       text,
  published_seo_description text,
  published_cover_image     text,
  first_published_at        timestamptz,
  published_at              timestamptz,

  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid()
);

-- One live article per address on a site. Drafts may share an address while
-- they are being worked on; Publish is where the clash is caught and named.
create unique index if not exists article_posts_address_idx
  on article_posts (published_site_id, published_slug)
  where status = 'published';

create index if not exists article_posts_status_idx on article_posts (status, updated_at desc);

alter table article_sites enable row level security;
alter table article_posts enable row level security;

-- Staff sign in to the agency tool and edit through their own session, the
-- same as the forms table.
drop policy if exists article_sites_staff on article_sites;
drop policy if exists article_posts_staff on article_posts;
create policy article_sites_staff on article_sites for all to authenticated using (true) with check (true);
create policy article_posts_staff on article_posts for all to authenticated using (true) with check (true);

grant select, insert, update on article_sites to authenticated;
grant select, insert, update on article_posts to authenticated;

-- This project's default privileges hand anon everything on a new table.
-- Websites read through public_article() and public_articles() below, which
-- return the live copy of published articles and nothing else.
revoke all on article_sites from anon;
revoke all on article_posts from anon;

create or replace function article_posts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists article_posts_touch on article_posts;
create trigger article_posts_touch
  before update on article_posts
  for each row execute function article_posts_touch();

-- The full address of an article, or null while its site has no domain.
create or replace function article_url(p_domain text, p_blog_path text, p_slug text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(p_domain), '') = '' or coalesce(p_slug, '') = '' then null
    else 'https://' || regexp_replace(btrim(p_domain), '^https?://|/+$', '', 'g')
         || rtrim(coalesce(p_blog_path, '/blog'), '/') || '/' || p_slug
  end
$$;

-- The generator's current version of an article, for seeding a new post and
-- for noticing a rewrite. One row by id, so it needs nothing else about how
-- the generator lists or deletes.
create or replace function rpc_article_source(p_research_id bigint)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'title', r.title,
    'content', r.content,
    'keyword', r.keyword,
    'business_name', r.business_name,
    'website', r.website,
    'status', r.status,
    'doc_link', r.doc_link,
    'created_by_name', r.created_by_name)
  from "Research" r
  where r.id = p_research_id
$$;

-- Publish: check the post can go live at its address, then copy the working
-- copy to the live copy in one step.
create or replace function rpc_article_publish(p_research_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p article_posts;
  s article_sites;
begin
  if auth.uid() is null then
    raise exception 'Sign in to publish.';
  end if;

  select * into p from article_posts where research_id = p_research_id for update;
  if not found then
    raise exception 'Save the article before publishing it.';
  end if;
  if p.site_id is null then
    raise exception 'Choose which site this article goes on.';
  end if;

  select * into s from article_sites where id = p.site_id;
  if not found or not s.active then
    raise exception 'That site is switched off in Sites.';
  end if;
  if coalesce(p.slug, '') = '' then
    raise exception 'Give the article an address.';
  end if;
  if btrim(p.title) = '' then
    raise exception 'The article needs a title.';
  end if;
  if btrim(regexp_replace(p.content, '<[^>]+>', '', 'g')) = '' then
    raise exception 'The article has no content yet.';
  end if;
  if exists (
    select 1 from article_posts o
     where o.published_site_id = p.site_id and o.published_slug = p.slug
       and o.status = 'published' and o.research_id <> p.research_id
  ) then
    raise exception 'Another live article on % already uses %/%.', s.name, rtrim(s.blog_path, '/'), p.slug;
  end if;

  update article_posts set
    status                    = 'published',
    published_site_id         = p.site_id,
    published_slug            = p.slug,
    published_title           = p.title,
    published_content         = p.content,
    published_excerpt         = p.excerpt,
    published_seo_title       = p.seo_title,
    published_seo_description = p.seo_description,
    published_cover_image     = p.cover_image,
    first_published_at        = coalesce(p.first_published_at, now()),
    published_at              = now()
  where research_id = p.research_id;

  return json_build_object('url', article_url(s.domain, s.blog_path, p.slug));
end $$;

-- Unpublish: the address stops serving the article. The live copy is kept, so
-- publishing again later is the same one click.
create or replace function rpc_article_unpublish(p_research_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update article_posts set status = 'draft' where research_id = p_research_id;
$$;

revoke all on function rpc_article_source(bigint) from public, anon;
revoke all on function rpc_article_publish(bigint) from public, anon;
revoke all on function rpc_article_unpublish(bigint) from public, anon;
grant execute on function rpc_article_source(bigint) to authenticated;
grant execute on function rpc_article_publish(bigint) to authenticated;
grant execute on function rpc_article_unpublish(bigint) to authenticated;

-- What a site's article template reads. Read with a GET:
--   /rest/v1/rpc/public_article?site=<key>&slug=<slug>
-- An address with nothing live behind it answers {"found": false}, so the
-- template can serve its 404.
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
      'title', p.published_title,
      'content', p.published_content,
      'excerpt', coalesce(nullif(btrim(p.published_excerpt), ''),
                          left(btrim(regexp_replace(regexp_replace(p.published_content, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 180)),
      'seo_title', coalesce(nullif(btrim(p.published_seo_title), ''), p.published_title),
      'seo_description', coalesce(nullif(btrim(p.published_seo_description), ''),
                                  nullif(btrim(p.published_excerpt), ''),
                                  left(btrim(regexp_replace(regexp_replace(p.published_content, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 155)),
      'cover_image', p.published_cover_image,
      'first_published_at', p.first_published_at,
      'published_at', p.published_at,
      'url', article_url(s.domain, s.blog_path, p.published_slug))
    from article_posts p
    join article_sites s on s.id = p.published_site_id
    where s.key = public_article.site
      and s.active
      and p.status = 'published'
      and p.published_slug = public_article.slug
    limit 1
  ), json_build_object('found', false))
$$;

-- What a site's blog index reads: its live articles, newest first.
--   /rest/v1/rpc/public_articles?site=<key>&page=1&per_page=12
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
          'title', shown.published_title,
          'excerpt', coalesce(nullif(btrim(shown.published_excerpt), ''),
                              left(btrim(regexp_replace(regexp_replace(shown.published_content, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 180)),
          'cover_image', shown.published_cover_image,
          'first_published_at', shown.first_published_at,
          'url', article_url((select domain from s), (select blog_path from s), shown.published_slug))
        order by shown.n)
      from shown), '[]'::json))
$$;

revoke all on function public_article(text, text) from public;
revoke all on function public_articles(text, integer, integer) from public;
grant execute on function public_article(text, text) to anon, authenticated;
grant execute on function public_articles(text, integer, integer) to anon, authenticated;
