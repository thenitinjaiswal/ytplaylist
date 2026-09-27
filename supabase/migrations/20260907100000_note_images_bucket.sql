-- Create the note-images storage bucket (public so image URLs work without auth headers)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  5242880,  -- 5 MB limit per file (images are compressed client-side before upload)
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- RLS: authenticated users can upload to their own sub-folder (user_id/filename)
create policy "Users can upload their own note images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: anyone can read (bucket is public, but explicit policy is best practice)
create policy "Note images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'note-images');

-- RLS: users can delete only their own images
create policy "Users can delete their own note images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
