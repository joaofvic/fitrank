---
name: FeedPostCard Privacy UX
overview: "Refinar o FeedPostCard.jsx para seguir o modelo Instagram: remover completamente o botao de comentarios quando desativados e ocultar apenas a contagem de curtidas (mantendo o coracao funcional)."
todos:
  - id: fix-comments-icon
    content: Remover completamente o botao MessageCircle quando allow_comments === false (linhas 139-146)
    status: pending
  - id: fix-comments-footer
    content: Remover texto 'Comentarios desativados' e simplificar condicional do rodape (linhas 180-190)
    status: pending
isProject: false
---

# Refinamento UX de Privacidade no FeedPostCard

## Arquivo unico a alterar

[src/components/views/FeedPostCard.jsx](src/components/views/FeedPostCard.jsx)

---

## Regra 1: Comentarios Desativados (`allow_comments === false`)

### Problema atual (linhas 139-146)

O botao `MessageCircle` continua renderizado com `opacity-30` e `cursor-not-allowed`, e o rodape exibe "Comentarios desativados" (linha 181). No Instagram, o icone simplesmente desaparece.

### Alteracao

**Barra de icones (linhas 139-146)** -- remover o `<button>` do `MessageCircle` completamente quando `allow_comments === false`:

```jsx
{post.allow_comments !== false && (
  <button type="button" onClick={() => onOpenComments?.(post.id)} className="group p-1">
    <MessageCircle className="w-6 h-6 text-white group-hover:text-zinc-400 transition-colors" />
  </button>
)}
```

O container `flex items-center gap-4` cuida automaticamente do espacamento -- sem icone, sem gap residual.

**Rodape (linhas 180-190)** -- remover a mensagem "Comentarios desativados" e o link "Ver comentarios":

```jsx
{post.allow_comments !== false && (post.comments_count ?? 0) > 0 && (
  <button
    type="button"
    onClick={() => onOpenComments?.(post.id)}
    className="text-[13px] text-zinc-500 hover:text-zinc-400 transition-colors"
  >
    Ver {post.comments_count > 1 ? `todos os ${post.comments_count} comentarios` : '1 comentario'}
  </button>
)}
```

---

## Regra 2: Curtidas Ocultas (`hide_likes_count === true`)

### Problema atual (linha 163)

A logica ja existe e esta quase correta:
```jsx
{(post.likes_count ?? 0) > 0 && !(post.hide_likes_count && currentUserId !== post.user_id) && (
```

Isso ja garante:
- Se `hide_likes_count = false` -- mostra normalmente
- Se `hide_likes_count = true` E viewer NAO e o dono -- oculta a contagem
- Se `hide_likes_count = true` E viewer E o dono -- mostra (porque `currentUserId !== post.user_id` e `false`)

**O coracao (linhas 130-138) permanece intocado** -- sempre visivel e funcional, independente de `hide_likes_count`.

Nenhuma alteracao necessaria nesta regra -- a implementacao atual ja esta correta no modelo Instagram.

---

## Limpeza de imports

Apos as alteracoes, o import `MessageCircleOff` pode ser removido se nao for mais usado em nenhum outro lugar do arquivo. Verificar se o menu "..." do dono (linha 73) ainda o utiliza -- se sim, manter.

Revisando: `MessageCircleOff` e usado na linha 73 dentro do menu dropdown do dono, entao deve ser **mantido**.

---

## Resumo das alteracoes

- **Linha 139-146**: Substituir botao desabilitado por renderizacao condicional completa (`{post.allow_comments !== false && ...}`)
- **Linhas 180-190**: Substituir ternario com "Comentarios desativados" por condicional simples que so renderiza o link quando comentarios estao ativos
- **Nenhuma alteracao** no icone do coracao ou na logica de curtidas (ja esta correto)
