# Smoke tests manuais — RLS multi-tenant (Fase 1)

Execute no SQL Editor (como postgres) ou via dois clientes autenticados (usuários A e B em tenants diferentes).

## Pré-requisitos

- Dois usuários em Auth: `user_a` no tenant `default`, `user_b` em outro tenant (crie um tenant e associe via signup com `tenant_slug` ou ajuste `profiles.tenant_id` com **service_role** só em ambiente de teste).
- Nenhum dos dois é `is_platform_master` para estes testes.

## Cenários

1. **Isolamento de `profiles`**  
   Como `user_a`, `select * from profiles` via PostgREST/client: deve retornar **apenas** a linha de A. Repetir como B: apenas B.

2. **Isolamento de `tenants`**  
   Como `user_a`, `select * from tenants`: deve retornar **só** o tenant de A. Não deve listar o tenant de B.

3. **Check-ins**  
   Como A, insira um check-in com `user_id = auth.uid()`, `tenant_id = current_tenant_id()`, data de hoje e `tipo_treino = 'Treino Geral'`.  
   Como B, tente `select` nos check-ins de A: **não** deve ver linhas de A.  
   Duplicar o mesmo dia + mesmo `tipo_treino` (normalizado) como A: deve falhar pela unique index.

4. **Escrita sensível em `profiles`**  
   Como A, tente `update profiles set pontos = 999 where id = auth.uid()`: deve falhar (trigger).  
   Idem `is_pro = true`, `streak`, `mp_payer_email`.

5. **Pagamentos**  
   Como A, sem service_role, tente `insert` em `pagamentos`: deve ser negado (sem política de insert).  
   `select` só nas próprias linhas (quando existirem).

6. **Admin master**  
   Usuário com `is_platform_master = true`: chamar Edge Function `admin-tenants` (GET) deve listar **todos** os tenants. Usuário comum deve receber 403.

## Observação

Promover master (uma vez, no SQL Editor):

```sql
update public.profiles set is_platform_master = true where id = '<uuid>';
```
