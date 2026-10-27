// What the Article Generator tells a writer when a request fails.
//
// The errors here are the shapes that actually come back: n8n's own replies,
// OpenAI, OpenRouter and Anthropic passed through n8n, the [{ Failed }] some
// workflows answer with, gateway error pages, and the browser's own words.
// The point is that each is named for what it is. Calling them all "OpenAI has
// run out of balance" is what sent people to top up an account that was fine.
//
// Run:  node scripts/check-ai-errors.mjs

import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync(new URL('../src/lib/aiError.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { describeAiError } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const failures = [];
const ok = (name, extra) => console.log(`  ok   ${name}${extra ? ' — ' + extra : ''}`);
const bad = (name, why) => { failures.push(name); console.log(`  FAIL ${name} — ${why}`); };
const is = (name, got, want) => (got === want ? ok(name, String(got)) : bad(name, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));
const has = (name, text, part) => (String(text).includes(part) ? ok(name) : bad(name, `${JSON.stringify(part)} not in ${JSON.stringify(text)}`));
const lacks = (name, text, part) => (!String(text).includes(part) ? ok(name) : bad(name, `${JSON.stringify(part)} is in ${JSON.stringify(text)}`));

// How the Dashboard builds the messages it hands over.
const http = (status, body, prefix = 'Webhook error') => `${prefix}: ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`;
const failedBody = (text) => JSON.stringify([{ Failed: text }]);

const cases = [];
const run = (name, raw, model) => { const e = describeAiError(raw, model); cases.push([name, e]); return e; };

console.log('out of credits, and whose:');
let e = run('openai via n8n', failedBody('Insufficient quota detected. <a href="https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/common-issues/#insufficient-quota" target="_blank">Learn more</a> about resolving this issue'));
is('n8n\'s OpenAI node, empty account', e.kind, 'credits');
is('  names OpenAI', e.provider, 'OpenAI');
has('  says where to top up', e.message, 'platform.openai.com');
e = run('openai passthrough', http(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.', type: 'insufficient_quota', param: null, code: 'insufficient_quota' } }));
is('OpenAI\'s own 429 for an empty account is credits, not a rate limit', e.kind, 'credits');
is('  names OpenAI', e.provider, 'OpenAI');
is('  keeps the status', e.status, 429);
e = run('openrouter 402', http(402, { error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), 'anthropic/claude-sonnet-4');
is('OpenRouter out of credits', e.kind, 'credits');
is('  names OpenRouter, not the model\'s maker', e.provider, 'OpenRouter');
is('  says so in the title', e.title, 'OpenRouter is out of credits');
e = run('openrouter afford', http(402, { error: { message: 'This request requires more credits, or fewer max_tokens. You requested up to 64000 tokens, but can only afford 1204. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account', code: 402 } }, 'Rewrite webhook error'));
is('OpenRouter cannot afford this one', e.kind, 'credits');
is('  from the Rewrite request too', e.status, 402);
e = run('anthropic', http(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }));
is('Anthropic out of credits', e.kind, 'credits');
is('  names Anthropic', e.provider, 'Anthropic');
e = run('402 alone', http(402, ''));
is('a bare 402 is still credits', e.kind, 'credits');
has('  and does not guess whose', e.message, 'say which one');

console.log('\nthe ones that used to be called out of balance:');
e = run('rate limit', http(429, { error: { message: 'Rate limit reached for gpt-4o in organization org-abc on tokens per min (TPM): Limit 30000, Used 29000, Requested 2000. Please try again in 2s.', type: 'tokens', code: 'rate_limit_exceeded' } }));
is('a rate limit, which says "Limit"', e.kind, 'rate_limit');
e = run('n8n 429', failedBody('The service is receiving too many requests from you'));
is('n8n\'s words for any 429 do not claim a rate limit', e.kind, 'turned_away');

console.log('\nwhat Jade got, 27 October — OpenAI said "You have no credits remaining", n8n said "Rate limit reached":');
e = run('jade', JSON.stringify({ Failed: 'The selected AI model is unable to process this request due to current capacity limitations.\nPlease select an alternative AI model to continue. openai/gpt-5.2-pro', 'error output': 'OpenAI: Rate limit reached' }), 'openai/gpt-5.2-pro');
is('n8n\'s label alone is not called a rate limit', e.kind, 'turned_away');
is('  names OpenAI', e.provider, 'OpenAI');
has('  says to check the credits first', e.message, 'check the credits first');
has('  and where', e.message, 'platform.openai.com');
e = run('jade full', failedBody('OpenAI: Rate limit reached You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.'));
is('with OpenAI\'s own words it is credits', e.kind, 'credits');
is('  names OpenAI', e.provider, 'OpenAI');
e = run('bare 429', http(429, ''));
is('a bare 429 is not called a rate limit either', e.kind, 'turned_away');
e = run('invalid model', http(400, { error: { message: 'deepseek/v3 is not a valid model ID', code: 400 } }), 'deepseek/v3');
is('a model that does not exist', e.kind, 'model');
has('  names the model picked', e.message, 'deepseek/v3');
has('  and says to pick another', e.message, 'Pick another model');
e = run('no endpoints', failedBody('No endpoints found for anthropic/claude-3-opus.'), 'anthropic/claude-3-opus');
is('a model nobody serves any more', e.kind, 'model');
is('  the model\'s name is not taken for the provider', e.provider, null);
e = run('too long', http(400, { error: { message: "This endpoint's maximum context length is 128000 tokens. However, you requested about 140000 tokens.", code: 400 } }), 'openai/gpt-4o');
is('an article too long for the model', e.kind, 'too_long');
e = run('word_limit', failedBody('word_limit must be a number'));
is('"limit" in a field name is not a limit', e.kind, 'unknown');
is('  and says what it says', e.message, 'word_limit must be a number');
e = run('markup', failedBody('Something odd happened. <a href="https://example.com/help">Read more</a>'));
is('an error with a link in it reads as text', e.message, 'Something odd happened. Read more');
e = run('bad key', http(401, { error: { message: 'Incorrect API key provided: sk-proj-****abcd. You can find your API key at https://platform.openai.com/account/api-keys.', type: 'invalid_request_error', code: 'invalid_api_key' } }));
is('a key that was refused', e.kind, 'auth');
is('  names OpenAI', e.provider, 'OpenAI');

console.log('\nn8n, the gateway and the browser:');
e = run('error in workflow', http(500, { code: 0, message: 'Error in workflow' }));
is('n8n\'s "Error in workflow"', e.kind, 'workflow');
lacks('  does not repeat n8n\'s stock words', e.message, 'n8n said');
is('  the details keep the reply', e.detail, 'Webhook error: 500\n{\n  "code": 0,\n  "message": "Error in workflow"\n}');
e = run('workflow detail', http(500, { message: "Cannot read properties of undefined (reading 'content')" }));
is('a step that broke', e.kind, 'workflow');
has('  quotes what n8n said', e.message, "Cannot read properties of undefined (reading 'content')");
e = run('workflow off', http(404, { code: 404, message: 'The requested webhook "POST Write" is not registered.', hint: 'The workflow must be active for a production URL to run successfully.' }));
is('a workflow that is switched off', e.kind, 'workflow_off');
e = run('504 page', http(504, '<html><head><title>504 Gateway Time-out</title></head><body><center><h1>504 Gateway Time-out</h1></center></body></html>'));
is('a gateway that gave up waiting', e.kind, 'timeout');
has('  says n8n may still finish', e.message, 'may still finish');
lacks('  the details have no markup', e.detail, '<');
e = run('502 page', http(502, '<!DOCTYPE html><html><head><title>Bad gateway</title><script>var timeout = 3000;</script></head><body>Bad gateway</body></html>'));
is('a bad gateway, whatever its script says', e.kind, 'server');
lacks('  the script is not in the details', e.detail, 'var timeout');
e = run('network', 'Failed to fetch');
is('no answer at all', e.kind, 'network');
e = run('empty 500', http(500, ''));
is('an empty 500 is the workflow', e.kind, 'workflow');
e = run('nothing', '');
is('nothing at all does not throw', e.kind, 'unknown');

console.log('\nevery case:');
for (const [name, x] of cases) {
  if (!x.title || !x.message) bad(`${name} has words`, JSON.stringify(x));
  if (/run out of balance/i.test(x.message)) bad(`${name} is not the old message`, x.message);
  if (x.detail.length > 2000) bad(`${name} keeps the details short`, String(x.detail.length));
}
ok(`${cases.length} cases have a title and a message, none of them the old one`);

console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
