-- Epic Desafios: expandir CHECK de target_type no audit log para incluir 'desafio'.

-- O trigger append-only bloqueia UPDATE/DELETE, mas o CHECK constraint precisa
-- ser recriado para aceitar o novo valor. ALTER constraint faz drop + add (transacional).

alter table public.platform_admin_audit_log
  drop constraint if exists platform_admin_audit_log_target_type_check;

alter table public.platform_admin_audit_log
  add constraint platform_admin_audit_log_target_type_check
  check (target_type in ('user', 'checkin', 'tenant', 'none', 'desafio'));
