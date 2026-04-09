-- Photo moderation queue: status de revisão e metadados de decisão

-- Status:
-- - approved: foto aprovada (ou não requer revisão)
-- - pending: aguardando revisão (quando há foto)
-- - rejected: foto rejeitada
alter table public.checkins
  add column if not exists photo_review_status text not null default 'approved',
  add column if not exists photo_reviewed_at timestamptz,
  add column if not exists photo_reviewed_by uuid references auth.users (id),
  add column if not exists photo_rejection_reason_code text,
  add column if not exists photo_rejection_note text;

-- Garantir que check-ins com foto entrem como 'pending'
create or replace function public.checkins_set_photo_review_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.foto_url is not null and new.foto_url <> '' then
    new.photo_review_status := 'pending';
  else
    new.photo_review_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists checkins_set_photo_review_status_trg on public.checkins;
create trigger checkins_set_photo_review_status_trg
  before insert on public.checkins
  for each row
  execute function public.checkins_set_photo_review_status();

-- Índice para fila de moderação
create index if not exists checkins_photo_queue_idx
  on public.checkins (photo_review_status, created_at asc)
  where foto_url is not null;

