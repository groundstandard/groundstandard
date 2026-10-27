// What went wrong when the Article Generator asked n8n for an article, put so
// the writer can tell what happened and what to do about it.
//
// The app used to say "OpenAI has run out of balance" for nearly every failure:
// any error with a brace or a quote in it, any over 200 characters, and any
// with the word "limit" anywhere. Most errors from n8n are like that, so a
// timeout or a broken workflow sent people to top up an account that was fine
// (Jade, 27 October). This names a cause only when the error shows it, names
// the provider only when the error does, and keeps the error as it arrived so
// whoever looks into it has all of it.

export type AiErrorKind =
  | 'credits'
  | 'auth'
  | 'rate_limit'
  | 'turned_away'
  | 'model'
  | 'too_long'
  | 'timeout'
  | 'workflow_off'
  | 'workflow'
  | 'server'
  | 'network'
  | 'unknown';

export type AiError = {
  kind: AiErrorKind;
  title: string;
  message: string;
  // OpenAI, OpenRouter, Anthropic or Google, when the error names one
  provider: string | null;
  status: number | null;
  // the error as it arrived, made readable
  detail: string;
};

// The first that matches decides. Credits come before rate limits because
// OpenAI answers an empty account with a 429 too.
const KINDS: Array<[AiErrorKind, RegExp]> = [
  ['credits', /insufficient[_ ]quota|exceeded your current quota|check your plan and billing|insufficient (credits|balance|funds)|credit balance is too low|requires more credits|can only afford|out of credits|no credits remaining|add credits to continue|billing[_ ]hard[_ ]limit|payment required/],
  ['auth', /incorrect api key|invalid[_ ]api[_ ]key|authorization failed|no auth credentials|api key (is )?(invalid|expired|revoked)/],
  ['too_long', /context[_ ]length|maximum context|context window|too many tokens|prompt is too long|reduce the length of the messages/],
  // A rate limit only when the provider's own words show one
  ['rate_limit', /rate limit reached for|rate[ _-]?limited|rate limit exceeded|tokens per min|requests per (min|day)|resource_exhausted|overloaded|try again in \d/],
  // n8n's label alone ("OpenAI: Rate limit reached", "The service is receiving
  // too many requests from you") is not one. n8n gave OpenAI's "You have no
  // credits remaining" exactly that label, and the label was all that reached
  // the app (Jade, 27 October).
  ['turned_away', /rate[ _-]?limit|too many requests/],
  ['model', /not a valid model|model_not_found|no endpoints found|does not exist or you do not have access|invalid model|unknown model|model (is )?(not found|not supported|unavailable|deprecated)|no allowed providers/],
  ['workflow_off', /is not registered|workflow must be active/],
  ['timeout', /timed? ?out|timeout|time-out/],
  ['workflow', /error in workflow|workflow could not be started|workflow has issues|problem in node/],
  ['server', /bad gateway|service unavailable|origin is unreachable|web server is down/],
  ['network', /failed to fetch|networkerror|load failed|network request failed/],
];

// When the words say nothing, the status code still might.
const BY_STATUS: Record<number, AiErrorKind> = {
  401: 'auth',
  402: 'credits',
  408: 'timeout',
  429: 'turned_away',
  500: 'workflow',
  502: 'server',
  503: 'server',
  504: 'timeout',
  520: 'server',
  521: 'server',
  522: 'server',
  523: 'server',
  524: 'timeout',
};

// OpenRouter first: its errors quote the model, and the model's name starts
// with another provider's ("anthropic/claude-sonnet-4"), hence the (?!\/).
const PROVIDERS: Array<[string, RegExp]> = [
  ['OpenRouter', /openrouter/],
  ['Google', /generativelanguage|resource_exhausted/],
  ['Anthropic', /anthropic(?!\/)|credit balance is too low/],
  ['OpenAI', /openai(?!\/)|insufficient[_ ]quota|exceeded your current quota/],
];

const BILLING: Record<string, string> = {
  OpenAI: 'platform.openai.com, under Settings → Billing',
  OpenRouter: 'openrouter.ai, under Settings → Credits',
  Anthropic: 'console.anthropic.com, under Settings → Billing',
};

// Where n8n and the providers put the words: n8n's { message, description },
// OpenAI's and OpenRouter's { error: { message } }, the [{ Failed }] some of
// our workflows answer with, and the provider's own reply that OpenRouter
// tucks into error.metadata.raw.
const MESSAGE_KEYS = ['Failed', 'failed', 'FAILURE', 'error', 'error output', 'message', 'description', 'detail', 'details', 'hint', 'reason', 'errorMessage', 'error_description', 'metadata', 'raw'];

// n8n's stock wording for a status code, which says no more than the code.
const GENERIC = /^(error in workflow|workflow could not be started!?|bad request - please check your parameters|your request is invalid or could not be processed by the service|the service (was not able|failed) to process your request|internal server error|unknown error)\.?$/i;

// An object or array in the text, from its start or from its first bracket.
function jsonIn(text: string): unknown {
  const t = text.trim();
  for (const start of [0, t.search(/[[{]/)]) {
    if (start < 0) continue;
    try {
      const v: unknown = JSON.parse(t.slice(start));
      if (v && typeof v === 'object') return v;
    } catch { /* not JSON from here */ }
  }
  return undefined;
}

// Text a person can read: error pages and n8n's messages arrive with HTML in them.
function plain(text: string): string {
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function collect(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || out.length > 20) return;
  if (typeof value === 'string') {
    const inner = jsonIn(value);
    if (inner !== undefined) collect(inner, out, depth + 1);
    else if (plain(value)) out.push(plain(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value.slice(0, 5)) collect(v, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const k of MESSAGE_KEYS) if (k in rec) collect(rec[k], out, depth + 1);
  }
}

const short = (s: string) => (s.length > 300 ? s.slice(0, 299) + '…' : s);

function words(kind: AiErrorKind, provider: string | null, status: number | null, said: string, model?: string): { title: string; message: string } {
  const who = provider ?? 'The AI provider';
  const code = status ? ` (error ${status})` : '';
  const specific = said && !GENERIC.test(said) ? said : '';
  switch (kind) {
    case 'credits':
      return {
        title: provider ? `${provider} is out of credits` : 'Out of credits',
        message: provider
          ? `${provider} has run out of credits, so this could not finish. It needs topping up before it will work again.${BILLING[provider] ? ` Top up at ${BILLING[provider]}.` : ''}`
          : 'One of the accounts this uses has run out of credits, so this could not finish. The error details say which one.',
      };
    case 'auth':
      return { title: 'API key refused', message: `${who} refused the key n8n uses${code}. The key needs replacing in n8n.` };
    case 'rate_limit':
      return { title: 'Too many requests right now', message: `${who} is turning requests away for now${code}, because of too many requests or too much load. Wait a minute and try again.` };
    case 'turned_away':
      return {
        title: `${who} turned this request away`,
        message: `n8n reports an empty account and too many requests the same way${code}, so check the credits first${provider && BILLING[provider] ? `, at ${BILLING[provider]}` : ''}. If there are credits left, wait a minute and try again.`,
      };
    case 'model':
      return {
        title: "This model isn't available",
        message: model ? `${who} could not run ${model}. Pick another model and try again.` : `${who} could not run the model this uses. The model needs changing in n8n.`,
      };
    case 'too_long':
      return {
        title: 'Too long for this model',
        message: model ? `This is longer than ${model} can take in one go. Pick a model that takes longer text and try again.` : 'This is longer than the model can take in one go.',
      };
    case 'timeout':
      return { title: 'No reply in time', message: `The request was cut off while waiting for an answer${code}. n8n may still finish it, so refresh in a few minutes before trying again.` };
    case 'workflow_off':
      return { title: 'Workflow is off', message: 'The n8n workflow for this is switched off, so the request went nowhere. It needs switching on in n8n.' };
    case 'workflow':
      return { title: 'The workflow failed', message: `n8n stopped partway through with an error. The failed run in n8n's Executions shows which step and why.${specific ? ` n8n said: “${short(specific)}”` : ''}` };
    case 'server':
      return { title: 'Not responding', message: `n8n or the AI provider did not answer properly${code}. Try again in a few minutes.` };
    case 'network':
      return { title: "Couldn't connect", message: 'The browser got no answer from the server. Check the internet connection, then refresh before trying again in case it went through.' };
    default:
      return { title: 'Something went wrong', message: said ? short(said) : `The request failed${code}. The error details are what came back.` };
  }
}

// raw is the message the Create, Write and Rewrite requests fail with:
// "Webhook error: <status> <body>", a body that reported a failure, or the
// browser's own words when nothing came back. model is the one picked in the
// form, where there is a choice.
export function describeAiError(raw: string, model?: string): AiError {
  const text = String(raw ?? '').trim();
  const head = /^(?:rewrite )?webhook error:\s*(\d{3})\b\s*/i.exec(text);
  const status = head ? Number(head[1]) : null;
  const body = head ? text.slice(head[0].length) : text;
  const json = jsonIn(body);

  const said: string[] = [];
  if (json !== undefined) {
    collect(json, said);
  } else if (/<(!doctype|html|head|body|title)\b/i.test(body)) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
    if (title && plain(title[1])) said.push(plain(title[1]));
  } else if (plain(body)) {
    said.push(plain(body));
  }

  // An error page's scripts and styles are not part of what it says.
  const hay = [head?.[0] ?? '', json !== undefined ? body : plain(body), ...said].join(' ').toLowerCase();
  const kind = KINDS.find(([, re]) => re.test(hay))?.[0] ?? (status != null ? BY_STATUS[status] : undefined) ?? 'unknown';
  const provider = PROVIDERS.find(([, re]) => re.test(hay))?.[0] ?? null;
  const best = said.find(s => !GENERIC.test(s)) ?? said[0] ?? '';
  const shown = json !== undefined ? JSON.stringify(json, null, 2) : plain(body);
  const detail = [head ? head[0].trim() : '', shown].filter(Boolean).join('\n').slice(0, 2000);

  return { kind, provider, status, detail, ...words(kind, provider, status, best, model) };
}
