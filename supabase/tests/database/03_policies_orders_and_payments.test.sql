-- P6 (item 3): allowed and rejected paths for orders, order items, status history, payments and their transactions.
-- Users: B/B2 buyers, F seller of the fixture order, S suspended buyer, A admin (aal1 unless stated).
begin;
\ir ../helpers/rls_helpers.inc
select * from no_plan();
select tests.world();

do $$
declare
  ol uuid; lp uuid; inv uuid; ord uuid; k text;
begin
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge, status, created_at)
    values (tests.fx('B'), tests.fx('F'), 100, 20, 'pending', now() - interval '49 hours') returning id into ol;
  insert into tests.fixtures values ('OG_AGED', ol);
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge)
    values (tests.fx('S'), tests.fx('F'), 100, 0) returning id into ord;
  insert into tests.fixtures values ('OSUSP', ord);
  insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge, status)
    values (tests.fx('B'), tests.fx('F'), 100, 20, 'completed') returning id into ord;
  insert into tests.fixtures values ('OCOMP', ord);
  for k in select unnest(array['OP1', 'OP2', 'OP3', 'OP4', 'OP5']) loop
    insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge)
      values (tests.fx('B'), tests.fx('F'), 100, 20) returning id into ord;
    insert into tests.fixtures values (k, ord);
  end loop;
  -- a dealer listing linked to an IMS product holding 5 at D's default location (DS1), for the stock tests (B3: the
  -- legacy inventory row became a product, its stock a ledger movement)
  insert into public.inventory_products (dealer_id, sku, name, unit) values (tests.fx('D'), 'SKU-D', 'Dealer item', 'bag')
    returning id into inv;
  perform public.inventory_apply_movement(tests.fx('D'), inv, tests.fx('DS1'), 'in', 'RESTOCK', 5, null, tests.fx('D'));
  insert into public.listings (owner_id, title, price, quantity, status, seller_role, inventory_product_id)
    values (tests.fx('D'), 'Dealer item', 50, 10, 'active', 'dealer', inv) returning id into lp;
  insert into tests.fixtures values ('LD', lp), ('INVD', inv);
end $$;

do $$
declare disp uuid;
begin
  insert into public.orders (buyer_id, seller_id, product_subtotal, status)
    values (tests.fx('B'), tests.fx('F'), 10, 'disputed') returning id into disp;
  insert into tests.fixtures values ('O_DISPUTED', disp);
end $$;

-- orders -----------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.orders where id = ' || tests.l('O1'), 'rows:1', 'orders: the buyer reads their order');
select tests.expect(tests.fx('F'), 'select id from public.orders where id = ' || tests.l('O1'), 'rows:1', 'orders: the seller reads it');
select tests.expect(tests.fx('A'), 'select id from public.orders where id = ' || tests.l('O1'), 'rows:1', 'orders: an admin reads it');
select tests.expect(tests.fx('B2'), 'select id from public.orders where id = ' || tests.l('O1'), 'rows:0', 'orders: a stranger does not');
select tests.expect(null, 'select id from public.orders where id = ' || tests.l('O1'), 'err:42501', 'orders: anon has no access at all (no grant)');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, product_subtotal) values (' || tests.l('B') || ',' || tests.l('F') || ', 5)', 'n:1', 'orders: a buyer creates their own order');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, product_subtotal) values (' || tests.l('F2') || ',' || tests.l('F') || ', 5)', 'err:42501', 'orders: cannot create one as another buyer');
select tests.expect(tests.fx('S'), 'insert into public.orders (buyer_id, seller_id, product_subtotal) values (' || tests.l('S') || ',' || tests.l('F') || ', 5)', 'err:42501', 'orders: a suspended user cannot create one');
select tests.expect(tests.fx('B'), 'update public.orders set product_subtotal = 101 where id = ' || tests.l('O1'), 'err:42501', 'orders: the buyer cannot change the price of their order (BR-09)');
select tests.expect(tests.fx('F'), 'update public.orders set product_subtotal = 102 where id = ' || tests.l('O1'), 'err:42501', 'orders: nor can the seller');
select tests.expect(tests.fx('B2'), 'update public.orders set product_subtotal = 1 where id = ' || tests.l('O1'), 'n:0', 'orders: a stranger updates nothing');
-- A7 (20261023080000): an admin with a second factor now reaches an order before dispatch, to cancel it with a reason;
-- refunding it is still refused, by the guard (23514), and a password-only admin session does not reach it at all.
-- The cancellation itself is proven in 20261023080000_admin_moderation.test.sql.
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('O1'), 'n:0', 'orders: an admin cannot touch an order that is not disputed');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('O1'), 'err:23514', 'orders: an admin with a second factor reaches a pending order, but cannot refund it', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('OCOMP'), 'n:0', 'orders: an admin with a second factor does not reach a completed order that is not disputed', 'aal2');
-- A7: resolving a dispute is a second-factor admin write; a password-only admin session does not reach the order.
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('O_DISPUTED'), 'n:0', 'orders: an admin without a second factor cannot resolve a dispute');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'pending' where id = $$ || tests.l('O_DISPUTED'), 'err:23514', 'orders: an admin cannot move a dispute anywhere but refunded or completed', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('O_DISPUTED'), 'err:23514', 'orders: an admin settles a dispute only with a reason (A7)', 'aal2');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded', admin_action_reason = 'Refund agreed' where id = $$ || tests.l('O_DISPUTED'), 'n:1', 'orders: an admin with a second factor resolves a disputed order', 'aal2');
select tests.expect(tests.fx('B'), 'delete from public.orders where id = ' || tests.l('O1'), 'err:42501', 'orders: nobody deletes orders through the API');

-- order INSERT guard (guard_orders_insert, guard_order_items_insert, sync_order_subtotal) -------------------
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, status, product_subtotal) values (' || tests.l('B') || ',' || tests.l('F') || $$, 'completed', 0)$$, 'n:1', 'order insert: a status sent by the client is ignored, the order starts pending and unpriced');
select tests.expect(tests.fx('B'), 'select id from public.orders where buyer_id = ' || tests.l('B') || $$ and status = 'completed' and product_subtotal = 0$$, 'rows:0', 'order insert: so no completed, free order exists');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, product_subtotal) values (' || tests.l('B') || ',' || tests.l('B') || ', 1)', 'err:23514', 'order insert: cannot buy from yourself');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, product_subtotal) values (' || tests.l('B') || ',' || tests.l('B2') || ', 1)', 'err:23514', 'order insert: the seller must be someone who sells (a buyer is not)');
select tests.expect(tests.fx('B'), 'insert into public.orders (buyer_id, seller_id, delivery_charge) values (' || tests.l('B') || ',' || tests.l('F') || ', -5)', 'err:23514', 'order insert: the delivery charge cannot be negative');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP3') || ',' || tests.l('L1') || ', 3, 0)', 'n:1', 'order items: an item sent at price 0 is accepted...');
select tests.expect(tests.fx('B'), 'select id from public.order_items where order_id = ' || tests.l('OP3') || ' and unit_price = 100', 'rows:1', 'order items: ...but stored at the listing price');
select tests.expect(tests.fx('B'), 'select id from public.orders where id = ' || tests.l('OP3') || ' and product_subtotal = 300', 'rows:1', 'orders: and the subtotal is what the items add up to');
select tests.expect(tests.fx('S'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OSUSP') || ',' || tests.l('L1') || ', 1, 1)', 'err:42501', 'order items: a suspended buyer cannot add items even to their own order');
select tests.expect(tests.fx('S'), 'insert into public.payments (order_id, buyer_id, amount, method, provider) values (' || tests.l('OSUSP') || ',' || tests.l('S') || $$, 1, 'cod', 'manual')$$, 'err:42501', 'payments: a suspended buyer cannot open a payment on their own order');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP3') || ',' || tests.l('L2') || ', 1, 1)', 'err:23514', 'order items: an inactive listing cannot be bought');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP3') || ',' || tests.l('LD') || ', 1, 1)', 'err:23514', 'order items: nor a listing of a different seller');
select tests.expect(tests.fx('B2'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OP3') || ',' || tests.l('L1') || ', 1, 1)', 'err:42501', 'order items: a stranger cannot add to someone else''s order');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('OCOMP') || ',' || tests.l('L1') || ', 1, 1)', 'err:23514', 'order items: nothing is added to an order that is no longer pending');

-- stock leaves at dispatch, not at confirm (20261019080000_order_dispatch.sql, D5-D6) ------------------------------
do $$
declare o1 uuid; o2 uuid; o3 uuid;
begin
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('D'), 0) returning id into o1;
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('D'), 0) returning id into o2;
  insert into public.orders (buyer_id, seller_id, delivery_charge) values (tests.fx('B'), tests.fx('D'), 0) returning id into o3;
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o1, tests.fx('LD'), 3, 50);
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o2, tests.fx('LD'), 3, 50);
  insert into public.order_items (order_id, listing_id, quantity, unit_price) values (o3, tests.fx('LD'), 6, 50);
  insert into tests.fixtures values ('ODS1', o1), ('ODS2', o2), ('ODS3', o3);
end $$;
select tests.expect(tests.fx('D'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('ODS1'), 'n:1', 'stock: the dealer confirms an order for 3 of 5');
select tests.expect(tests.fx('D'), 'select 1 from public.inventory_stock where product_id = ' || tests.l('INVD') || ' and location_id = ' || tests.l('DS1') || ' and quantity = 5', 'rows:1', 'stock: confirming cut nothing (D5: a confirmed order can still be cancelled)');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('ODS2'), 'n:1', 'stock: a second order for 3 of the same 5 confirms too');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('ODS3'), 'err:P0001', 'stock: an order for 6 of 5 is refused at confirm');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'processing' where id in ($$ || tests.l('ODS1') || ',' || tests.l('ODS2') || ')', 'n:2', 'stock: both go to processing');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'ready' where id in ($$ || tests.l('ODS1') || ',' || tests.l('ODS2') || ')', 'n:2', 'stock: and to ready');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('ODS1'), 'n:1', 'stock: the dealer dispatches the first');
select tests.expect(tests.fx('D'), 'select 1 from public.inventory_stock where product_id = ' || tests.l('INVD') || ' and location_id = ' || tests.l('DS1') || ' and quantity = 2', 'rows:1', 'stock: dispatch cut it in the same statement (5 - 3)');
select tests.expect(tests.fx('D'), 'select id from public.inventory_movements where product_id = ' || tests.l('INVD') || ' and order_id = ' || tests.l('ODS1') || $$ and source = 'ZARAILINK_ORDER' and direction = 'out' and quantity = 3$$, 'rows:1', 'stock: and left one ZARAILINK_ORDER ledger row with the order id');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('ODS2'), 'err:P0001', 'stock: the second, for 3 of the 2 left, cannot be dispatched (D6)');
select tests.expect(tests.fx('D'), 'select id from public.orders where id = ' || tests.l('ODS2') || $$ and status = 'ready'$$, 'rows:1', 'stock: and stays ready');
select tests.expect(tests.fx('D'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('ODS1'), 'n:1', 'stock: setting dispatched again is a no-op update...');
select tests.expect(tests.fx('D'), 'select id from public.inventory_movements where product_id = ' || tests.l('INVD') || $$ and source = 'ZARAILINK_ORDER'$$, 'rows:1', 'stock: ...that cuts nothing more (SRDS §21)');

-- order guard (guard_orders_update): who may move which status, and that nothing else changes -------------------
do $$
declare
  o uuid;
  k text;
  s text;
begin
  for k, s in
    select * from (values
      ('OG_P1', 'pending'), ('OG_P2', 'pending'), ('OG_P3', 'pending'), ('OG_P4', 'pending'), ('OG_P5', 'pending'),
      ('OG_P6', 'pending'), ('OG_C1', 'confirmed'), ('OG_C2', 'confirmed'), ('OG_PR1', 'processing'),
      ('OG_PR2', 'processing'), ('OG_R1', 'ready'), ('OG_R2', 'ready'), ('OG_R3', 'ready'), ('OG_DI1', 'dispatched'),
      ('OG_DI2', 'dispatched'), ('OG_DI3', 'dispatched'), ('OG_CO1', 'completed'),
      ('OG_CO2', 'completed'), ('OG_D1', 'disputed'), ('OG_D2', 'disputed'), ('OG_D3', 'disputed')
    ) v
  loop
    insert into public.orders (buyer_id, seller_id, product_subtotal, delivery_charge, status)
      values (tests.fx('B'), tests.fx('F'), 100, 20, s::public.order_status) returning id into o;
    insert into tests.fixtures values (k, o);
  end loop;
end $$;

select tests.expect(tests.fx('B'), 'update public.orders set product_subtotal = 1 where id = ' || tests.l('OG_P1'), 'err:42501', 'order guard: a buyer cannot lower the price through the data API');
select tests.expect(tests.fx('B'), 'update public.orders set delivery_charge = 0 where id = ' || tests.l('OG_P1'), 'err:42501', 'order guard: nor the delivery charge (BR-09)');
select tests.expect(tests.fx('B'), 'update public.orders set seller_id = ' || tests.l('B') || ' where id = ' || tests.l('OG_P1'), 'err:42501', 'order guard: nor make themselves the seller');
select tests.expect(tests.fx('F'), 'update public.orders set buyer_id = ' || tests.l('F') || ' where id = ' || tests.l('OG_P1'), 'err:42501', 'order guard: nor can a seller change the buyer');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OG_P1'), 'err:42501', 'order guard: a buyer cannot confirm their own order');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OG_P1'), 'err:23514', 'order guard: nor skip to completed (no such move)');
select tests.expect(tests.fx('B2'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OG_P1'), 'n:0', 'order guard: a stranger changes nothing');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'confirmed' where id = $$ || tests.l('OG_P1'), 'n:1', 'order guard: the seller confirms');
select tests.expect(tests.fx('B'), 'select id from public.order_status_history where order_id = ' || tests.l('OG_P1'), 'rows:2', 'order history: the seller confirming wrote the history row by itself (plus the fixture pending row)');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'rejected' where id = $$ || tests.l('OG_P2'), 'n:1', 'order guard: the seller rejects a pending order');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'rejected' where id = $$ || tests.l('OG_P3'), 'err:42501', 'order guard: a buyer cannot reject');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OG_P4'), 'n:1', 'order guard: the buyer cancels');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OG_P5'), 'n:1', 'order guard: the seller cancels');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'expired' where id = $$ || tests.l('OG_P6'), 'err:23514', 'order guard: a fresh pending order cannot be expired');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'expired' where id = $$ || tests.l('OG_AGED'), 'n:1', 'order guard: a participant can trigger the lazy expiry once 48 hours have passed');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'processing' where id = $$ || tests.l('OG_C1'), 'n:1', 'order guard: the seller starts processing');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'processing' where id = $$ || tests.l('OG_C2'), 'err:42501', 'order guard: a buyer cannot');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'ready' where id = $$ || tests.l('OG_PR1'), 'n:1', 'order guard: the seller marks it ready');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'ready' where id = $$ || tests.l('OG_PR2'), 'err:42501', 'order guard: a buyer cannot');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OG_R1'), 'n:1', 'order guard: the seller dispatches it (D5)');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'dispatched' where id = $$ || tests.l('OG_R2'), 'err:42501', 'order guard: a buyer cannot dispatch');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OG_R3'), 'err:23514', 'order guard: a ready order cannot skip dispatch to completed');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OG_DI1'), 'n:1', 'order guard: the seller completes a dispatched order');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OG_DI2'), 'err:42501', 'order guard: a buyer cannot complete their own order');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'cancelled' where id = $$ || tests.l('OG_DI3'), 'err:23514', 'order guard: nothing dispatched can be cancelled (D5)');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'disputed' where id = $$ || tests.l('OG_CO1'), 'n:1', 'order guard: the buyer disputes a completed order');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'disputed' where id = $$ || tests.l('OG_CO2'), 'err:42501', 'order guard: the seller cannot dispute their own sale');
select tests.expect(tests.fx('B'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('OG_D1'), 'err:42501', 'order guard: a buyer cannot settle their own dispute');
select tests.expect(tests.fx('F'), $$update public.orders set status = 'completed' where id = $$ || tests.l('OG_D2'), 'err:42501', 'order guard: nor can the seller');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded' where id = $$ || tests.l('OG_D3'), 'n:0', 'order guard: an admin without a second factor does not settle it');
select tests.expect(tests.fx('A'), $$update public.orders set status = 'refunded', admin_action_reason = 'Refund agreed' where id = $$ || tests.l('OG_D3'), 'n:1', 'order guard: an admin with a second factor settles it', 'aal2');
select tests.expect(tests.fx('A'), 'update public.orders set product_subtotal = 1 where id = ' || tests.l('OG_D1'), 'err:42501', 'order guard: even an admin cannot change the price', 'aal2');


-- order items ------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.order_items where id = ' || tests.l('OI1'), 'rows:1', 'order_items: the buyer reads them');
select tests.expect(tests.fx('F'), 'select id from public.order_items where id = ' || tests.l('OI1'), 'rows:1', 'order_items: the seller reads them');
select tests.expect(tests.fx('A'), 'select id from public.order_items where id = ' || tests.l('OI1'), 'rows:1', 'order_items: an admin reads them');
select tests.expect(tests.fx('B2'), 'select id from public.order_items where id = ' || tests.l('OI1'), 'rows:0', 'order_items: a stranger does not');
select tests.expect(tests.fx('B'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('O1') || ',' || tests.l('L1') || ', 1, 10)', 'err:23514', 'order_items: nothing is added to an order once it has a payment');
select tests.expect(tests.fx('B2'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('O1') || ',' || tests.l('L1') || ', 1, 10)', 'err:42501', 'order_items: a stranger cannot');
select tests.expect(tests.fx('F'), 'insert into public.order_items (order_id, listing_id, quantity, unit_price) values (' || tests.l('O1') || ',' || tests.l('L1') || ', 1, 10)', 'err:42501', 'order_items: the seller cannot add items to a buyer order');

-- order status history ---------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.order_status_history where id = ' || tests.l('OSH1'), 'rows:1', 'order_status_history: the buyer reads it');
select tests.expect(tests.fx('F'), 'select id from public.order_status_history where id = ' || tests.l('OSH1'), 'rows:1', 'order_status_history: the seller reads it');
select tests.expect(tests.fx('A'), 'select id from public.order_status_history where id = ' || tests.l('OSH1'), 'rows:1', 'order_status_history: an admin reads it');
select tests.expect(tests.fx('B2'), 'select id from public.order_status_history where id = ' || tests.l('OSH1'), 'rows:0', 'order_status_history: a stranger does not');
select tests.expect(tests.fx('F'), 'insert into public.order_status_history (order_id, to_status, changed_by) values (' || tests.l('O1') || $$, 'confirmed', $$ || tests.l('F') || ')', 'err:42501', 'order_status_history: nobody writes it directly, not even the seller');
select tests.expect(tests.fx('B2'), 'insert into public.order_status_history (order_id, to_status, changed_by) values (' || tests.l('O1') || $$, 'confirmed', $$ || tests.l('B2') || ')', 'err:42501', 'order_status_history: a stranger cannot');

-- payments ---------------------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.payments where id = ' || tests.l('PAY1'), 'rows:1', 'payments: the buyer reads their payment');
select tests.expect(tests.fx('F'), 'select id from public.payments where id = ' || tests.l('PAY1'), 'rows:1', 'payments: the order seller reads it');
select tests.expect(tests.fx('A'), 'select id from public.payments where id = ' || tests.l('PAY1'), 'rows:1', 'payments: an admin reads it');
select tests.expect(tests.fx('B2'), 'select id from public.payments where id = ' || tests.l('PAY1'), 'rows:0', 'payments: a stranger does not');
select tests.expect(tests.fx('B'), 'insert into public.payments (order_id, buyer_id, amount, method, provider) values (' || tests.l('O1') || ',' || tests.l('B') || $$, 5, 'cod', 'manual')$$, 'err:23505', 'payments: an order that already has a payment cannot get a second');
select tests.expect(tests.fx('B'), 'insert into public.payments (order_id, buyer_id, amount, status, method, provider) values (' || tests.l('OP1') || ',' || tests.l('B') || $$, 1, 'successful', 'cod', 'manual')$$, 'n:1', 'payments: a buyer opens a payment for their own order');
select tests.expect(tests.fx('B'), 'select id from public.payments where order_id = ' || tests.l('OP1') || $$ and status = 'pending' and amount = 120$$, 'rows:1', 'payments: whatever was sent, it opens as pending for exactly the order total');
select tests.expect(tests.fx('B'), 'insert into public.payments (order_id, buyer_id, amount, method, provider) values (' || tests.l('OP2') || ',' || tests.l('B2') || $$, 5, 'cod', 'manual')$$, 'err:42501', 'payments: cannot record one as another buyer');
select tests.expect(tests.fx('B2'), 'insert into public.payments (order_id, buyer_id, amount, method, provider) values (' || tests.l('OP2') || ',' || tests.l('B2') || $$, 1, 'cod', 'manual')$$, 'err:42501', 'payments: nor pay for a stranger''s order');
select tests.expect(tests.fx('S'), 'insert into public.payments (order_id, buyer_id, amount, method, provider) values (' || tests.l('O1') || ',' || tests.l('S') || $$, 5, 'cod', 'manual')$$, 'err:42501', 'payments: a suspended user cannot');
select tests.expect(tests.fx('F'), $$update public.payments set status = 'processing' where id = $$ || tests.l('PAY1'), 'err:23514', 'payments: there is no such move (only successful or failed)');
select tests.expect(tests.fx('F'), $$update public.payments set status = 'successful' where id = $$ || tests.l('PAY1'), 'n:1', 'payments: the order seller decides an open payment');
select tests.expect(tests.fx('F'), $$update public.payments set status = 'pending' where id = $$ || tests.l('PAY1'), 'err:23514', 'payments: a decided payment cannot be re-opened');
select tests.expect(tests.fx('F'), $$update public.payments set status = 'failed' where id = $$ || tests.l('PAY1'), 'err:23514', 'payments: nor decided the other way');
select tests.expect(tests.fx('F'), 'select id from public.payment_transactions where payment_id = ' || tests.l('PAY1') || $$ and event_type = 'manual_confirmation'$$, 'rows:1', 'payment_transactions: the decision wrote its own event');
select tests.expect(tests.fx('A'), $$update public.payments set status = 'failed' where id = $$ || tests.l('PAY1'), 'n:0', 'payments: an admin has no payment action');
select tests.expect(tests.fx('B'), $$update public.payments set status = 'successful' where id = $$ || tests.l('PAY1'), 'n:0', 'payments: the buyer cannot mark their own payment paid');
select tests.expect(tests.fx('B2'), $$update public.payments set status = 'successful' where id = $$ || tests.l('PAY1'), 'n:0', 'payments: a stranger cannot');

-- payment transactions ---------------------------------------------------------------------------------
select tests.expect(tests.fx('B'), 'select id from public.payment_transactions where id = ' || tests.l('PTX1'), 'rows:1', 'payment_transactions: the buyer reads them');
select tests.expect(tests.fx('F'), 'select id from public.payment_transactions where id = ' || tests.l('PTX1'), 'rows:1', 'payment_transactions: the seller reads them');
select tests.expect(tests.fx('A'), 'select id from public.payment_transactions where id = ' || tests.l('PTX1'), 'rows:1', 'payment_transactions: an admin reads them');
select tests.expect(tests.fx('B2'), 'select id from public.payment_transactions where id = ' || tests.l('PTX1'), 'rows:0', 'payment_transactions: a stranger does not');
select tests.expect(tests.fx('F'), 'insert into public.payment_transactions (payment_id, event_type) values (' || tests.l('PAY1') || $$, 'manual_note')$$, 'err:42501', 'payment_transactions: nobody writes them directly, not even the seller');
select tests.expect(tests.fx('A'), 'insert into public.payment_transactions (payment_id, event_type) values (' || tests.l('PAY1') || $$, 'admin_note')$$, 'err:42501', 'payment_transactions: nor an admin');
select tests.expect(tests.fx('B'), 'insert into public.payment_transactions (payment_id, event_type) values (' || tests.l('PAY1') || $$, 'forged')$$, 'err:42501', 'payment_transactions: the buyer cannot');

select * from finish();
rollback;
