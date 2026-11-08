-- À exécuter une seule fois : Supabase > SQL Editor > New query > coller > Run
create table if not exists public.cabines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cabines enable row level security;

-- Chaque utilisateur ne voit et ne modifie QUE sa propre ligne
create policy "lire ses donnees"      on public.cabines for select using (auth.uid() = user_id);
create policy "creer ses donnees"     on public.cabines for insert with check (auth.uid() = user_id);
create policy "modifier ses donnees"  on public.cabines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer ses donnees" on public.cabines for delete using (auth.uid() = user_id);
