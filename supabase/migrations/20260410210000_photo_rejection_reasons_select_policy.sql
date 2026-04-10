-- US-ADM-16: permite que qualquer autenticado leia o catálogo de motivos de rejeição.
-- Necessário para o ProfileView exibir labels dinâmicos a partir do DB.

drop policy if exists photo_rejection_reasons_select_authenticated on public.photo_rejection_reasons;
create policy photo_rejection_reasons_select_authenticated
  on public.photo_rejection_reasons
  for select
  to authenticated
  using (true);
