-- SADAK: auto + shop on chowk plaza; temple + bus on 2nd-ring N/S roads (z = ±106 / ±53).
-- Offsets ±79.5 from chowk sit on tarmac, not in block interiors. Run in Supabase SQL console.

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'purani-sadak-auto' then jsonb_set(elem, '{pos}', '[20,-3]'::jsonb)
          when 'purani-sadak-shop' then jsonb_set(elem, '{pos}', '[-20,5]'::jsonb)
          when 'purani-sadak-temple' then jsonb_set(elem, '{pos}', '[8,79.5]'::jsonb)
          when 'purani-sadak-bus' then jsonb_set(elem, '{pos}', '[-6,-79.5]'::jsonb)
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
          when 'marina-nagar-auto' then jsonb_set(elem, '{pos}', '[18,-6]'::jsonb)
          when 'marina-nagar-shop' then jsonb_set(elem, '{pos}', '[-18,8]'::jsonb)
          when 'marina-nagar-temple' then jsonb_set(elem, '{pos}', '[10,79.5]'::jsonb)
          when 'marina-nagar-bus' then jsonb_set(elem, '{pos}', '[-8,-79.5]'::jsonb)
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
          when 'majestic-cross-auto' then jsonb_set(elem, '{pos}', '[22,-4]'::jsonb)
          when 'majestic-cross-shop' then jsonb_set(elem, '{pos}', '[-19,6]'::jsonb)
          when 'majestic-cross-temple' then jsonb_set(elem, '{pos}', '[5,79.5]'::jsonb)
          when 'majestic-cross-bus' then jsonb_set(elem, '{pos}', '[-4,-79.5]'::jsonb)
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
          when 'park-gully-auto' then jsonb_set(elem, '{pos}', '[19,-5]'::jsonb)
          when 'park-gully-shop' then jsonb_set(elem, '{pos}', '[-17,7]'::jsonb)
          when 'park-gully-temple' then jsonb_set(elem, '{pos}', '[7,79.5]'::jsonb)
          when 'park-gully-bus' then jsonb_set(elem, '{pos}', '[-5,-79.5]'::jsonb)
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
