-- Which CRM the lead goes to, as rules rather than one fixed address.
--
-- Bobby, September 24: "if the person selects Fitness as their option...then
-- they need to go to a different webhook. Is that possible?" — Killer B sells
-- martial arts, BLAB sells fitness, and the two are separate businesses with
-- separate CRMs. One form on the site, two places the lead can land.
--
-- Same shape as redirect_rules and read the same way: top to bottom, "if this
-- field is this answer, post there", first match wins. Nothing matching means
-- the form's own webhook, which is what every form does today, so adding the
-- column changes nothing until somebody writes a rule.

alter table forms add column if not exists webhook_rules jsonb not null default '[]'::jsonb;
