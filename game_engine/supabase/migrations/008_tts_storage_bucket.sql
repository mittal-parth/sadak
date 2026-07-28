-- Public-read TTS cache for static lesson NPC lines (writes via warm script + secret key only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tts',
  'tts',
  true,
  5242880,
  array['audio/wav', 'audio/x-wav', 'audio/wave']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No policies: public bucket allows anonymous read; writes use SUPABASE_SECRET_KEY in warm-tts-cache only.
