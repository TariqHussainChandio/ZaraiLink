-- B2 verifier findings F1, F2 and F7 (dealer Inventory Management System, SRDS §17, §21, §24).
--
-- F1 (High): the API wrote a purchase's lines as separate PostgREST calls (select, delete, insert), so concurrent edits of
-- one draft each deleted the old lines and each inserted their own: eight edits left eight lines, and receive_purchase
-- then brought in 40 units instead of 5.
-- F2 (Medium): a receive racing a line edit could run between the edit's delete and its insert, leaving a received
-- purchase with no lines after the stock had moved in.
-- Fix: a purchase and its lines are written only by create_purchase and replace_purchase_items, which lock the purchase
-- row FOR UPDATE (the lock receive_purchase takes, so an edit and a receive serialise) and delete and insert in one
-- transaction. The client grants to write the lines (and to insert a purchase header) are revoked, and the policies that
-- served them dropped, so the racy path no longer exists for any client.
--
-- F7 (Low): the rule "a dealer always has one active default location" (dispatch takes stock from it, D8) lived only in
-- the API. Through PostgREST a dealer could unset or deactivate their default, and dispatch then logged "No default
-- location". Two triggers now hold it in the database, and set_default_location moves the default in one transaction
-- (the API's clear-then-set in two calls would leave a moment with no default, which the new check refuses).
--
-- The B2 re-verification added two Lows, fixed here before the migration was ever pushed: N2, concurrent default moves
-- collided instead of queueing (set_default_location now takes a per-dealer advisory lock); N3, the API's purchase-date
-- bounds and text length caps were not held in the database (a trigger, column checks and a 200-line cap, at the end).
--
-- The functions use the B1 conventions: inventory_caller() (an approved, unsuspended dealer, 42501), the B1 quantity
-- guards and messages (NaN, two decimals, below 10^10, 22023), P0002 for a purchase or location the caller does not
-- have, and the message the API already uses for another dealer's references (purchasing.NOT_YOURS, 42501).
-- search_path is pg_catalog then pg_temp (nothing from public is resolved implicitly; every object is schema-qualified),
-- which keeps the structure test's rule that a definer function lists pg_temp last.

-- ---------------------------------------------------------------------------------------------------------------------
-- Purchase lines: validated and written in one place
-- ---------------------------------------------------------------------------------------------------------------------

-- Internal (no client grant): validates every line of p_items and inserts it into p_purchase_id. The caller has already
-- checked who is asking and locked the purchase. Any refusal raises, so the whole calling transaction rolls back and the
-- draft keeps what it held.
create function public.inventory_write_purchase_lines(p_dealer_id uuid, p_purchase_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_line jsonb;
  v_product uuid;
  v_location uuid;
  v_active boolean;
  v_quantity numeric;
  v_cost numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The purchase lines must be a list' using errcode = '22023';
  end if;
  -- B2 re-verification N3: a bounded payload. 200 lines is far beyond a real delivery note.
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A purchase has at most 200 lines' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Each purchase line must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_line) k where k not in ('product_id', 'location_id', 'quantity', 'unit_cost')
    ) then
      raise exception 'A purchase line has only product_id, location_id, quantity and unit_cost' using errcode = '22023';
    end if;

    -- A malformed id or figure raises 22P02 from the cast, which the API already answers 422.
    v_product := (v_line ->> 'product_id')::uuid;
    v_location := (v_line ->> 'location_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_cost := (v_line ->> 'unit_cost')::numeric;

    if v_product is null or v_location is null then
      raise exception 'Each purchase line needs a product and a location' using errcode = '22023';
    end if;

    -- The same guards as the line CHECKs and inventory_apply_movement: NaN first (it sorts above every number and
    -- NaN = round(NaN, 2) is true), then at most two decimals (refused, never rounded), then what numeric(12, 2) stock
    -- can hold (which also refuses 'Infinity').
    if v_quantity is null or v_quantity = 'NaN'::numeric or v_quantity <= 0 then
      raise exception 'The quantity must be more than zero' using errcode = '22023';
    elsif v_quantity <> round(v_quantity, 2) then
      raise exception 'Use at most two decimals' using errcode = '22023';
    elsif v_quantity >= 10000000000 then
      raise exception 'The quantity is too large' using errcode = '22023';
    end if;
    if v_cost is not null then
      if v_cost = 'NaN'::numeric or v_cost < 0 then
        raise exception 'The unit cost must be zero or more' using errcode = '22023';
      elsif v_cost <> round(v_cost, 2) then
        raise exception 'Use at most two decimals' using errcode = '22023';
      elsif v_cost >= 10000000000 then
        raise exception 'The unit cost is too large' using errcode = '22023';
      end if;
    end if;

    if not exists (select 1 from public.inventory_products where id = v_product and dealer_id = p_dealer_id) then
      raise exception 'A purchase must use your own supplier, products and locations' using errcode = '42501';
    end if;
    -- FOR SHARE: the location cannot be deactivated between this check and the commit.
    select is_active into v_active from public.inventory_locations
     where id = v_location and dealer_id = p_dealer_id
       for share;
    if v_active is null then
      raise exception 'A purchase must use your own supplier, products and locations' using errcode = '42501';
    elsif not v_active then
      raise exception 'Every purchase line needs an active location' using errcode = '22023';
    end if;

    -- guard_inventory_references still runs on this insert (draft, same dealer), as a second line of defence.
    insert into public.inventory_purchase_items (purchase_id, dealer_id, product_id, location_id, quantity, unit_cost)
    values (p_purchase_id, p_dealer_id, v_product, v_location, v_quantity, v_cost);
  end loop;
end;
$$;
revoke execute on function public.inventory_write_purchase_lines(uuid, uuid, jsonb) from public, anon, authenticated;

-- B2 verifier F1/F2: a draft purchase and its lines in one transaction, so a refused line leaves no empty draft behind
-- (the API used to insert the header, then the lines, then delete the header again on a refusal). p_items is a JSON
-- array of {product_id, location_id, quantity, unit_cost}; null or [] makes an empty draft. A missing date is today.
create function public.create_purchase(
  p_supplier_id uuid default null, p_purchased_on date default null, p_reference text default null,
  p_notes text default null, p_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
  v_id uuid;
begin
  if p_supplier_id is not null
     and not exists (select 1 from public.inventory_suppliers where id = p_supplier_id and dealer_id = v_dealer) then
    raise exception 'A purchase must use your own supplier, products and locations' using errcode = '42501';
  end if;

  insert into public.inventory_purchases (dealer_id, supplier_id, reference, purchased_on, notes)
  values (v_dealer, p_supplier_id, p_reference, coalesce(p_purchased_on, current_date), p_notes)
  returning id into v_id;

  perform public.inventory_write_purchase_lines(v_dealer, v_id, coalesce(p_items, '[]'::jsonb));
  return v_id;
end;
$$;

-- B2 verifier F1/F2: replaces every line of a draft, and optionally edits its header, in one transaction. The purchase
-- row is locked FOR UPDATE first, the same lock receive_purchase takes: two concurrent edits run one after the other (the
-- last one's lines win, never both), and an edit and a receive cannot interleave (whichever comes second sees the other's
-- result: the edit finds the purchase received and is refused, or the receive brings in the edited lines).
--
-- p_items: the complete new list of lines ([] empties the draft; null is refused, so a caller cannot wipe the lines by
-- omission). p_header: null for no header change, or an object with any of supplier_id, purchased_on, reference, notes;
-- a key that is present sets the column (null clears supplier_id, reference or notes; the date cannot be cleared).
create function public.replace_purchase_items(p_purchase_id uuid, p_items jsonb, p_header jsonb default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
  v_status text;
  v_supplier uuid;
  v_unknown text;
begin
  select status into v_status from public.inventory_purchases
   where id = p_purchase_id and dealer_id = v_dealer
     for update;
  if v_status is null then
    raise exception 'Purchase not found' using errcode = 'P0002';
  elsif v_status <> 'draft' then
    raise exception 'This purchase is already %', v_status using errcode = '22023';
  end if;

  if p_header is not null then
    if jsonb_typeof(p_header) <> 'object' then
      raise exception 'The purchase fields must be an object' using errcode = '22023';
    end if;
    select k into v_unknown from jsonb_object_keys(p_header) k
     where k not in ('supplier_id', 'purchased_on', 'reference', 'notes')
     limit 1;
    if v_unknown is not null then
      raise exception 'A purchase has no field %', v_unknown using errcode = '22023';
    end if;
    if p_header ? 'purchased_on' and p_header ->> 'purchased_on' is null then
      raise exception 'The purchase date cannot be empty' using errcode = '22023';
    end if;
    v_supplier := (p_header ->> 'supplier_id')::uuid;
    if v_supplier is not null
       and not exists (select 1 from public.inventory_suppliers where id = v_supplier and dealer_id = v_dealer) then
      raise exception 'A purchase must use your own supplier, products and locations' using errcode = '42501';
    end if;

    update public.inventory_purchases
       set supplier_id = case when p_header ? 'supplier_id' then v_supplier else supplier_id end,
           purchased_on = case when p_header ? 'purchased_on' then (p_header ->> 'purchased_on')::date else purchased_on end,
           reference = case when p_header ? 'reference' then p_header ->> 'reference' else reference end,
           notes = case when p_header ? 'notes' then p_header ->> 'notes' else notes end
     where id = p_purchase_id;
  end if;

  delete from public.inventory_purchase_items where purchase_id = p_purchase_id;
  perform public.inventory_write_purchase_lines(v_dealer, p_purchase_id, p_items);
end;
$$;

revoke execute on function public.create_purchase(uuid, date, text, text, jsonb) from public, anon;
revoke execute on function public.replace_purchase_items(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_purchase(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.replace_purchase_items(uuid, jsonb, jsonb) to authenticated;

comment on function public.create_purchase(uuid, date, text, text, jsonb) is
  'B2 verifier F1/F2: creates a draft purchase and its lines in one transaction (the only client path; direct inserts '
  'were revoked). Approved, unsuspended dealer only; every supplier, product and location must be theirs, every location '
  'active, every figure finite with at most two decimals.';
comment on function public.replace_purchase_items(uuid, jsonb, jsonb) is
  'B2 verifier F1/F2: replaces every line of a draft (and optionally its header) in one transaction, under the same '
  'FOR UPDATE lock as receive_purchase, so concurrent edits cannot duplicate lines and a receive cannot see a half-edited '
  'draft. The only client path to write purchase lines.';

-- The racy direct path is closed: lines are written only by the two functions above, and a purchase is created only by
-- create_purchase. Select stays (the API reads purchases with their lines), and so do header update (header-only edits
-- and cancel, one statement each, serialised with the functions by the row lock) and delete of a draft. The policies
-- that served the revoked privileges are dropped with them: a policy no grant can reach is untestable dead text.
revoke insert, update, delete on public.inventory_purchase_items from authenticated;
revoke insert on public.inventory_purchases from authenticated;
drop policy "inventory_purchase_items_insert_owner" on public.inventory_purchase_items;
drop policy "inventory_purchase_items_update_owner" on public.inventory_purchase_items;
drop policy "inventory_purchase_items_delete_owner" on public.inventory_purchase_items;
drop policy "inventory_purchases_insert_owner" on public.inventory_purchases;

-- ---------------------------------------------------------------------------------------------------------------------
-- F7: the default location stays active and present
-- ---------------------------------------------------------------------------------------------------------------------

-- Immediate: the default must be active (dispatch takes stock from it, D8). Checked only when is_default or is_active
-- changes, so a default carried over inactive by B1 (a dealer with nothing else) can still be renamed until it is
-- reactivated or replaced.
create function public.guard_inventory_default_location()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.is_default and not new.is_active then
    if tg_op = 'INSERT' then
      raise exception 'The default location must be active' using errcode = '23514';
    elsif old.is_default is distinct from new.is_default or old.is_active is distinct from new.is_active then
      raise exception 'The default location must be active' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_inventory_default_location() from public, anon, authenticated;

create trigger guard_inventory_default_location
  before insert or update of is_default, is_active on public.inventory_locations
  for each row execute function public.guard_inventory_default_location();

-- Deferred to commit: a dealer who has any location has a default. Deferred, not immediate, because moving the default
-- takes two statements (the one-default index allows no moment with two, so the old one is cleared first); within one
-- transaction (set_default_location) that is fine, while a client that only clears the default is refused at commit.
-- Deleting a dealer's last location, or the dealer (the cascade removes every location), leaves no location and passes.
-- Definer, so it sees every row of the dealer whatever the caller's row-level security.
create function public.check_inventory_default_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dealer uuid;
begin
  if tg_op = 'DELETE' then
    v_dealer := old.dealer_id;
  else
    v_dealer := new.dealer_id;
  end if;
  if exists (select 1 from public.inventory_locations where dealer_id = v_dealer)
     and not exists (select 1 from public.inventory_locations where dealer_id = v_dealer and is_default) then
    raise exception 'You need a default location: make another location the default first' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke execute on function public.check_inventory_default_location() from public, anon, authenticated;

create constraint trigger check_inventory_default_location
  after insert or update of is_default, dealer_id or delete on public.inventory_locations
  deferrable initially deferred
  for each row execute function public.check_inventory_default_location();

-- F7: moves the dealer's default to one of their active locations, in one transaction. Replaces the API's two calls
-- (clear the old default, then set the new one), which the deferred check above now refuses at the first commit.
-- Concurrent moves of one dealer's default queue on a per-dealer transaction advisory lock, taken before anything is
-- read (B2 re-verification N2). Locking the current default row was not enough: a waiter woke to find that row no
-- longer default, held no lock at all, and collided with the winner on the one-default index (23505). Each statement
-- after the lock takes a fresh snapshot (read committed), so a waiter sees the previous move's result.
create function public.set_default_location(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dealer uuid := public.inventory_caller();
  v_active boolean;
  v_default boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('inventory_default:' || v_dealer::text, 0));
  select is_active, is_default into v_active, v_default from public.inventory_locations
   where id = p_location_id and dealer_id = v_dealer
     for update;
  if v_active is null then
    raise exception 'Location not found' using errcode = 'P0002';
  elsif not v_active then
    raise exception 'The default location must be active' using errcode = '22023';
  elsif v_default then
    return;
  end if;

  update public.inventory_locations set is_default = false where dealer_id = v_dealer and is_default;
  update public.inventory_locations set is_default = true where id = p_location_id;
end;
$$;

revoke execute on function public.set_default_location(uuid) from public, anon;
grant execute on function public.set_default_location(uuid) to authenticated;

comment on function public.set_default_location(uuid) is
  'B2 verifier F7: makes one of the caller''s active locations the default (the one marketplace dispatch takes stock '
  'from, D8) in one transaction. Approved, unsuspended dealer only. The only way to move the default: clearing it '
  'directly is refused at commit by check_inventory_default_location.';

-- ---------------------------------------------------------------------------------------------------------------------
-- B2 re-verification N3: the API's date bounds and length caps, held in the database too
-- ---------------------------------------------------------------------------------------------------------------------

-- A purchase day is a real, plausible date: Postgres reads 'infinity', '-infinity', 'epoch' and '0001-01-01' as dates.
-- The static part (finite, not before 2000; the IMS starts in 2026) is a CHECK. The upper bound moves with the calendar,
-- so a CHECK cannot hold it (current_date is not immutable); this trigger does, for create_purchase,
-- replace_purchase_items and a direct header update alike. A year and a day ahead (the API allows today + 365 in UTC)
-- leaves room for the server's time zone. On an update only a changed date is checked, so an old row never becomes
-- uneditable. 22023, so the API's stock_errors keeps the message.
create function public.guard_inventory_purchase_day()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.purchased_on is not distinct from new.purchased_on then
      return new;
    end if;
  end if;
  if not isfinite(new.purchased_on) or new.purchased_on < date '2000-01-01'
     or new.purchased_on > current_date + 366 then
    raise exception 'A purchase date must be between 2000-01-01 and %', current_date + 366 using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_inventory_purchase_day() from public, anon, authenticated;

create trigger guard_inventory_purchase_day
  before insert or update of purchased_on on public.inventory_purchases
  for each row execute function public.guard_inventory_purchase_day();

-- Length caps, matching backend/app/inventory/schemas.py (NAME_MAX 120, UNIT_MAX 40, REFERENCE_MAX 80, CONTACT_MAX 120,
-- ADDRESS_MAX 300, TEXT_MAX 1000): a 3 MB name or note through PostgREST is refused here as it is by the API. Each check
-- is added NOT VALID and then validated, so a carried-over row that breaks one fails the migration loudly rather than
-- staying in place unnoticed (the B1 pattern). char_length counts characters, as Pydantic's max_length does.
alter table public.inventory_purchases
  add constraint inventory_purchases_purchased_on_check
    check (isfinite(purchased_on) and purchased_on >= date '2000-01-01') not valid,
  add constraint inventory_purchases_reference_length check (char_length(reference) <= 80) not valid,
  add constraint inventory_purchases_notes_length check (char_length(notes) <= 1000) not valid;
alter table public.inventory_purchases validate constraint inventory_purchases_purchased_on_check;
alter table public.inventory_purchases validate constraint inventory_purchases_reference_length;
alter table public.inventory_purchases validate constraint inventory_purchases_notes_length;

alter table public.inventory_locations
  add constraint inventory_locations_name_length check (char_length(name) <= 120) not valid,
  add constraint inventory_locations_address_length check (char_length(address) <= 300) not valid;
alter table public.inventory_locations validate constraint inventory_locations_name_length;
alter table public.inventory_locations validate constraint inventory_locations_address_length;

alter table public.inventory_suppliers
  add constraint inventory_suppliers_name_length check (char_length(name) <= 120) not valid,
  add constraint inventory_suppliers_contact_length check (char_length(contact) <= 120) not valid,
  add constraint inventory_suppliers_products_supplied_length check (char_length(products_supplied) <= 1000) not valid,
  add constraint inventory_suppliers_notes_length check (char_length(notes) <= 1000) not valid;
alter table public.inventory_suppliers validate constraint inventory_suppliers_name_length;
alter table public.inventory_suppliers validate constraint inventory_suppliers_contact_length;
alter table public.inventory_suppliers validate constraint inventory_suppliers_products_supplied_length;
alter table public.inventory_suppliers validate constraint inventory_suppliers_notes_length;

alter table public.inventory_products
  add constraint inventory_products_sku_length check (char_length(sku) <= 120) not valid,
  add constraint inventory_products_name_length check (char_length(name) <= 120) not valid,
  add constraint inventory_products_unit_length check (char_length(unit) <= 40) not valid;
alter table public.inventory_products validate constraint inventory_products_sku_length;
alter table public.inventory_products validate constraint inventory_products_name_length;
alter table public.inventory_products validate constraint inventory_products_unit_length;

-- The ledger's reason comes from record_movement / transfer_stock (the dealer's text) or a fixed system phrase.
alter table public.inventory_movements
  add constraint inventory_movements_reason_length check (char_length(reason) <= 1000) not valid;
alter table public.inventory_movements validate constraint inventory_movements_reason_length;
