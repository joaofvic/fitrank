-- Epic 6 Monetização: expandir CHECK de target_type para incluir 'plan' e 'subscription'.

alter table public.platform_admin_audit_log
  drop constraint if exists platform_admin_audit_log_target_type_check;

alter table public.platform_admin_audit_log
  add constraint platform_admin_audit_log_target_type_check
  check (target_type in ('user', 'checkin', 'tenant', 'none', 'desafio', 'plan', 'subscription'));
