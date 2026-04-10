-- Epic Desafios: remover UNIQUE(tenant_id, mes_referencia) para permitir múltiplos desafios simultâneos.
-- Adicionar CHECK de coerência de datas.

-- 1) Drop da constraint que impede múltiplos desafios por tenant/mês
alter table public.desafios
  drop constraint if exists desafios_tenant_id_mes_referencia_key;

-- 2) CHECK: data_fim >= data_inicio (quando ambos preenchidos)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'desafios_date_range_check'
      and conrelid = 'public.desafios'::regclass
  ) then
    alter table public.desafios
      add constraint desafios_date_range_check
      check (data_fim is null or data_inicio is null or data_fim >= data_inicio);
  end if;
end;
$$;
