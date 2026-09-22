-- How each form looks, set in the Design panel, without a redeploy.
--
-- The embed's whole idea is to inherit the site it sits on: the site's font, the
-- site's text colour, a button drawn in currentColor. That stays the default, and
-- an empty object here means exactly that — a form nobody has styled is the form
-- we have always shipped.
--
-- What gets set in the Design panel is written here as tokens: a colour, a
-- radius, a button style. form.js turns each one into a CSS variable on that
-- form's root, with today's value as the fallback for anything left unset. Same
-- reasoning as `fields`: jsonb, so a new knob is a change to the panel and to the
-- script, never to this table.
--
-- Anon already reads active rows to render them, so this is public too. It is
-- cosmetic; there is nothing in it worth protecting.

alter table forms add column if not exists theme jsonb not null default '{}'::jsonb;
