-- SADAK: space out street task positions (#19).
-- Run in Supabase SQL console after 001–003.
-- Patches only task_pack.tasks[].pos (offsets from chowk centre).

update public.districts
set
  task_pack = jsonb_set(
    task_pack,
    '{tasks}',
    (
      select jsonb_agg(
        case elem->>'id'
          when 'purani-sadak-auto' then jsonb_set(elem, '{pos}', '[28,-58]'::jsonb)
          when 'purani-sadak-shop' then jsonb_set(elem, '{pos}', '[-28,58]'::jsonb)
          when 'purani-sadak-temple' then jsonb_set(elem, '{pos}', '[58,28]'::jsonb)
          when 'purani-sadak-bus' then jsonb_set(elem, '{pos}', '[-58,-28]'::jsonb)
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
          when 'marina-nagar-auto' then jsonb_set(elem, '{pos}', '[26,-60]'::jsonb)
          when 'marina-nagar-shop' then jsonb_set(elem, '{pos}', '[-26,56]'::jsonb)
          when 'marina-nagar-temple' then jsonb_set(elem, '{pos}', '[60,26]'::jsonb)
          when 'marina-nagar-bus' then jsonb_set(elem, '{pos}', '[-56,-30]'::jsonb)
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
          when 'majestic-cross-auto' then jsonb_set(elem, '{pos}', '[30,-56]'::jsonb)
          when 'majestic-cross-shop' then jsonb_set(elem, '{pos}', '[-30,60]'::jsonb)
          when 'majestic-cross-temple' then jsonb_set(elem, '{pos}', '[56,30]'::jsonb)
          when 'majestic-cross-bus' then jsonb_set(elem, '{pos}', '[-60,-26]'::jsonb)
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
          when 'park-gully-auto' then jsonb_set(elem, '{pos}', '[27,-59]'::jsonb)
          when 'park-gully-shop' then jsonb_set(elem, '{pos}', '[-27,57]'::jsonb)
          when 'park-gully-temple' then jsonb_set(elem, '{pos}', '[59,27]'::jsonb)
          when 'park-gully-bus' then jsonb_set(elem, '{pos}', '[-57,-29]'::jsonb)
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
