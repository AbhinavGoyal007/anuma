-- Make a proposal say how sure it is, and give the ontology the words a
-- retailer actually uses.
--
-- Two things were wrong with the first round of proposals against AG LLC's
-- 372 labels.
--
-- First, the descriptions are not prose for people; they are what every label is
-- compared against, and they were missing the vocabulary of the shelf.
-- `accessory` never said "case", "cover", "screen protector" or "power bank",
-- while `smartphone` owned the word "mobile" — so "SmartPhone Accessories >
-- Mobile Cases" proposed *smartphone*, and "Copilot+ PC" only reached laptop at
-- 0.420. Filling in the retail words moved Copilot+ PC to 0.579 and Artificial
-- Intelligence PC from 0.418 to 0.565.
--
-- Second, and more useful: the top score alone is not evidence. "Mobile Cases"
-- scored 0.499 for an answer that was wrong; "Copilot+ PC" scored 0.420 for one
-- that was right. What separates them is the distance to the runner-up — 0.076
-- against 0.196. A label whose best two categories are neck and neck is one the
-- model cannot call, however high its top score, so the margin is stored and it
-- is the margin that decides what may be confirmed in bulk.

alter table public.category_mappings
  add column if not exists proposed_margin numeric(4, 3);
alter table public.spoken_category_mappings
  add column if not exists proposed_margin numeric(4, 3);

comment on column public.category_mappings.proposed_margin is
  'Gap between the best and second-best category. Low means ambiguous regardless of score.';
comment on column public.spoken_category_mappings.proposed_margin is
  'Gap between the best and second-best category. Low means ambiguous regardless of score.';

-- The descriptions are the matcher's input, so they carry the words a retailer
-- and a customer would use rather than the words a dictionary would.
update public.anuma_categories set description =
  'add-on or accessory for another device, not the device itself — phone case, back cover, flip cover, screen protector, tempered glass, screen guard, data cable, charging cable, charger, adapter, power bank, laptop bag, sleeve, mouse, keyboard, stand, mount'
  where key = 'accessory';
update public.anuma_categories set description =
  'the mobile phone handset itself — cellphone, smartphone, feature phone. Not cases, covers, chargers or other accessories for a phone'
  where key = 'smartphone';
update public.anuma_categories set description =
  'portable personal computer — notebook, laptop, ultrabook, clamshell, convertible or 2-in-1 laptop, detachable, MacBook, Copilot+ PC, AI PC, commercial or business notebook'
  where key = 'laptop';
update public.anuma_categories set description =
  'portable computer built for gaming, with a discrete graphics card — gaming laptop, gaming notebook, gaming PC'
  where key = 'gaming_laptop';
update public.anuma_categories set description =
  'television set, smart TV, LED, QLED or OLED TV, 4K or Ultra HD TV for watching at home'
  where key = 'television';
update public.anuma_categories set description =
  'headphones, earphones, earbuds, neckband, speakers, soundbar, home theatre, audio equipment'
  where key = 'audio';
update public.anuma_categories set description =
  'smartwatch, fitness band, smart band, wearable smart device worn on the body'
  where key = 'smartwatch';
