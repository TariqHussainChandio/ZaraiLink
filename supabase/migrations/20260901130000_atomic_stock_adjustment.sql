-- Business-logic fix (Phase 2): "today's check-then-act [stock decrement] is correct but not
-- lock-guaranteed against two buyers confirming near-simultaneously." Confirmed real: both
-- `dealer_service.adjust_stock` (manual dealer inventory ops) and
-- `orders_service._reduce_dealer_inventory_for_order` (order-confirm) did a classic
-- read-in-Python / compute-in-Python / write-in-Python sequence across TWO separate PostgREST
-- round-trips with no lock in between. Two concurrent callers against the same `inventory` row
-- each read the same starting `stock_quantity`, each independently compute a new value that
-- individually satisfies `stock_quantity >= 0`, and each write succeeds — net effect: more stock
-- gets sold than actually exists, with no error raised anywhere. The table's own
-- `check (stock_quantity >= 0)` constraint doesn't catch this, because neither individual write
-- ever produces a negative number by itself.
--
-- Fixed by moving the whole read-check-write sequence into the database as a single atomic
-- function per operation, using `select ... for update` to take a real row lock for the
-- duration of the transaction. PostgREST already wraps one RPC call in one transaction, so this
-- needs no client-side transaction handling. `security invoker` (not `security definer`) on
-- both — RLS on `inventory`/`inventory_transactions` must still gate who can touch what, exactly
-- as it does today for the direct-table-write path these replace.

-- Single-row atomic adjustment: replaces the fetch-then-compute-then-write dance in
-- `dealer_service.adjust_stock` (manual restock/sale/adjustment from the dealer's own inventory
-- screen). Mirrors that function's exact type semantics: adjustment/correction sets stock to
-- `p_quantity` directly; addition/restock adds it; anything else (reduction/sale) subtracts it.
create or replace function public.adjust_stock(
  p_inventory_id uuid,
  p_type text,
  p_quantity numeric,
  p_actor uuid,
  p_notes text
)
returns public.inventory
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current numeric;
  v_new numeric;
  v_row public.inventory;
begin
  select stock_quantity into v_current from public.inventory where id = p_inventory_id for update;
  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  if p_type in ('adjustment', 'correction') then
    v_new := p_quantity;
  elsif p_type in ('addition', 'restock') then
    v_new := v_current + p_quantity;
  else
    v_new := v_current - p_quantity;
  end if;

  if v_new < 0 then
    raise exception 'Stock quantity cannot go below zero' using errcode = 'P0001';
  end if;

  insert into public.inventory_transactions (inventory_id, type, quantity, actor, notes)
  values (p_inventory_id, p_type::public.inventory_transaction_type, v_new - v_current, p_actor, p_notes);

  update public.inventory set stock_quantity = v_new where id = p_inventory_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.adjust_stock(uuid, text, numeric, uuid, text) to authenticated;

-- Whole-order atomic reduction: replaces `orders_service._reduce_dealer_inventory_for_order`'s
-- Python-side check-every-item-then-reduce-every-item two-pass loop. The two passes are kept
-- (lock + validate everything first, only then apply), but both now run inside the one
-- transaction this function executes in, against rows already locked by the first pass — so
-- "check all items, then apply all items" is now actually atomic for the whole order, not just
-- individually-atomic-but-interleavable per item. Locks are acquired in `inventory.id` order
-- (not order_items insertion order) specifically to avoid a deadlock between two different
-- orders that happen to share two or more of the same dealer's listings.
create or replace function public.reduce_stock_for_order(p_order_id uuid, p_actor uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select i.id as inventory_id, i.stock_quantity, oi.quantity as needed
    from public.order_items oi
    join public.inventory i on i.listing_id = oi.listing_id
    where oi.order_id = p_order_id
    order by i.id
    for update of i
  loop
    if r.needed > r.stock_quantity then
      raise exception 'Not enough stock to confirm this order — needs % but only % in stock.', r.needed, r.stock_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select i.id as inventory_id, i.stock_quantity, oi.quantity as needed
    from public.order_items oi
    join public.inventory i on i.listing_id = oi.listing_id
    where oi.order_id = p_order_id
  loop
    insert into public.inventory_transactions (inventory_id, type, quantity, actor, notes)
    values (r.inventory_id, 'sale', -r.needed, p_actor, 'Order ' || p_order_id);

    update public.inventory set stock_quantity = r.stock_quantity - r.needed where id = r.inventory_id;
  end loop;
end;
$$;

grant execute on function public.reduce_stock_for_order(uuid, uuid) to authenticated;
