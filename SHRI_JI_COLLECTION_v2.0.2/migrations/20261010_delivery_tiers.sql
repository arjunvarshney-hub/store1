-- SHRI JI COLLECTION: three-tier delivery pricing.
-- Safe additive migration: does not drop/recreate tables or alter existing order rows.
-- Run after backing up the database. The old 7-argument function is left in place;
-- application code calls the new 8-argument signature by its named parameters.
create or replace function public.create_order(
  p_user uuid, p_customer jsonb, p_items jsonb, p_method text, p_key text,
  p_shipping_under_499 numeric default 50, p_shipping_499_999 numeric default 40,
  p_free_above numeric default 1000
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.orders;
  v_need record;
  v_item jsonb;
  v_prod public.products;
  v_qty int; v_size text; v_unit numeric;
  v_lines jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_ship numeric := 0;
  v_order public.orders; v_number text;
begin
  if p_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_method not in ('COD','ONLINE') then raise exception 'INVALID_METHOD'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'INVALID_ITEMS';
  end if;

  if p_key is not null then
    select * into v_existing from public.orders where user_id = p_user and idempotency_key = p_key;
    if found then return jsonb_build_object('existing', true, 'order', to_jsonb(v_existing)); end if;
  end if;

  -- Lock each product row (ordered by id: no deadlocks) and check stock for the combined quantity.
  for v_need in
    select (e->>'productId')::bigint as pid, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) as t(e) group by 1 order by 1
  loop
    select * into v_prod from public.products where id = v_need.pid for update;
    if not found or not v_prod.active then raise exception 'UNAVAILABLE'; end if;
    if v_prod.stock < v_need.qty then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_prod from public.products where id = (v_item->>'productId')::bigint;
    v_qty  := (v_item->>'qty')::int;
    v_size := nullif(trim(coalesce(v_item->>'size','')), '');
    if v_qty is null or v_qty < 1 or v_qty > 10 then raise exception 'INVALID_ITEMS'; end if;

    if coalesce(array_length(v_prod.sizes, 1), 0) > 0 then
      if v_size is null or not (v_size = any (v_prod.sizes)) then
        raise exception 'SIZE_REQUIRED:%', v_prod.name;
      end if;
    else
      v_size := null;
    end if;

    v_unit := case when v_prod.sale_price is not null and v_prod.sale_price > 0 and v_prod.sale_price < v_prod.price
                   then v_prod.sale_price else v_prod.price end;
    v_sub := v_sub + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'slug', v_prod.slug, 'size', v_size,
      'qty', v_qty, 'unit_price', v_unit, 'image', v_prod.image_urls[1]);
    update public.products set stock = stock - v_qty where id = v_prod.id;
  end loop;

  -- Delivery is based on merchandise subtotal after sale prices, before shipping.
  -- Exact policy: < ₹499 = ₹50; ₹499–₹999.99 = ₹40; ₹1,000+ = free.
  v_ship := case
    when v_sub >= coalesce(p_free_above, 1000) then 0
    when v_sub >= 499 then coalesce(p_shipping_499_999, 40)
    else coalesce(p_shipping_under_499, 50)
  end;
  v_number := 'SJC-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
              || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into public.orders(order_number, user_id, customer_name, phone, email, address, city, state, pincode,
                            payment_method, payment_status, order_status, items, subtotal, shipping, total,
                            idempotency_key)
  values (v_number, p_user, p_customer->>'name', p_customer->>'phone', nullif(p_customer->>'email',''),
          p_customer->>'address', p_customer->>'city', p_customer->>'state', p_customer->>'pincode',
          p_method, 'pending', 'pending', v_lines, v_sub, v_ship, v_sub + v_ship, p_key)
  returning * into v_order;

  return jsonb_build_object('existing', false, 'order', to_jsonb(v_order));
end $$;
revoke all on function public.create_order(uuid, jsonb, jsonb, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_order(uuid, jsonb, jsonb, text, text, numeric, numeric, numeric) to service_role;
