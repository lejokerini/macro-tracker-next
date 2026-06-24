-- Macro Tracker Pro — schéma Supabase PostgreSQL
-- À exécuter dans Supabase SQL Editor quand tu veux brancher la base.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  sex text not null check (sex in ('homme','femme')),
  age int not null,
  height_cm numeric not null,
  weight_kg numeric not null,
  body_fat_pct numeric,
  activity numeric not null,
  goal text not null,
  diet text not null,
  weekly_budget numeric not null,
  store text not null,
  allergies text[] default '{}',
  disliked_foods text[] default '{}',
  liked_foods text[] default '{}',
  training_days int[] default '{}',
  max_prep_time int default 30,
  cooking_level text default 'normal',
  created_at timestamptz default now()
);

create table if not exists public.foods (
  id text primary key,
  name text not null,
  category text not null,
  state text,
  unit text,
  purchase_unit text,
  package_size numeric,
  usable_in_recipe boolean default true,
  diets text[] default '{}',
  allergens text[] default '{}',
  kcal_100 numeric,
  protein_100 numeric,
  carbs_100 numeric,
  fat_100 numeric,
  fiber_100 numeric,
  reliability text default 'estime'
);

create table if not exists public.supermarket_prices (
  id uuid primary key default gen_random_uuid(),
  food_id text references public.foods(id) on delete cascade,
  store text not null,
  price_per_kg numeric,
  package_price numeric,
  source text default 'manual_static',
  last_updated timestamptz default now(),
  unique(food_id, store)
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  meal_type text not null,
  servings int default 1,
  prep_time int default 20,
  difficulty text default 'facile',
  storage_days int default 1,
  tags text[] default '{}',
  diets text[] default '{}',
  instructions text[] default '{}',
  is_public boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade,
  food_id text references public.foods(id),
  quantity numeric not null
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  date date not null,
  meal_type text not null,
  food_id text references public.foods(id),
  recipe_id uuid references public.recipes(id),
  quantity numeric not null,
  created_at timestamptz default now()
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  food_id text references public.foods(id),
  quantity numeric not null,
  unit text default 'g',
  expires_at date,
  created_at timestamptz default now()
);

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  date date not null,
  weight_kg numeric not null,
  note text default 'Pesée à jeun',
  created_at timestamptz default now()
);

create table if not exists public.generated_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  start_date date not null,
  days_count int default 7,
  budget numeric,
  store text,
  quality_score int,
  created_at timestamptz default now()
);

create table if not exists public.program_meals (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.generated_programs(id) on delete cascade,
  date date not null,
  day_type text not null,
  meal_type text not null,
  recipe_id uuid references public.recipes(id)
);

alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.meal_logs enable row level security;
alter table public.pantry_items enable row level security;
alter table public.weight_logs enable row level security;
alter table public.generated_programs enable row level security;
alter table public.program_meals enable row level security;

create policy "profiles owner" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recipes owner or public" on public.recipes for select using (is_public or auth.uid() = user_id);
create policy "recipes owner write" on public.recipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meal logs owner" on public.meal_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pantry owner" on public.pantry_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weight owner" on public.weight_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "programs owner" on public.generated_programs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "program meals owner" on public.program_meals for all using (exists(select 1 from public.generated_programs gp where gp.id = program_id and gp.user_id = auth.uid())) with check (exists(select 1 from public.generated_programs gp where gp.id = program_id and gp.user_id = auth.uid()));

-- foods et supermarket_prices peuvent être publics en lecture.
alter table public.foods enable row level security;
alter table public.supermarket_prices enable row level security;
create policy "foods read" on public.foods for select using (true);
create policy "prices read" on public.supermarket_prices for select using (true);

-- V17 — sauvegarde cloud complète de l'application.
-- Cette table stocke l'état local de l'app en JSON pour chaque utilisateur.
create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

drop policy if exists "app states owner select" on public.app_states;
drop policy if exists "app states owner insert" on public.app_states;
drop policy if exists "app states owner update" on public.app_states;
drop policy if exists "app states owner delete" on public.app_states;

create policy "app states owner select" on public.app_states for select using (auth.uid() = user_id);
create policy "app states owner insert" on public.app_states for insert with check (auth.uid() = user_id);
create policy "app states owner update" on public.app_states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "app states owner delete" on public.app_states for delete using (auth.uid() = user_id);
