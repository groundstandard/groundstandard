// The campaign parser, run over every submission we have ever recorded.
//
// The point is not that it returns something — it is what it returns for rows
// nobody designed for: links with no utm at all, an fbclid and nothing else, a
// referrer from a search engine, a malformed URL. A wrong label here would
// quietly misreport where a client's leads come from.
//
// Run:  node scripts/check-attribution.mjs

import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync(new URL('../src/lib/attribution.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { attributionOf } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const failures = [];
const ok = (name, extra) => console.log(`  ok   ${name}${extra ? ' — ' + extra : ''}`);
const bad = (name, why) => { failures.push(name); console.log(`  FAIL ${name} — ${why}`); };
const is = (name, got, want) => (got === want ? ok(name, String(got)) : bad(name, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));

console.log('the cases that decide whether a label is honest:');
is('a tagged link', attributionOf({ source_url: 'https://a.com/x?utm_source=ig&utm_medium=paid&utm_campaign=sept-promo', source_referrer: null }).label, 'ig');
is('  and it keeps the campaign', attributionOf({ source_url: 'https://a.com/x?utm_campaign=sept-promo&utm_source=ig', source_referrer: null }).campaign, 'sept-promo');
is('a facebook click with no tags', attributionOf({ source_url: 'https://a.com/x?fbclid=abc123', source_referrer: null }).label, 'Facebook');
is('a google ads click', attributionOf({ source_url: 'https://a.com/x?gclid=abc', source_referrer: null }).label, 'Google Ads');
is('tags win over the click id', attributionOf({ source_url: 'https://a.com/x?utm_source=newsletter&fbclid=abc', source_referrer: null }).label, 'newsletter');
is('no campaign, came from search', attributionOf({ source_url: 'https://a.com/x', source_referrer: 'https://www.google.com/' }).label, 'google.com');
is('the referrer is another page of the same site', attributionOf({ source_url: 'https://www.a.com/x', source_referrer: 'https://www.a.com/classes', source_hostname: 'www.a.com' }).label, 'Direct');
is('a real referrer still counts', attributionOf({ source_url: 'https://www.a.com/x', source_referrer: 'https://www.bing.com/', source_hostname: 'www.a.com' }).label, 'bing.com');
is('nothing at all', attributionOf({ source_url: 'https://a.com/x', source_referrer: null }).label, 'Direct');
is('empty utm is not a campaign', attributionOf({ source_url: 'https://a.com/x?utm_source=', source_referrer: null }).label, 'Direct');
is('a broken url does not throw', attributionOf({ source_url: 'not a url at all', source_referrer: null }).label, 'Direct');
is('a null row does not throw', attributionOf({ source_url: null, source_referrer: null }).label, 'Direct');

// A local export of the real submissions, if one has been pulled. It is not
// committed - it is client lead data, and the checks above stand without it.
const rowsFile = new URL('.rows.json', import.meta.url);
const rows = fs.existsSync(rowsFile) ? JSON.parse(fs.readFileSync(rowsFile, 'utf8')) : null;

if (!rows) {
  console.log('\nno local export of real submissions - skipping the run over live data.');
  console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
}

console.log(`\nagainst all ${rows.length} real submissions:`);

let threw = 0;
const counts = new Map();
for (const r of rows) {
  try {
    const a = attributionOf(r);
    if (typeof a.label !== 'string' || !a.label) throw new Error('empty label');
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  } catch { threw += 1; }
}
is('rows that threw or came back blank', threw, 0);

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log('  what the screen will show:');
for (const [label, n] of sorted.slice(0, 12)) console.log(`    ${String(n).padStart(5)}  ${label}`);
if (sorted.length > 12) console.log(`    ${String(sorted.slice(12).reduce((t, [, n]) => t + n, 0)).padStart(5)}  in ${sorted.length - 12} more`);

const direct = counts.get('Direct') ?? 0;
console.log(`\n  ${rows.length - direct} of ${rows.length} leads can now be told apart by where they came from.`);

console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
