-- SADAK: brighten Majestic Cross (Bengaluru) to a lively garden-city day view.
-- The TS source in lib/game/districts.ts was updated in #55 but Supabase still
-- held the old monsoon-grey theme from 002/006, which is what the game loads.

update public.districts
set
  district = jsonb_set(
    jsonb_set(
      district,
      '{theme}',
      '{"sky":["#1f8ad0","#43a8e4","#87ccf0","#ccebf9","#f0f8e8"],"fog":14215392,"fogNear":78,"ground":14208936,"pavement":14735552,"plaza":15261896,"tarmac":4869714,"lane":16118500,"buildings":[16513260,16766287,6280368,16744550,11069066,16315628,8308976],"canopies":[2074746,16752412,14826568],"leaf":5421128,"trunk":8020040,"sunColour":16775400,"sunIntensity":2.2,"ambient":0.3,"hemiSky":14742783,"hemiGround":12892304,"hemiIntensity":0.6,"archStyle":"modern","autos":8,"cars":9,"autoCanopy":15254808,"exposure":1.14,"landmark":"bengaluru"}'::jsonb
    ),
    '{blurb}',
    '"Bright bougainvillea, clear morning light, and a delivery scooter that never came back."'::jsonb
  ),
  updated_at = now()
where id = 'majestic-cross';
