/**
 * Name the fields what GoHighLevel already receives.
 *
 * The CRM's existing workflow was built against the old Duda form, whose keys
 * are the questions themselves:
 *
 *   "First Name", "Last Name", "Email", "Phone",
 *   "Which program are you interested in?",
 *   "Opt-in (…the whole consent sentence…)": "true"
 *
 * Sending first_name where it expects "First Name" means every mapping has to be
 * rebuilt on their side. Matching the keys means none of it has to change.
 *
 * Nothing breaks here: the embed reads a field by loose name, so "First Name"
 * and first_name are the same field to it, and the conversion tracking that
 * looks for a first name still finds one.
 *
 *   node scripts/rename-killer-b-fields.mjs          show the change
 *   node scripts/rename-killer-b-fields.mjs --write  apply it
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const PROJECT = 'qkwiauivaerrrbemdlyj';
const GYM = 'Killer B Combat Sports Academy';

const query = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
};

// The CRM flattens punctuation in a key to an underscore, so the consent keys
// are written the way they arrive rather than the way they read.
const optIn = (what) =>
  `Opt-in (By checking this box you agree to receive ${what} from ${GYM}_ `
  + 'Message frequency may vary_ Data rates & charges may apply_ '
  + 'Text HELP for assistance_ Reply STOP to opt out_)';

const RENAMES = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  audience: 'Which program are you interested in?',
  focus: 'Martial Arts, Fitness or Both?',
  sms_transactional: optIn('transactional messages'),
  sms_marketing: optIn('occasional marketing messages'),
  // site_id stays as it is: it is ours, not a question anybody answers.
};

const [row] = await query("select fields from forms where slug = 'killer-b-contact';");
const next = row.fields.map((f) => (RENAMES[f.name] ? { ...f, name: RENAMES[f.name] } : f));

for (const f of next) {
  console.log(`  ${String(f.type).padEnd(9)} ${f.name.slice(0, 84)}`);
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
