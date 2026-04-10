-- Epic Desafios: evolução do schema para suportar CRUD admin, tipos de treino e duração flexível.
-- Backward-compatible: mantém coluna 'ativo' sincronizada com 'status' via trigger.

-- 1) Novas colunas (defaults seguros para dados existentes)
alter table public.desafios
  add column if not exists descricao text not null default '',
  add column if not exists status text not null default 'ativo',
  add column if not exists tipo_treino text[] not null default '{}',
  add column if not exists data_inicio date,
  add column if not exists data_fim date,
  add column if not exists criado_por uuid references public.profiles (id) on delete set null,
  add column if not exists max_participantes integer,
  add column if not exists updated_at timestamptz not null default now();

-- CHECK no status (text, não enum — consistente com o projeto)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'desafios_status_check'
      and conrelid = 'public.desafios'::regclass
  ) then
    alter table public.desafios
      add constraint desafios_status_check
      check (status in ('rascunho', 'ativo', 'encerrado', 'cancelado'));
  end if;
end;
$$;

-- 2) Backfill: preencher data_inicio, data_fim e status a partir dos dados existentes
update public.desafios
set
  data_inicio = mes_referencia,
  data_fim    = (mes_referencia + interval '1 month' - interval '1 day')::date,
  status      = case when ativo then 'ativo' else 'encerrado' end
where data_inicio is null;

-- 3) Trigger de sincronia: status -> ativo (backward compat para ChallengesView.jsx)
create or replace function public.desafios_sync_ativo_from_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.ativo := (new.status = 'ativo');
  end if;

  if new.status is distinct from old.status
     or new.nome is distinct from old.nome
     or new.descricao is distinct from old.descricao
     or new.tipo_treino is distinct from old.tipo_treino
     or new.data_inicio is distinct from old.data_inicio
     or new.data_fim is distinct from old.data_fim
     or new.max_participantes is distinct from old.max_participantes then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists desafios_sync_ativo_trg on public.desafios;

create trigger desafios_sync_ativo_trg
  before update on public.desafios
  for each row
  execute function public.desafios_sync_ativo_from_status();

-- 4) Índices para queries comuns
create index if not exists desafios_status_idx
  on public.desafios (status);

create index if not exists desafios_date_range_idx
  on public.desafios (tenant_id, status, data_inicio, data_fim);
