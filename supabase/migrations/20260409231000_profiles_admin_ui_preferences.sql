-- Preferências de UI do admin (JSON namespaced no perfil; RLS: usuário atualiza só a própria linha)
alter table public.profiles
  add column if not exists admin_ui_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.admin_ui_preferences is
  'Preferências de UI admin (JSON). Chaves: engagement_csv_sections (objeto boolean por bloco CSV), etc.';
