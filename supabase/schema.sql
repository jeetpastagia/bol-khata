-- Bol Khata database schema (Supabase / PostgreSQL)
-- Paste this whole file into Supabase -> SQL Editor -> Run.
-- Demo data is added automatically the first time the app loads.

create table if not exists shops (
  id           uuid primary key,
  name         text not null,
  upi_vpa      text not null default '',
  owner_phone  text not null default '',
  created_at   timestamptz default now()
);

create table if not exists suppliers (
  id       uuid primary key,
  shop_id  uuid not null references shops(id) on delete cascade,
  name     text not null,
  phone    text not null default ''
);

create table if not exists items (
  id           uuid primary key,
  shop_id      uuid not null references shops(id) on delete cascade,
  name         text not null,
  aliases      text[] not null default '{}',
  price_paise  int,
  unit         text,
  supplier_id  uuid references suppliers(id) on delete set null
);

create table if not exists customers (
  id                  uuid primary key,
  shop_id             uuid not null references shops(id) on delete cascade,
  name                text not null,
  aliases             text[] not null default '{}',
  phone               text,
  credit_limit_paise  int,
  view_token          uuid not null unique,      -- secret link for the customer's Pakka Hisaab page
  created_at          timestamptz not null default now()
);

-- Append-only ledger. Undo sets voided = true; rows are never deleted.
create table if not exists transactions (
  id            uuid primary key,                 -- made on the phone, so offline sync never duplicates
  shop_id       uuid not null references shops(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  type          text not null check (type in ('credit', 'payment')),
  amount_paise  int  not null check (amount_paise > 0),   -- ₹40 = 4000
  note          text,
  transcript    text,                             -- exact words spoken
  voided        boolean not null default false,
  disputed      boolean not null default false,   -- customer said "galat hai" on Pakka Hisaab page
  created_at    timestamptz not null default now()
);

create table if not exists order_items (
  id          uuid primary key,
  shop_id     uuid not null references shops(id) on delete cascade,
  item_id     uuid references items(id) on delete set null,
  item_name   text not null,
  qty         numeric not null check (qty > 0),
  unit        text,
  for_date    date not null,
  status      text not null default 'pending' check (status in ('pending', 'sent')),
  transcript  text,
  created_at  timestamptz not null default now()
);

create index if not exists transactions_customer_idx on transactions (customer_id, created_at);
create index if not exists transactions_shop_idx on transactions (shop_id, created_at);
create index if not exists order_items_shop_idx on order_items (shop_id, for_date);

-- Lock the tables: only the server (service role key) can read or write.
-- The browser never talks to the database directly.
alter table shops        enable row level security;
alter table suppliers    enable row level security;
alter table items        enable row level security;
alter table customers    enable row level security;
alter table transactions enable row level security;
alter table order_items  enable row level security;
