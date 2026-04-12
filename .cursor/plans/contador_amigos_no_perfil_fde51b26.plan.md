---
name: Contador amigos no perfil
overview: Adicionar contador de amigos clicavel na aba Perfil e criar um FriendsListDrawer (bottom sheet) para exibir a lista completa de amigos, reutilizando os dados ja disponveis em useSocialData.
todos:
  - id: data-username
    content: "Fase 1: Incluir username em fetchProfileNames e loadFriends no useSocialData + passar friends/loadFriends ao ProfileView via App.jsx"
    status: completed
  - id: profile-counter
    content: "Fase 2: Adicionar card Amigos clicavel no grid de stats do ProfileView (grid-cols-2 sm:grid-cols-4)"
    status: completed
  - id: friends-drawer
    content: "Fase 3: Criar FriendsListDrawer.jsx seguindo padrao LikesDrawer e integrar no ProfileView"
    status: completed
isProject: false
---

# Contador de Amigos no Perfil + FriendsListDrawer

## Contexto existente

- **Tabela `friendships`** (bidirecional, `status = 'accepted'` = confirmada)
- **Hook `useSocialData`** ja possui `friends` (array), `friendsLoading`, `loadFriends`
- **Shape de `friends`**: `{ id, user_id, display_name, avatar_url, created_at }` -- falta `username`
- **`fetchProfileNames`** busca apenas `id, display_name, avatar_url` -- precisa incluir `username`
- **`App.jsx`** ja passa `onOpenFriends` ao `ProfileView`, mas a prop nao e usada (ignorada)
- **`ProfileView`** possui grid de 3 stats (Streak, Pontos, Treinos)
- **Padrao de drawer**: `LikesDrawer.jsx` (bottom sheet com backdrop + scroll + close)

---

## Fase 1: Dados -- Incluir `username` nos amigos

### 1a. `fetchProfileNames` em [src/hooks/useSocialData.js](src/hooks/useSocialData.js)

Alterar a query de profiles para incluir `username`:

```js
// ANTES
.select('id, display_name, avatar_url')

// DEPOIS
.select('id, display_name, avatar_url, username')
```

Atualizar o map retornado para incluir `username`:
```js
map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, username: p.username };
```

### 1b. `loadFriends` no mesmo hook

Adicionar `username` ao objeto retornado por cada amigo:
```js
return {
  id: f.id,
  user_id: friendId,
  display_name: names[friendId]?.display_name ?? 'Usuario',
  avatar_url: names[friendId]?.avatar_url ?? null,
  username: names[friendId]?.username ?? null,
  created_at: f.created_at
};
```

### 1c. Passar dados de amigos ao ProfileView em [src/App.jsx](src/App.jsx)

Dentro do bloco `{view === 'profile' && (...)}`, adicionar 3 props novas:

```jsx
friends={useCloud ? social.friends : []}
friendsLoading={useCloud ? social.friendsLoading : false}
onLoadFriends={useCloud ? social.loadFriends : undefined}
```

A prop `onOpenFriends` ja e passada (linha 251) mas nao sera usada para navegar a `FriendsView` -- sera usada para abrir o drawer interno.

---

## Fase 2: Interface do Perfil -- Contador de Amigos

### 2a. Novas props no [ProfileView.jsx](src/components/views/ProfileView.jsx)

Adicionar na desestruturacao:
```js
friends = [],
friendsLoading = false,
onLoadFriends,
```

### 2b. Carregar amigos ao montar

Adicionar `useEffect` que chama `onLoadFriends?.()` na montagem (similar ao padrao de `FriendsView`).

### 2c. Stats grid -- de 3 para 4 colunas

Transformar o grid de `grid-cols-3` para `grid-cols-2 sm:grid-cols-4` (2x2 no mobile, 4 colunas em telas maiores). Adicionar o 4o card:

```jsx
<button type="button" onClick={() => setFriendsDrawerOpen(true)} className="text-left">
  <Card className="flex flex-col items-center justify-center py-4 border-purple-500/20 hover:bg-zinc-800/50 transition-colors cursor-pointer">
    <Users className="w-6 h-6 text-purple-500 mb-1.5" />
    <span className="text-xl font-black tabular-nums">{friends.length}</span>
    <span className="text-[10px] text-zinc-500 uppercase">
      {friends.length === 1 ? 'Amigo' : 'Amigos'}
    </span>
  </Card>
</button>
```

### 2d. Estado para drawer

Adicionar `const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false)` e renderizar o `FriendsListDrawer` condicionalmente.

---

## Fase 3: FriendsListDrawer

### 3a. Criar [src/components/views/FriendsListDrawer.jsx](src/components/views/FriendsListDrawer.jsx)

Seguir exatamente o padrao do `LikesDrawer.jsx`:
- Props: `friends`, `loading`, `onClose`, `onOpenProfile`
- Backdrop clicavel com `animate-in-fade`
- Painel inferior `max-h-[70vh]` com `animate-in-slide-up`
- Handle pill + titulo "Amigos" + botao X
- Lista scrollavel com `.map()` sobre `friends`
- Card de cada amigo: avatar (com gradient ring), nome bold, @username em `text-zinc-500`
- Cada item clicavel (`onOpenProfile(user_id)`)
- Estado loading: `Loader2` spinner
- Estado vazio: icone `Users` + "Voce ainda nao adicionou nenhum amigo."

### 3b. Importar e renderizar no ProfileView

```jsx
import { FriendsListDrawer } from './FriendsListDrawer.jsx';

{friendsDrawerOpen && (
  <FriendsListDrawer
    friends={friends}
    loading={friendsLoading}
    onClose={() => setFriendsDrawerOpen(false)}
    onOpenProfile={onOpenProfile}
  />
)}
```

Nota: `onOpenProfile` precisa ser adicionada como prop no ProfileView (vinda de `App.jsx`, onde ja existe como `openPublicProfile`).

### 3c. Wire `onOpenProfile` no App.jsx

Adicionar ao bloco de `ProfileView`:
```jsx
onOpenProfile={useCloud ? openPublicProfile : undefined}
```
