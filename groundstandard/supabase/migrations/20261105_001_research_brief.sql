-- The plan each article is written from, made when the article is created.
--
-- Bobby, 5 November: about 40 of 600 articles could go on the sites. Create
-- made up to ten articles per keyword, one keyword reached 150, and they came
-- out as copies of each other. Now Create makes one article per keyword, and
-- the Research workflow in n8n plans it first: who it is for, the angle that
-- sets it apart from what the business already has, the format, the sections,
-- and what not to repeat. The plan is kept here as JSON text so the Write
-- workflow can follow it and anyone can see why an article came out as it did.
--
-- Empty for every article made before this. rpc_research_list names its
-- columns, so the feed does not change.

alter table "Research" add column if not exists brief text;
