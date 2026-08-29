-- Module 9 (Orders & Cart): checkout must re-validate stock for dealer-sourced items against
-- `inventory.stock_quantity` (Module 8), not just `listings.quantity` — but `inventory` RLS
-- (`inventory_select_owner_or_admin`) only lets the owning dealer read their own rows, so a
-- buyer's client can never see it directly. Widening that policy to "any authenticated user"
-- would leak `purchase_cost`/`selling_price`/`dealer_id` linkage to every buyer, which is a
-- real information-disclosure regression, not an acceptable tradeoff.
--
-- Fix: a narrow `security definer` RPC (same bypass pattern as `is_admin()`) that returns only
-- {listing_id, available} for whichever listings are asked about — nothing else from
-- `inventory` is ever exposed. Falls back to `listings.quantity` when no inventory row is
-- linked (farmer-sourced listings, or a dealer listing with no inventory tracking set up yet).

create or replace function public.available_stock(listing_ids uuid[])
returns table (listing_id uuid, available numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id as listing_id,
    coalesce(
      (select i.stock_quantity from public.inventory i where i.listing_id = l.id limit 1),
      l.quantity
    ) as available
  from public.listings l
  where l.id = any(listing_ids);
$$;

grant execute on function public.available_stock(uuid[]) to authenticated;
