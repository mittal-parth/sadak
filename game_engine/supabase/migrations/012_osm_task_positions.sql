-- SADAK: move street tasks onto the OpenStreetMap district maps.
-- Positions are now absolute map coordinates (metres from the map centre,
-- +x east, +z south), from the spots in public/maps/<district>.json.
-- Regenerate: npx tsx scripts/osm/write-task-positions.ts

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'purani-sadak-auto' then jsonb_set(elem, '{pos}', '[285.6,-268.8]'::jsonb)
          when 'purani-sadak-shop' then jsonb_set(elem, '{pos}', '[4.7,-273]'::jsonb)
          when 'purani-sadak-temple' then jsonb_set(elem, '{pos}', '[212.1,-272.9]'::jsonb)
          when 'purani-sadak-bus' then jsonb_set(elem, '{pos}', '[312,-302.1]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'purani-sadak';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'marina-nagar-auto' then jsonb_set(elem, '{pos}', '[-265.9,141.8]'::jsonb)
          when 'marina-nagar-shop' then jsonb_set(elem, '{pos}', '[-219.9,131.5]'::jsonb)
          when 'marina-nagar-temple' then jsonb_set(elem, '{pos}', '[-306.2,92.5]'::jsonb)
          when 'marina-nagar-bus' then jsonb_set(elem, '{pos}', '[-360.1,87.9]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'marina-nagar';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'majestic-cross-auto' then jsonb_set(elem, '{pos}', '[247.9,-61.1]'::jsonb)
          when 'majestic-cross-shop' then jsonb_set(elem, '{pos}', '[243.3,48.3]'::jsonb)
          when 'majestic-cross-temple' then jsonb_set(elem, '{pos}', '[238.3,-2.2]'::jsonb)
          when 'majestic-cross-bus' then jsonb_set(elem, '{pos}', '[94.8,-58.6]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'majestic-cross';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'park-gully-auto' then jsonb_set(elem, '{pos}', '[-212.2,-183.2]'::jsonb)
          when 'park-gully-shop' then jsonb_set(elem, '{pos}', '[-222.9,-194.9]'::jsonb)
          when 'park-gully-temple' then jsonb_set(elem, '{pos}', '[-184.6,-153.4]'::jsonb)
          when 'park-gully-bus' then jsonb_set(elem, '{pos}', '[-287.8,-211]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'park-gully';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'charminar-lane-auto' then jsonb_set(elem, '{pos}', '[16.6,-42.5]'::jsonb)
          when 'charminar-lane-shop' then jsonb_set(elem, '{pos}', '[-51.7,201.2]'::jsonb)
          when 'charminar-lane-temple' then jsonb_set(elem, '{pos}', '[19.3,1.5]'::jsonb)
          when 'charminar-lane-bus' then jsonb_set(elem, '{pos}', '[-15.8,47.3]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'charminar-lane';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'fort-kochi-auto' then jsonb_set(elem, '{pos}', '[-18.5,28.6]'::jsonb)
          when 'fort-kochi-shop' then jsonb_set(elem, '{pos}', '[-108.4,36.7]'::jsonb)
          when 'fort-kochi-temple' then jsonb_set(elem, '{pos}', '[-119.8,117.6]'::jsonb)
          when 'fort-kochi-bus' then jsonb_set(elem, '{pos}', '[-45.9,56.9]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'fort-kochi';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'dadar-chowk-auto' then jsonb_set(elem, '{pos}', '[-238.3,17.2]'::jsonb)
          when 'dadar-chowk-shop' then jsonb_set(elem, '{pos}', '[-262,-49.4]'::jsonb)
          when 'dadar-chowk-temple' then jsonb_set(elem, '{pos}', '[-279.5,-47.6]'::jsonb)
          when 'dadar-chowk-bus' then jsonb_set(elem, '{pos}', '[-305.1,-75.6]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'dadar-chowk';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'manek-chowk-auto' then jsonb_set(elem, '{pos}', '[254.3,26.4]'::jsonb)
          when 'manek-chowk-shop' then jsonb_set(elem, '{pos}', '[151.5,23.2]'::jsonb)
          when 'manek-chowk-temple' then jsonb_set(elem, '{pos}', '[311.4,96.3]'::jsonb)
          when 'manek-chowk-bus' then jsonb_set(elem, '{pos}', '[94.7,19.6]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'manek-chowk';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'hall-bazaar-auto' then jsonb_set(elem, '{pos}', '[-26,293.3]'::jsonb)
          when 'hall-bazaar-shop' then jsonb_set(elem, '{pos}', '[-154.9,205.6]'::jsonb)
          when 'hall-bazaar-temple' then jsonb_set(elem, '{pos}', '[-86.3,241.5]'::jsonb)
          when 'hall-bazaar-bus' then jsonb_set(elem, '{pos}', '[-202.7,334.3]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'hall-bazaar';

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'lingaraj-lane-auto' then jsonb_set(elem, '{pos}', '[-53.3,65.8]'::jsonb)
          when 'lingaraj-lane-shop' then jsonb_set(elem, '{pos}', '[-39.6,132.7]'::jsonb)
          when 'lingaraj-lane-temple' then jsonb_set(elem, '{pos}', '[-155.9,192.7]'::jsonb)
          when 'lingaraj-lane-bus' then jsonb_set(elem, '{pos}', '[-91.7,34.9]'::jsonb)
          else elem
        end
        order by ord
      )
      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)
    ),
    true
  ),
  updated_at = now()
where id = 'lingaraj-lane';
