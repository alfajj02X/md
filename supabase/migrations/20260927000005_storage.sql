-- Mechanic Dekho: storage buckets
-- kyc-docs is PRIVATE: only the owning provider and admins can read.
-- avatars: public read (profile pictures). review-media: authenticated read.

insert into storage.buckets (id, name, public) values
  ('kyc-docs', 'kyc-docs', false),
  ('avatars', 'avatars', true),
  ('review-media', 'review-media', false)
on conflict (id) do nothing;

-- KYC docs: owner + admin read; owner write to their own folder.
create policy kyc_docs_read on storage.objects
  for select using (
    bucket_id = 'kyc-docs' and (
      (storage.foldername(name))[1] = auth.uid()::text or is_admin()
    )
  );
create policy kyc_docs_write on storage.objects
  for insert with check (
    bucket_id = 'kyc-docs' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Avatars: public read, owner write.
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');
create policy avatars_write on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Review media: parties to the booking + admin. Path convention:
-- review-media/<booking_id>/<file>
create policy review_media_read on storage.objects
  for select using (
    bucket_id = 'review-media' and (
      exists (select 1 from bookings b
              where b.id::text = (storage.foldername(name))[1]
                and is_booking_party(b))
    )
  );
create policy review_media_write on storage.objects
  for insert with check (
    bucket_id = 'review-media' and (
      exists (select 1 from bookings b
              where b.id::text = (storage.foldername(name))[1]
                and b.customer_id = auth.uid())
    )
  );
