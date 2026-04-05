# Testes manuais sugeridos — RLS multi-tenant

Execute no SQL Editor (Supabase) **como usuário autenticado** via cliente ou crie dois usuários A e B em tenants diferentes.

1. **Isolamento de `profiles`**
   - Usuário A (tenant `demo`) não deve conseguir `SELECT` em `profiles` de usuários cujo `tenant_id` seja de outro tenant.
   - No app: ranking deve listar apenas atletas do mesmo tenant.

2. **`checkins`**
   - Usuário não deve ter política de `INSERT` direto; apenas a RPC `fitrank_create_checkin` deve criar linhas.
   - Tentar segundo check-in no mesmo dia para o mesmo `tipo_treino` deve falhar.

3. **`tenants`**
   - Usuário comum só vê a linha do próprio `current_tenant_id()`.
   - Usuário em `platform_admins` vê todos os tenants (via política `is_platform_admin()`).

4. **Storage `checkin-photos`**
   - Upload só em `{tenant_id}/{user_id}/*`.
   - Outro usuário do mesmo tenant não deve ler pasta de outro `user_id` (políticas atuais: apenas o dono).

5. **Admin master (US-1.1.3)**
   - Listar/alterar tenants **somente** pela Edge Function `admin-tenants` com JWT de usuário que esteja em `platform_admins` (não expor `service_role` no browser).

Para promover o primeiro master após deploy:

```sql
INSERT INTO public.platform_admins (user_id)
VALUES ('UUID_DO_AUTH_USER');
```
