create table if not exists public.auction_metadata (
  auction_id integer primary key,
  image_url text,
  source_type text check (source_type in ('upload','ai')),
  title text,
  description text,
  category text,
  prompt text,
  file_name text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auction_metadata enable row level security;

create policy "Auction metadata is readable by anyone"
  on public.auction_metadata
  for select
  using (true);

create policy "Anyone can insert auction metadata"
  on public.auction_metadata
  for insert
  with check (true);

create policy "Anyone can update auction metadata"
  on public.auction_metadata
  for update
  using (true)
  with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger auction_metadata_set_updated_at
before update on public.auction_metadata
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('auction-images', 'auction-images', true)
on conflict (id) do nothing;

create policy "Public read access to auction images"
  on storage.objects for select
  using (bucket_id = 'auction-images');

create policy "Anyone can upload auction images"
  on storage.objects for insert
  with check (bucket_id = 'auction-images');

create policy "Anyone can update auction images"
  on storage.objects for update
  using (bucket_id = 'auction-images');