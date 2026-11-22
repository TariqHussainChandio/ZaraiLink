-- Numeric NaN guards on the marketplace (found with the B1 verifier finding H1).
--
-- Postgres `numeric` accepts 'NaN', sorts it above every number and treats NaN = NaN as true. So `price >= 0`,
-- `quantity > 0` and every "needs more than is available" comparison accept NaN: a listing could be priced NaN, an order
-- line could ask for NaN units, and check_stock_on_confirm / apply_order_dispatch (`needed > available`) would then
-- compare NaN with a number. Excluding NaN at the column is enough for those triggers: once neither side can be NaN,
-- their comparisons are ordinary number comparisons, so the functions themselves need no change.
--
-- orders.total is generated from product_subtotal + delivery_charge, both guarded here. disease_predictions.confidence_score
-- already refuses NaN (its check has an upper bound, and NaN <= 1 is false). The inventory tables carry their own NaN
-- checks since B1 (20261021080000).
--
-- Each check is added NOT VALID (no table scan under the lock) and then validated, which fails loudly if a NaN row
-- already exists instead of leaving it in place unnoticed.

alter table public.listings
  add constraint listings_price_not_nan check (price <> 'NaN') not valid,
  add constraint listings_quantity_not_nan check (quantity <> 'NaN') not valid;
alter table public.listings validate constraint listings_price_not_nan;
alter table public.listings validate constraint listings_quantity_not_nan;

alter table public.order_items
  add constraint order_items_quantity_not_nan check (quantity <> 'NaN') not valid,
  add constraint order_items_unit_price_not_nan check (unit_price <> 'NaN') not valid;
alter table public.order_items validate constraint order_items_quantity_not_nan;
alter table public.order_items validate constraint order_items_unit_price_not_nan;

alter table public.orders
  add constraint orders_product_subtotal_not_nan check (product_subtotal <> 'NaN') not valid,
  add constraint orders_delivery_charge_not_nan check (delivery_charge <> 'NaN') not valid;
alter table public.orders validate constraint orders_product_subtotal_not_nan;
alter table public.orders validate constraint orders_delivery_charge_not_nan;

alter table public.payments
  add constraint payments_amount_not_nan check (amount <> 'NaN') not valid;
alter table public.payments validate constraint payments_amount_not_nan;

-- The dispatch outbox copies order_items.quantity; guarded too so apply_dispatch_event never receives NaN.
alter table public.order_events
  add constraint order_events_quantity_not_nan check (quantity <> 'NaN') not valid;
alter table public.order_events validate constraint order_events_quantity_not_nan;

-- Farm areas have no range check at all; NaN would break any area total in the farmer's views.
alter table public.farms
  add constraint farms_area_not_nan check (area <> 'NaN') not valid;
alter table public.farms validate constraint farms_area_not_nan;
alter table public.farm_crops
  add constraint farm_crops_area_not_nan check (area <> 'NaN') not valid;
alter table public.farm_crops validate constraint farm_crops_area_not_nan;
