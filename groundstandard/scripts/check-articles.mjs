// check-articles.mjs — the Article CMS, checked without a browser or a live database.
//
// Two halves. The first turns real shapes of generator output into HTML the
// way the CMS does, so a change there cannot quietly start nesting links or
// losing paragraphs. The second runs the CMS migration in an in-memory
// Postgres (PGlite), with stand-ins for what Supabase provides — auth.uid()
// and the anon/authenticated roles — and walks the whole publish flow,
// including the property everything rests on: saving an edit never changes a
// live page, and only Publish does.
//
// Run:  node scripts/check-articles.mjs

import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { toArticleHtml, slugify, articleUrl } from '../src/lib/articleHtml.ts';

const failures = [];

const is = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `\n         got:  ${JSON.stringify(got)}\n         want: ${JSON.stringify(want)}`}`);
  if (!ok) failures.push(name);
};
const has = (name, hay, needle) => is(name, hay.includes(needle), true);
const lacks = (name, hay, needle) => is(name, hay.includes(needle), false);

console.log('plain text from the webhook:');
{
  const raw = 'Gym Marketing That Works\\n\\nMost gyms spend too much on ads. Read more at https://example.com/guide.\\n\\nH2: Start With Referrals. Your members already know people.\\n\\n- Ask at the six week mark\\n- Give both people a free week\\n\\nClick here https://example.com/book to book.';
  const html = toArticleHtml(raw);
  console.log('   ', html);
  has('a short title-cased line becomes a heading', html, '<h2>Gym Marketing That Works</h2>');
  has('paragraphs are paragraphs', html, '<p>Most gyms spend too much on ads.');
  has('a bare URL becomes a link, without the full stop', html, '<a href="https://example.com/guide">https://example.com/guide</a>.');
  has('an H2: marker becomes a heading', html, '<h2>Start With Referrals</h2>');
  has('  and the text after it stays a paragraph', html, '<p>Your members already know people.</p>');
  has('dash lines become a list', html, '<ul><li><p>Ask at the six week mark</p></li><li><p>Give both people a free week</p></li></ul>');
  has('"Click here URL" links the words', html, '<a href="https://example.com/book">Click here</a> to book.');
  lacks('no literal \\n left', html, '\\n');
}

console.log('\nHTML from the writer:');
{
  const raw = '<h1>The Title</h1><p>See <a href="https://keppan.com/pricing">our pricing</a> or https://keppan.com/demo for a demo.</p><h2>Why</h2><p>Because.</p>';
  const html = toArticleHtml(raw);
  console.log('   ', html);
  lacks('the title h1 is dropped, it is its own field', html, '<h1>');
  has('an existing link is left alone', html, '<a href="https://keppan.com/pricing">our pricing</a>');
  is('  and is not wrapped in a second link', (html.match(/<a /g) || []).length, 2);
  has('a bare URL in the text still becomes a link', html, '<a href="https://keppan.com/demo">https://keppan.com/demo</a>');
  has('headings and paragraphs untouched', html, '<h2>Why</h2><p>Because.</p>');
}

console.log('\nthe broken anchor the writer sometimes emits:');
{
  const html = toArticleHtml('Learn more at https://example.com/x">our class schedule and sign up today.');
  console.log('   ', html);
  has('becomes a link on the label', html, '<a href="https://example.com/x">our class schedule and sign up today.</a>');
}

console.log('\naddresses:');
is('punctuation and capitals', slugify('Gymdesk alternatives for martial arts schools: what to look for'), 'gymdesk-alternatives-for-martial-arts-schools-what-to-look-for');
is('ampersands become "and"', slugify('Billing, Payments & POS'), 'billing-payments-and-pos');
is('accents are dropped', slugify('Jiu-Jitsu Café Niño'), 'jiu-jitsu-cafe-nino');
is('an en dash becomes a hyphen', slugify('Kids – Adults'), 'kids-adults');
is('apostrophes vanish rather than splitting words', slugify("What a boxing gym needs that a yoga studio doesn't"), 'what-a-boxing-gym-needs-that-a-yoga-studio-doesnt');
const long = slugify('Running an after-school martial arts program: logistics, pricing, pickup, insurance, staffing and everything else owners ask');
is('long titles stop at a word', long.length <= 80 && !long.endsWith('-'), true);
console.log('    ', long);
is('the full address', articleUrl('https://www.keppan.com/', '/blog/', 'gymdesk-alternatives'), 'https://www.keppan.com/blog/gymdesk-alternatives');
is('no domain, no address', articleUrl('', '/blog', 'x'), null);

console.log('\n— the migration and the publish flow —');
const MIGRATION = fs.readFileSync(new URL('../supabase/migrations/20261027_001_article_cms.sql', import.meta.url), 'utf8');
const db = new PGlite();
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!cond) failures.push(name); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const fails = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const failsExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table "Research" (
    id bigserial primary key, title text, keyword text, content text, business_name text,
    website text, status text, doc_link text, created_by uuid, created_by_name text
  );
  insert into "Research" (title, keyword, content, status, created_by_name) values
    ('Gymdesk alternatives', 'Gymdesk alternatives', '<p>First article.</p>', 'Used', 'GroundStandard Admin'),
    ('Second article', 'other', '<p>Second.</p>', 'Used', null);
`);

console.log('the migration:');
const firstRun = await failsExec(MIGRATION);
ok('runs', firstRun === null, firstRun ?? '');
const secondRun = await failsExec(MIGRATION);
ok('runs a second time without complaint', secondRun === null, secondRun ?? '');

const staff = '11111111-1111-1111-1111-111111111111';
await db.exec(`select set_config('test.uid', '${staff}', false)`);
const site = await one(`insert into article_sites (key, name, domain, blog_path) values ('keppan', 'Keppan', 'www.keppan.com', '/blog') returning id`);
const other = await one(`insert into article_sites (key, name, domain) values ('groundstandard', 'Ground Standard', 'www.groundstandard.com') returning id`);

console.log('\nthe generator source:');
const src = (await one(`select rpc_article_source(1) as s`)).s;
ok('rpc_article_source reads the Research row', src?.title === 'Gymdesk alternatives' && src?.created_by_name === 'GroundStandard Admin');

console.log('\npublishing:');
ok('a site key must be address-safe', !!(await fails(`insert into article_sites (key, name) values ('Bad Key', 'x')`)));
ok('nothing to publish before it is saved', /Save the article/.test(await fails(`select rpc_article_publish(1)`) ?? ''));
await db.query(`insert into article_posts (research_id, title, content) values (1, 'Gymdesk alternatives', '<p>First article.</p>')`);
ok('publishing needs a site', /Choose which site/.test(await fails(`select rpc_article_publish(1)`) ?? ''));
await db.query(`update article_posts set site_id = $1 where research_id = 1`, [site.id]);
ok('publishing needs an address', /address/.test(await fails(`select rpc_article_publish(1)`) ?? ''));
ok('a bad address is refused by the table itself', !!(await fails(`update article_posts set slug = 'Has Spaces' where research_id = 1`)));
await db.query(`update article_posts set slug = 'gymdesk-alternatives' where research_id = 1`);
const pub = (await one(`select rpc_article_publish(1) as r`)).r;
ok('publish returns the live address', pub?.url === 'https://www.keppan.com/blog/gymdesk-alternatives', pub?.url);
const live = (await one(`select public_article('keppan', 'gymdesk-alternatives') as a`)).a;
ok('the site template finds it', live?.found === true && live?.title === 'Gymdesk alternatives');
ok('  with a description made from the text when none was set', live?.seo_description === 'First article.');
ok('another site does not see it', (await one(`select public_article('groundstandard', 'gymdesk-alternatives') as a`)).a.found === false);
ok('a made-up address answers found: false', (await one(`select public_article('keppan', 'nope') as a`)).a.found === false);

console.log('\nediting a live article:');
await db.query(`update article_posts set title = 'Changed title', content = '<p>Draft edit.</p>', slug = 'new-address' where research_id = 1`);
const still = (await one(`select public_article('keppan', 'gymdesk-alternatives') as a`)).a;
ok('saving an edit does not change the live page', still.found && still.title === 'Gymdesk alternatives' && still.content === '<p>First article.</p>');
ok('  nor move it to the new address', (await one(`select public_article('keppan', 'new-address') as a`)).a.found === false);
await db.query(`select rpc_article_publish(1)`);
ok('updating the live article publishes the edit at the new address', (await one(`select public_article('keppan', 'new-address') as a`)).a.title === 'Changed title');
ok('  and the old address is gone', (await one(`select public_article('keppan', 'gymdesk-alternatives') as a`)).a.found === false);

console.log('\ntwo articles, one address:');
await db.query(`insert into article_posts (research_id, title, content, site_id, slug) values (2, 'Second article', '<p>Second.</p>', $1, 'new-address')`, [site.id]);
ok('the second cannot go live there', /already uses \/blog\/new-address/.test(await fails(`select rpc_article_publish(2)`) ?? ''), await fails(`select rpc_article_publish(2)`) ?? '');
await db.query(`update article_posts set site_id = $1 where research_id = 2`, [other.id]);
ok('the same address on another site is fine', (await fails(`select rpc_article_publish(2)`)) === null);

console.log('\nthe blog list:');
const list = (await one(`select public_articles('keppan') as l`)).l;
ok('lists the live articles of that site only', list.total === 1 && list.items.length === 1 && list.items[0].slug === 'new-address', JSON.stringify(list));

console.log('\ntaking it down:');
await db.query(`select rpc_article_unpublish(1)`);
ok('unpublished means the template finds nothing', (await one(`select public_article('keppan', 'new-address') as a`)).a.found === false);
ok('  and the list is empty', (await one(`select public_articles('keppan') as l`)).l.total === 0);
await db.query(`select rpc_article_publish(1)`);
ok('publishing again brings it back', (await one(`select public_article('keppan', 'new-address') as a`)).a.found === true);
await db.query(`update article_sites set active = false where key = 'keppan'`);
ok('switching a site off takes its articles down', (await one(`select public_article('keppan', 'new-address') as a`)).a.found === false);
await db.query(`update article_sites set active = true where key = 'keppan'`);

console.log('\nwho may do what:');
const grants = (await db.query(`
  select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('public_article','public_articles','rpc_article_publish','rpc_article_unpublish','rpc_article_source')`)).rows;
const g = Object.fromEntries(grants.map(r => [r.proname, r]));
ok('a website (anon) can read published articles', g.public_article?.anon && g.public_articles?.anon);
ok('a website cannot publish, unpublish or read the generator', !g.rpc_article_publish?.anon && !g.rpc_article_unpublish?.anon && !g.rpc_article_source?.anon);
ok('staff can do all three', g.rpc_article_publish?.auth && g.rpc_article_unpublish?.auth && g.rpc_article_source?.auth);
ok('anon cannot read the tables directly', !(await one(`select has_table_privilege('anon', 'article_posts', 'select') as x`)).x && !(await one(`select has_table_privilege('anon', 'article_sites', 'select') as x`)).x);
await db.exec(`select set_config('test.uid', '', false)`);
ok('publishing needs a signed-in person', /Sign in/.test(await fails(`select rpc_article_publish(1)`) ?? ''));


console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
