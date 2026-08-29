-- SRDS v4.0 Module 4 (Reviews & Ratings, §15; BR-07). Purely additive.
-- BR-07: a buyer may only review their own completed order — enforced in the insert policy
-- below, not just in the client.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_one_per_order unique (order_id)
);

create index reviews_seller_id_idx on public.reviews (seller_id);
create index reviews_listing_id_idx on public.reviews (listing_id);

alter table public.reviews enable row level security;

create policy "reviews_select_all"
  on public.reviews for select
  using (true);

create policy "reviews_insert_buyer_completed_order"
  on public.reviews for insert
  with check (
    buyer_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.buyer_id = auth.uid() and o.status = 'completed'
    )
  );

create policy "reviews_admin_delete"
  on public.reviews for delete
  using (public.is_admin());

grant select, insert on public.reviews to authenticated;
grant select on public.reviews to anon;
grant delete on public.reviews to authenticated;
