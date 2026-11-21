-- Jalankan sekali di Supabase SQL Editor untuk menambahkan identitas akun pada ulasan.
alter table public.reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists avatar_url text;

-- Review lama tetap aman; kolom baru boleh NULL untuk data lama.
