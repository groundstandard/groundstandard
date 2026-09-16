// Where a lead came from, read out of the row we already have.
//
// Every submission stores the full landing URL, so the campaign has always been
// there — buried in a query string nobody was going to open one row at a time.
// Reading it here rather than adding columns means the whole history answers to
// it, not only the leads that arrive from now on, and neither the database nor
// the n8n workflow has to change.
//
// Kept out of the component so it can be checked against real rows.

export type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  clickId: string | null;
  label: string;
};

export type AttributionInput = {
  source_url: string | null;
  source_referrer: string | null;
  source_hostname?: string | null;
};

export const normalizeHostname = (hostname: string) => hostname.replace(/^www\./i, '');

export function attributionOf(row: AttributionInput): Attribution {
  let params: URLSearchParams | null = null;
  try {
    params = new URL(row.source_url ?? '').searchParams;
  } catch {
    params = null;
  }

  const read = (key: string) => {
    const value = params?.get(key)?.trim();
    return value ? value : null;
  };

  const source = read('utm_source');
  const medium = read('utm_medium');
  const campaign = read('utm_campaign');

  // An ad click carries an id even when whoever built the link forgot the utm
  // tags, and that happens often enough to be worth reading.
  const clickId = read('gclid') ? 'Google Ads'
    : read('fbclid') ? 'Facebook'
    : read('msclkid') ? 'Microsoft Ads'
    : null;

  let label = source ?? clickId;

  // No campaign on the link: the referrer is the next best answer, and it is how
  // organic search and the Google Business Profile listing show up at all.
  //
  // Except when the referrer is the site itself. Most rows in the history look
  // like that — somebody read two pages before enquiring — and calling that a
  // source would put a client's own domain at the top of their campaign list,
  // which tells them nothing and crowds out what actually brought the lead in.
  if (!label && row.source_referrer) {
    try {
      const from = normalizeHostname(new URL(row.source_referrer).hostname);
      const self = row.source_hostname ? normalizeHostname(row.source_hostname) : null;
      label = from === self ? null : from;
    } catch {
      label = null;
    }
  }

  return { source, medium, campaign, clickId, label: label ?? 'Direct' };
}
