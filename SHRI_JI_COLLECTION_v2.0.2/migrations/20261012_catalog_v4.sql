-- =====================================================================
-- SHRI JI COLLECTION v4.0.0 — catalogue upgrade (ADDITIVE; safe to run more than once)
--   * categories managed from the admin panel (Thakur Ji Poshak first)
--   * product details: SKU, rich description, specifications, return policy, minimum order, pack size, cost price
--   * product variants (colour / size / material / design / pack) with their own price, stock and SKU
--   * delivery charge tiers calculated inside create_order
--   * stock is counted in single PIECES (a "Pack of 3" removes 3 pieces)
--   * email log + admin audit log tables
-- BEFORE YOU RUN: take a backup (Supabase → Database → Backups) or run on a staging project first.
-- Nothing here deletes products, orders, customers or stock. See DEPLOYMENT_CHECKLIST.md for rollback notes.
-- =====================================================================

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

-- ---------- 1. Categories ----------
create table if not exists public.categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  group_slug text not null check (group_slug in ('thakur-ji-poshak', 'ladies-wear')),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists "public can view active categories" on public.categories;
create policy "public can view active categories" on public.categories
  for select to anon, authenticated using (active = true);
revoke insert, update, delete, truncate on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;

insert into public.categories (slug, name, group_slug, sort_order, active) values
  ('laddu-gopal-poshak',          'Laddu Gopal Poshak',            'thakur-ji-poshak', 10, true),
  ('krishna-poshak',              'Krishna Poshak',                'thakur-ji-poshak', 20, true),
  ('devi-poshak',                 'Devi Poshak',                   'thakur-ji-poshak', 30, true),
  ('mukut',                       'Mukut',                         'thakur-ji-poshak', 40, true),
  ('mala-necklace',               'Mala and Necklace',             'thakur-ji-poshak', 50, true),
  ('bansuri',                     'Bansuri',                       'thakur-ji-poshak', 60, true),
  ('jhula',                       'Jhula',                         'thakur-ji-poshak', 70, true),
  ('singhasan',                   'Singhasan',                     'thakur-ji-poshak', 80, true),
  ('thakur-ji-shringar',          'Thakur Ji Shringar',            'thakur-ji-poshak', 90, true),
  ('other-thakur-ji-accessories', 'Other Thakur Ji Accessories',   'thakur-ji-poshak', 100, true),
  ('kurti',                       'Kurti',                         'ladies-wear', 110, true),
  ('suit',                        'Suit',                          'ladies-wear', 120, true),
  ('dupatta',                     'Dupatta',                       'ladies-wear', 130, true),
  ('plazo',                       'Plazo',                         'ladies-wear', 140, true),
  -- Old categories: kept (so old product records stay readable) but switched off for customers.
  ('mala',           'Mala',           'thakur-ji-poshak', 900, false),
  ('necklace',       'Necklace',       'thakur-ji-poshak', 901, false),
  ('fall-and-astar', 'Fall and Astar', 'ladies-wear',      902, false),
  ('maxi',           'Maxi',           'ladies-wear',      903, false),
  ('gown',           'Gown',           'ladies-wear',      904, false),
  ('dress-material', 'Dress Material', 'ladies-wear',      905, false)
on conflict (slug) do nothing;

-- One-time data step. Records what it touches so it can be undone (see rollback notes).
create table if not exists public.migration_backup_product_category (
  product_id bigint primary key,
  old_category text not null,
  recorded_at timestamptz not null default now()
);
alter table public.migration_backup_product_category enable row level security;
revoke all on public.migration_backup_product_category from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.schema_migrations where id = '20261012_catalog_v4') then
    insert into public.migration_backup_product_category (product_id, old_category)
      select id, category from public.products
      where category in ('mala', 'necklace', 'fall-and-astar', 'maxi', 'gown', 'dress-material')
      on conflict (product_id) do nothing;
    -- Mala and Necklace are now ONE category. Products are re-labelled, never deleted.
    update public.products set category = 'mala-necklace' where category in ('mala', 'necklace');
    insert into public.schema_migrations (id) values ('20261012_catalog_v4');
  end if;
end $$;

-- ---------- 2. Product fields ----------
alter table public.products
  add column if not exists sku text,
  add column if not exists subcategory text,
  add column if not exists brand text,
  add column if not exists short_description text,
  add column if not exists description_html text,
  add column if not exists specs jsonb not null default '[]'::jsonb,
  add column if not exists cost_price numeric(12,2),
  add column if not exists low_stock_threshold integer not null default 3,
  add column if not exists min_order_qty integer not null default 1,
  add column if not exists pack_size integer not null default 1,
  add column if not exists weight_g numeric(10,2),
  add column if not exists dimensions text,
  add column if not exists variant_axes text[] not null default '{}',
  add column if not exists archived boolean not null default false,
  add column if not exists return_eligible boolean,
  add column if not exists return_days integer,
  add column if not exists return_conditions text,
  add column if not exists return_instructions text,
  add column if not exists refund_policy text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_min_qty_chk') then
    alter table public.products add constraint products_min_qty_chk check (min_order_qty between 1 and 50) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_pack_size_chk') then
    alter table public.products add constraint products_pack_size_chk check (pack_size between 1 and 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_return_days_chk') then
    alter table public.products add constraint products_return_days_chk check (return_days is null or return_days between 1 and 365) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_cost_nonneg') then
    alter table public.products add constraint products_cost_nonneg check (cost_price is null or cost_price >= 0) not valid;
  end if;
end $$;
create unique index if not exists products_sku_key on public.products (lower(sku)) where sku is not null and sku <> '';
create index if not exists products_archived_idx on public.products (archived, active);

-- COST PRICE MUST NEVER BE PUBLIC. Customers (anon / logged-in) may read only the listed columns.
revoke select on public.products from anon, authenticated;
grant select (id, created_at, updated_at, name, slug, sku, category, subcategory, brand, price, sale_price,
              short_description, description, description_html, material, sizes, image_urls, stock, specs,
              min_order_qty, pack_size, weight_g, dimensions, variant_axes, active,
              return_eligible, return_days, return_conditions, return_instructions, refund_policy)
  on public.products to anon, authenticated;

-- ---------- 3. Variants ----------
create table if not exists public.product_variants (
  id bigint generated by default as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  sku text,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  options jsonb not null default '{}'::jsonb,
  price numeric(12,2) not null check (price > 0),
  sale_price numeric(12,2) check (sale_price is null or (sale_price > 0 and sale_price < price)),
  stock integer not null default 0 check (stock >= 0),
  pack_qty integer not null default 1 check (pack_qty between 1 and 1000),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants (product_id, sort_order);
create unique index if not exists product_variants_sku_key on public.product_variants (lower(sku)) where sku is not null and sku <> '';
alter table public.product_variants enable row level security;
drop policy if exists "public can view variants of active products" on public.product_variants;
create policy "public can view variants of active products" on public.product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active = true));
revoke all on public.product_variants from anon, authenticated;
grant select (id, product_id, sku, label, options, price, sale_price, stock, pack_qty, available, sort_order)
  on public.product_variants to anon, authenticated;

-- ---------- 4. Email log and admin audit log (server only) ----------
create table if not exists public.email_events (
  id bigint generated by default as identity primary key,
  event_key text not null unique,
  kind text not null,
  order_number text,
  recipient text,
  subject text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.email_events enable row level security;
revoke all on public.email_events from anon, authenticated;

create table if not exists public.admin_audit (
  id bigint generated by default as identity primary key,
  admin_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

-- ---------- 5. Order functions (server only) ----------
-- Items are {productId, variantId?, qty, size?}. Stock is counted in single pieces: qty x pack size.
-- Delivery charge is chosen from p_tiers = [{"min":0,"fee":50},{"min":499,"fee":40},{"min":1000,"fee":0}].
drop function if exists public.create_order(uuid, jsonb, jsonb, text, text, numeric, numeric);
create or replace function public.create_order(
  p_user uuid, p_customer jsonb, p_items jsonb, p_method text, p_key text, p_tiers jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.orders;
  v_need record;
  v_item jsonb;
  v_prod public.products;
  v_var public.product_variants;
  v_t jsonb;
  v_pid bigint; v_vid bigint; v_qty int; v_size text; v_pack int; v_pieces int; v_unit numeric;
  v_has_vars boolean;
  v_lines jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_ship numeric := 0;
  v_tiers jsonb := coalesce(p_tiers, '[{"min":0,"fee":50},{"min":499,"fee":40},{"min":1000,"fee":0}]'::jsonb);
  v_order public.orders; v_number text;
begin
  if p_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_method not in ('COD', 'ONLINE') then raise exception 'INVALID_METHOD'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'INVALID_ITEMS';
  end if;

  if p_key is not null then
    select * into v_existing from public.orders where user_id = p_user and idempotency_key = p_key;
    if found then return jsonb_build_object('existing', true, 'order', to_jsonb(v_existing)); end if;
  end if;

  -- Minimum order quantity is checked on the combined quantity of every line of the same product.
  for v_need in
    select (e->>'productId')::bigint as pid, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) as t(e) group by 1 order by 1
  loop
    select * into v_prod from public.products where id = v_need.pid;
    if not found then raise exception 'UNAVAILABLE'; end if;
    if v_need.qty < v_prod.min_order_qty then
      raise exception 'MIN_QTY:%:%', v_prod.name, v_prod.min_order_qty;
    end if;
  end loop;

  -- Rows are locked in a fixed order (product, then variant) so two simultaneous orders cannot deadlock.
  for v_item in
    select e from jsonb_array_elements(p_items) with ordinality as t(e, n)
    order by (e->>'productId')::bigint, coalesce(nullif(e->>'variantId', '')::bigint, 0), n
  loop
    v_var := null;
    v_pid := (v_item->>'productId')::bigint;
    v_vid := nullif(v_item->>'variantId', '')::bigint;
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'INVALID_ITEMS'; end if;

    select * into v_prod from public.products where id = v_pid for update;
    if not found or not v_prod.active or v_prod.archived
       or not exists (select 1 from public.categories c where c.slug = v_prod.category and c.active) then
      raise exception 'UNAVAILABLE';
    end if;

    select exists (select 1 from public.product_variants where product_id = v_pid) into v_has_vars;
    v_size := null;
    if v_has_vars then
      if v_vid is null then raise exception 'VARIANT_REQUIRED:%', v_prod.name; end if;
      select * into v_var from public.product_variants where id = v_vid and product_id = v_pid for update;
      if not found or not v_var.available then raise exception 'VARIANT_UNAVAILABLE:%', v_prod.name; end if;
      v_pack := v_var.pack_qty;
      v_pieces := v_qty * v_pack;
      if v_var.stock < v_pieces then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
      v_unit := case when v_var.sale_price is not null and v_var.sale_price > 0 and v_var.sale_price < v_var.price
                     then v_var.sale_price else v_var.price end;
      update public.product_variants set stock = stock - v_pieces, updated_at = now() where id = v_var.id;
    else
      v_vid := null;
      v_size := nullif(trim(coalesce(v_item->>'size', '')), '');
      if coalesce(array_length(v_prod.sizes, 1), 0) > 0 then
        if v_size is null or not (v_size = any (v_prod.sizes)) then raise exception 'SIZE_REQUIRED:%', v_prod.name; end if;
      else
        v_size := null;
      end if;
      v_pack := v_prod.pack_size;
      v_pieces := v_qty * v_pack;
      if v_prod.stock < v_pieces then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
      v_unit := case when v_prod.sale_price is not null and v_prod.sale_price > 0 and v_prod.sale_price < v_prod.price
                     then v_prod.sale_price else v_prod.price end;
      update public.products set stock = stock - v_pieces where id = v_prod.id;
    end if;

    v_sub := v_sub + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'variant_id', v_vid, 'name', v_prod.name, 'slug', v_prod.slug,
      'sku', coalesce(v_var.sku, v_prod.sku), 'variant_label', v_var.label, 'size', v_size,
      'qty', v_qty, 'pack_qty', v_pack, 'pieces', v_pieces, 'unit_price', v_unit, 'price', v_unit,
      'image', v_prod.image_urls[1], 'return_eligible', v_prod.return_eligible, 'return_days', v_prod.return_days);
  end loop;

  for v_t in select value from jsonb_array_elements(v_tiers) order by (value->>'min')::numeric loop
    if v_sub >= (v_t->>'min')::numeric then v_ship := (v_t->>'fee')::numeric; end if;
  end loop;

  v_number := 'SJC-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
              || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into public.orders(order_number, user_id, customer_name, phone, email, address, city, state, pincode,
                            payment_method, payment_status, order_status, items, subtotal, shipping, total,
                            idempotency_key)
  values (v_number, p_user, p_customer->>'name', p_customer->>'phone', nullif(p_customer->>'email', ''),
          p_customer->>'address', p_customer->>'city', p_customer->>'state', p_customer->>'pincode',
          p_method, 'pending', 'pending', v_lines, v_sub, v_ship, v_sub + v_ship, p_key)
  returning * into v_order;

  return jsonb_build_object('existing', false, 'order', to_jsonb(v_order));
end $$;

-- Gives reserved stock back exactly once (in pieces; old orders without "pieces" fall back to qty x pack).
create or replace function public.restore_order_stock(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_i jsonb; v_pieces int;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_o.stock_restored then return; end if;
  for v_i in select value from jsonb_array_elements(v_o.items) loop
    v_pieces := coalesce((v_i->>'pieces')::int,
                         coalesce((v_i->>'qty')::int, 0) * coalesce((v_i->>'pack_qty')::int, 1));
    if nullif(v_i->>'variant_id', '') is not null then
      update public.product_variants set stock = stock + v_pieces, updated_at = now()
      where id = (v_i->>'variant_id')::bigint;
    else
      update public.products set stock = stock + v_pieces where id = (v_i->>'product_id')::bigint;
    end if;
  end loop;
  update public.orders set stock_restored = true where id = p_order;
end $$;

revoke all on function public.create_order(uuid, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, jsonb, jsonb, text, text, jsonb) to service_role;
revoke all on function public.restore_order_stock(bigint) from public, anon, authenticated;
grant execute on function public.restore_order_stock(bigint) to service_role;

-- =====================================================================
-- ROLLBACK NOTES (run only if you must go back; code must be rolled back first)
--   * Categories: update public.products p set category = b.old_category
--       from public.migration_backup_product_category b where b.product_id = p.id;
--   * Old create_order: re-run the previous supabase.sql (it recreates the old 7-argument function).
--   * New columns/tables are harmless to older code and can stay.
--   * Column-level read grants on products: to restore full public read run
--       grant select on public.products to anon, authenticated;   (this would expose cost_price again!)
-- =====================================================================
