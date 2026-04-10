---
name: Refactor ProfileView UX
overview: "Refatorar a ProfileView para reduzir carga cognitiva: consolidar os 7 botoes admin em um Drawer (bottom sheet), reordenar a hierarquia visual, usar badges para status de check-ins, e reposicionar o botao de logout."
todos:
  - id: reorder-layout
    content: "Reordenar blocos: Cabecalho -> Stats -> Admin -> Historico -> PRO -> Sair"
    status: completed
  - id: admin-drawer
    content: Substituir 7 botoes admin por botao unico + Drawer bottom-sheet com grid 2 colunas
    status: completed
  - id: status-badges
    content: Transformar textos de status (pending/rejected) em badges estilizados
    status: completed
  - id: logout-reposition
    content: Mover botao Sair para o final da pagina com icone LogOut
    status: completed
isProject: false
---

# Refatoracao UX do ProfileView

## Diagnostico

A tela de perfil atual empilha 7 botoes administrativos entre o cabecalho e os cards de estatisticas, empurrando o conteudo relevante para o usuario (pontos, streak, historico) para baixo. O botao "Sair" fica misturado com os botoes admin. O status "Aguardando revisao" e texto simples sem destaque visual.

## Componente novo necessario

O projeto nao possui `Sheet`/`Drawer` do Shadcn. Sera necessario criar um componente leve de Drawer (bottom sheet) em `src/components/ui/Drawer.jsx` usando Radix `@radix-ui/react-dialog` (ja e dependencia do ecossistema Shadcn). Alternativa mais simples: implementar um drawer puro com Tailwind + estado local (sem nova dependencia), usando backdrop + translate-y para animacao.

**Decisao: Drawer puro com Tailwind** (sem instalar pacote novo, respeitando a regra de nao adicionar dependencias sem pedido explicito).

## Arquivo principal: [src/components/views/ProfileView.jsx](src/components/views/ProfileView.jsx)

### 1. Reordenar layout vertical

Nova ordem dos blocos no JSX:

1. **Notificacoes** (condicional, ja existe)
2. **Cabecalho do Perfil** (foto, nome, academia -- sem alteracao)
3. **Cards de Estatisticas** (Streak + Pontos) -- movidos para logo apos o cabecalho
4. **Botao unico "Painel do Administrador"** (condicional `isPlatformMaster`)
5. **Historico de Treinos**
6. **Banner PRO**
7. **Botao "Sair da conta"** -- movido para o final, com icone `LogOut`

### 2. Consolidar menu Admin em Drawer

- Adicionar estado `const [adminOpen, setAdminOpen] = useState(false)`
- Substituir os 7 `Button` admin por um unico botao:

```jsx
<Button variant="outline" onClick={() => setAdminOpen(true)}>
  <Settings className="w-4 h-4" />
  Painel do Administrador
</Button>
```

- Renderizar um Drawer (bottom sheet) quando `adminOpen === true`:
  - Backdrop escuro com `onClick` para fechar
  - Container branco/zinc que sobe do rodape com `translate-y` + `transition`
  - Grid 2 colunas com os 7 botoes admin como cards compactos, cada um com icone + label
  - Icones sugeridos: `Building2` (Tenants), `Trophy` (Desafios), `Users` (Usuarios), `Shield` (Moderacao), `SlidersHorizontal` (Config Moderacao), `BarChart3` (Engajamento), `ScrollText` (Auditoria)

Estrutura do Drawer inline (sem novo arquivo de componente):

```jsx
{adminOpen && (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAdminOpen(false)} />
    <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-6 animate-in slide-in-from-bottom">
      <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
      <h3>Painel do Administrador</h3>
      <div className="grid grid-cols-2 gap-3">
        {/* 7 botoes como cards compactos */}
      </div>
    </div>
  </div>
)}
```

### 3. Badge para status de revisao

Substituir o `<p className="text-[11px] text-yellow-300">Aguardando revisao da foto</p>` por um badge estilizado:

```jsx
<span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
  Aguardando revisao
</span>
```

Mesmo tratamento para o badge "Foto rejeitada" (vermelho):

```jsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
  Foto rejeitada
</span>
```

### 4. Botao Sair da conta

Mover para depois do Banner PRO, com icone `LogOut` do lucide:

```jsx
{onSignOut && (
  <Button variant="ghost" className="w-full py-2 text-sm text-zinc-500" onClick={onSignOut}>
    <LogOut className="w-4 h-4" />
    Sair da conta
  </Button>
)}
```

## Imports adicionais no ProfileView

Adicionar ao import de lucide-react: `Settings`, `LogOut`, `Building2`, `Trophy`, `Users`, `Shield`, `SlidersHorizontal`, `BarChart3`, `ScrollText`

## Nenhuma alteracao em outros arquivos

As props passadas pelo `App.jsx` permanecem identicas. Toda a refatoracao e interna ao `ProfileView.jsx`.
