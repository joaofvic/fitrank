-- Adicionar valor de inscrição aos desafios (centavos, 0 = gratuito)

alter table public.desafios
  add column if not exists entry_fee integer not null default 0;

comment on column public.desafios.entry_fee is
  'Valor de inscrição em centavos (0 = gratuito). Ex: 1990 = R$ 19,90.';
