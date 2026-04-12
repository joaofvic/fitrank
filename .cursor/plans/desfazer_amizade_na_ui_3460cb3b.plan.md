---
name: Desfazer amizade na UI
overview: Expor a acao de desfazer amizade no perfil publico (PublicProfileView) e no drawer de amigos (FriendsListDrawer), reutilizando o removeFriend ja existente no useSocialData.
todos:
  - id: rpc-friendship-id
    content: Verificar se RPC get_user_public_profile retorna friendship_id; se nao, criar migration para incluir
    status: completed
  - id: public-profile-unfriend
    content: "Fase 1: Passar removeFriend ao PublicProfileView e atualizar FriendshipButton com dropdown de desfazer amizade"
    status: completed
  - id: drawer-unfriend
    content: "Fase 2: Adicionar menu de remocao ao FriendsListDrawer e wiring via ProfileView/App.jsx"
    status: pending
isProject: false
---

# Desfazer amizade -- PublicProfileView e FriendsListDrawer

## Estado atual

- `removeFriend(friendshipId)` ja existe em `useSocialData.js` (deleta a linha em `friendships` e recarrega a lista)
- `FriendsView` ja usa `removeFriend` via menu "..." por amigo -- funciona
- **PublicProfileView**: quando `status === 'accepted'`, mostra badge estatico "Amigos" sem acao
- **FriendsListDrawer**: lista amigos sem opcao de remover
- `App.jsx` passa `social.removeFriend` apenas para `FriendsView` (`onRemove`)

## Problema

O usuario precisa navegar ate a aba Amigos (FriendsView) para desfazer uma amizade. Nas duas telas onde a amizade e mais visivel (perfil publico e drawer de amigos), a acao nao esta disponivel.

---

## Fase 1: PublicProfileView -- Botao "Desfazer amizade"

### 1a. Passar `removeFriend` via [App.jsx](src/App.jsx)

No bloco `{view === 'public-profile' && ...}` (linha ~293), adicionar:

```jsx
onRemoveFriend={social.removeFriend}
```

### 1b. Receber e usar em [PublicProfileView.jsx](src/components/views/PublicProfileView.jsx)

- Adicionar prop `onRemoveFriend` na desestruturacao
- Buscar o `friendship_id` do RPC `get_user_public_profile` (verificar se ja retorna) ou do estado local. Caso o RPC nao retorne o `id`, buscar via query simples na tabela `friendships`
- Criar `handleRemoveFriend` que chama `onRemoveFriend(friendshipId)` e atualiza `localFriendshipStatus` para `null`

### 1c. Atualizar `FriendshipButton` (componente interno)

Quando `status === 'accepted'`, em vez do badge estatico, mostrar um botao com estado toggle:
- Visual padrao: badge "Amigos" com icone `UserCheck` (igual ao atual)
- Ao clicar: abre um mini-menu (dropdown) ou muda para botao "Desfazer amizade" com icone `UserMinus` em vermelho
- Confirmar acao: ao clicar em "Desfazer amizade", chamar `onRemove` e o status volta para `null` (botao "Adicionar amigo" reaparece)

Abordagem recomendada -- **dropdown simples** (mesmo padrao do menu "..." da FriendsTab):

```jsx
if (status === 'accepted') {
  return (
    <div className="relative">
      <button onClick={toggleMenu} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 transition-colors">
        <UserCheck className="w-5 h-5" />
        <span className="text-sm font-bold">Amigos</span>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeMenu} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1">
            <button onClick={onRemove} className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-zinc-700/50">
              Desfazer amizade
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

### 1d. Verificar/ajustar RPC `get_user_public_profile`

Preciso confirmar se o RPC retorna o `friendship_id` (campo `id` da tabela `friendships`). Se nao retornar, ha duas opcoes:
- Alterar o RPC para incluir `friendship_id` no retorno (migration SQL)
- Fazer uma query extra no frontend quando `status === 'accepted'` para buscar o `id`

A opcao mais limpa e alterar o RPC.

---

## Fase 2: FriendsListDrawer -- Menu de remocao

### 2a. Passar `onRemove` ao drawer via [ProfileView.jsx](src/components/views/ProfileView.jsx)

Adicionar prop `onRemoveFriend` na desestruturacao do ProfileView e repassar ao `FriendsListDrawer`:

```jsx
<FriendsListDrawer
  friends={friends}
  loading={friendsLoading}
  onClose={() => setFriendsDrawerOpen(false)}
  onOpenProfile={onOpenProfile}
  onRemove={onRemoveFriend}
/>
```

### 2b. Passar de [App.jsx](src/App.jsx) para ProfileView

No bloco `{view === 'profile' && ...}`, adicionar:

```jsx
onRemoveFriend={useCloud ? social.removeFriend : undefined}
```

### 2c. Atualizar [FriendsListDrawer.jsx](src/components/views/FriendsListDrawer.jsx)

Adicionar prop `onRemove` e implementar menu "..." por amigo (mesmo padrao visual da `FriendsTab` em `FriendsView.jsx`):

- Estado `menuOpen` para controlar qual amigo tem menu aberto
- Botao "..." (`MoreHorizontal`) ao lado direito de cada item
- Dropdown com opcao "Desfazer amizade" em vermelho
- Ao confirmar, chamar `onRemove(friend.id)` (o `id` e o id da linha em `friendships`, ja presente no array `friends`)

---

## Arquivos alterados

- [src/App.jsx](src/App.jsx) -- passar `removeFriend` ao ProfileView e PublicProfileView
- [src/components/views/ProfileView.jsx](src/components/views/ProfileView.jsx) -- receber e repassar `onRemoveFriend`
- [src/components/views/FriendsListDrawer.jsx](src/components/views/FriendsListDrawer.jsx) -- menu de remocao por amigo
- [src/components/views/PublicProfileView.jsx](src/components/views/PublicProfileView.jsx) -- FriendshipButton com dropdown de unfriend
- Possivelmente 1 migration SQL para incluir `friendship_id` no RPC `get_user_public_profile`
