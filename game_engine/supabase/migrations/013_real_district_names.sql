-- SADAK: districts are named after the real places their OpenStreetMap maps
-- cover (Chandni Chowk, Dadar, Triplicane, ...). Ids are unchanged, so
-- progress, task ids and lessons still match.

update public.districts
set district = jsonb_set(district, '{name}', '"Charminar"'::jsonb), updated_at = now()
where id = 'charminar-lane';

update public.districts
set district = jsonb_set(district, '{name}', '"Dadar"'::jsonb), updated_at = now()
where id = 'dadar-chowk';

update public.districts
set district = jsonb_set(district, '{name}', '"Fort Kochi"'::jsonb), updated_at = now()
where id = 'fort-kochi';

update public.districts
set district = jsonb_set(district, '{name}', '"Golden Temple"'::jsonb), updated_at = now()
where id = 'hall-bazaar';

update public.districts
set district = jsonb_set(district, '{name}', '"Old Town"'::jsonb), updated_at = now()
where id = 'lingaraj-lane';

update public.districts
set district = jsonb_set(district, '{name}', '"Majestic"'::jsonb), updated_at = now()
where id = 'majestic-cross';

update public.districts
set district = jsonb_set(district, '{name}', '"Manek Chowk"'::jsonb), updated_at = now()
where id = 'manek-chowk';

update public.districts
set district = jsonb_set(district, '{name}', '"Triplicane"'::jsonb), updated_at = now()
where id = 'marina-nagar';

update public.districts
set district = jsonb_set(district, '{name}', '"Park Street"'::jsonb), updated_at = now()
where id = 'park-gully';

update public.districts
set district = jsonb_set(district, '{name}', '"Chandni Chowk"'::jsonb), updated_at = now()
where id = 'purani-sadak';
