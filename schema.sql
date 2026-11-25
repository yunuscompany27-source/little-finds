-- Jalankan di Supabase: SQL Editor > New query > Run
create table products (
  id bigint generated always as identity primary key,
  name text not null,
  price int not null check (price >= 0),
  type text not null default 'Photocard',
  close_date date,
  created_at timestamptz default now()
);

create sequence order_seq start 1001;

create table orders (
  id bigint generated always as identity primary key,
  code text unique not null,
  name text not null,
  wa text not null,
  addr text not null,
  product_id bigint references products(id),
  item text not null,
  qty int not null check (qty > 0),
  total int not null,
  pay text not null,
  stage int not null default 0 check (stage between 0 and 4),
  created_at timestamptz default now()
);

create table admins (user_id uuid primary key references auth.users(id) on delete cascade);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid()) $$;

alter table products enable row level security;
alter table orders enable row level security;
alter table admins enable row level security;

create policy "produk dibaca semua orang" on products for select using (true);
create policy "admin kelola produk" on products for all using (is_admin()) with check (is_admin());
create policy "admin lihat pesanan" on orders for select using (is_admin());
create policy "admin ubah pesanan" on orders for update using (is_admin()) with check (is_admin());
create policy "admin cek diri sendiri" on admins for select using (user_id = auth.uid());

-- Pembeli membuat pesanan lewat fungsi ini; total dihitung di server, bukan dari browser.
create function create_order(p_product bigint, p_qty int, p_name text, p_wa text, p_addr text, p_pay text)
returns text language plpgsql security definer set search_path = public as $$
declare pr products; c text;
begin
  select * into pr from products where id = p_product;
  if pr.id is null then raise exception 'Produk tidak ditemukan'; end if;
  if p_qty < 1 then raise exception 'Jumlah tidak valid'; end if;
  c := 'GO-' || nextval('order_seq');
  insert into orders (code, name, wa, addr, product_id, item, qty, total, pay)
  values (c, p_name, p_wa, p_addr, pr.id, pr.name, p_qty, pr.price * p_qty, p_pay);
  return c;
end $$;

-- Pembeli cek status dengan kode; hanya data non-pribadi yang dikembalikan.
create function get_order(p_code text)
returns table (code text, item text, qty int, total int, pay text, stage int)
language sql stable security definer set search_path = public as
$$ select code, item, qty, total, pay, stage from orders where code = upper(p_code) $$;

grant execute on function create_order, get_order to anon, authenticated;

insert into products (name, price, type, close_date) values
 ('Photocard set A (5 pcs)', 65000, 'Photocard', '2026-12-20'),
 ('Album edisi standar', 285000, 'Album', '2026-12-15'),
 ('Poster A3 edisi terbatas', 55000, 'Poster', '2026-12-10'),
 ('Photobook 2027', 340000, 'Photobook', '2026-12-31');

-- Izin akses API (aman dijalankan walau opsi "Grant API access" di Supabase dicentang atau tidak).
-- Data tetap dilindungi aturan RLS di atas.
grant usage on schema public to anon, authenticated;
grant select on products to anon, authenticated;
grant insert, update, delete on products to authenticated;
grant select, update on orders to authenticated;
grant select on admins to authenticated;
