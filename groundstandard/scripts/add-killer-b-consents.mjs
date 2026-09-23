/**
 * Put the two opt-in tickboxes back on the Killer B form.
 *
 * The client settled what "two fields for opt ins" meant: "it's the same exact
 * fields on the form you already made on Duda." The Duda form carries two
 * consent tickboxes under the program choice, and their wording is not ours to
 * paraphrase — it is the permission the gym relies on to text somebody, so it is
 * copied across word for word.
 *
 * They were on this record earlier and were taken off. That was my reading, and
 * it was the wrong one.
 *
 *   node scripts/add-killer-b-consents.mjs          print what would change
 *   node scripts/add-killer-b-consents.mjs --write  apply it
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const PROJECT = 'qkwiauivaerrrbemdlyj';
const BUSINESS = 'Killer B HQ LLC DBA Killer B Combat Sports Academy';

const query = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) { throw new Error(JSON.stringify(body)); }
  return body;
};

// Optional, both of them. A consent that is required to send the form is not a
// consent; it is a toll. The tickbox has to be a real choice or it is worth
// nothing if anyone ever asks who agreed to be messaged.
const CONSENTS = [
  { name: 'sms_transactional', type: 'checkbox', required: false,
    label: 'By checking this box you agree to receive transactional messages from '
      + BUSINESS + '. These messages will include order confirmation, SMS alerts & '
      + 'appointment confirmations. Message frequency may vary, Data rates & charges '
      + 'may apply. Text HELP for assistance. Reply STOP to opt out.' },
  { name: 'sms_marketing', type: 'checkbox', required: false,
    label: 'By checking this box you agree to receive occasional marketing messages from '
      + BUSINESS + '. Such as discounts, promotional offers and coupon related messages. '
      + 'Message frequency may vary, Data rates & charges may apply. Text HELP for '
      + 'assistance. Reply STOP to opt out.' },
];

const [row] = await query("select fields from forms where slug = 'killer-b-contact';");
const fields = row.fields.filter((f) => !CONSENTS.some((c) => c.name === f.name));

// On the Duda form they sit under the choices and above the button, so the last
// choice is where they go — ahead of the hidden fields, which have no position.
const lastChoice = fields.map((f) => f.type).lastIndexOf('select');
const at = lastChoice === -1 ? fields.length : lastChoice + 1;
const next = [...fields.slice(0, at), ...CONSENTS, ...fields.slice(at)];

console.log('fields after this change:');
for (const f of next) {
  console.log(`  ${f.name.padEnd(18)} ${f.type.padEnd(9)} ${String(f.label).slice(0, 52)}`);
}

if (!process.argv.includes('--write')) {
  console.log('\nnothing written. Pass --write.');
  process.exit(0);
}

const literal = `'${JSON.stringify(next).replace(/'/g, "''")}'::jsonb`;
const [done] = await query(
  `update forms set fields = ${literal} where slug = 'killer-b-contact' `
  + 'returning slug, jsonb_array_length(fields) as field_count;');
console.log('\nwritten:', JSON.stringify(done));
