import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Button } from '../../ui/Button.jsx';

/**
 * @param {object} props
 * @param {unknown} props.supabase — cliente Supabase (RPC de busca)
 * @param {string | undefined} props.currentUserId
 * @param {(addresseeId: string) => Promise<{ ok: boolean, friendshipId?: string }>} props.sendFriendRequest
 * @param {(friendshipId: string) => Promise<boolean>} [props.cancelSentFriendRequest]
 * @param {Array<{ id: string, addressee_id: string, display_name?: string }>} [props.sentRequests]
 * @param {() => void | Promise<void>} [props.onLoadSentRequests]
 * @param {() => void | Promise<void>} props.onFinish
 */
export function FriendsStep({
  supabase,
  currentUserId,
  sendFriendRequest,
  cancelSentFriendRequest,
  sentRequests = [],
  onLoadSentRequests,
  onFinish,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  /** IDs de friendship recém-enviados (antes do pai atualizar `sentRequests`). */
  const [friendshipIdAfterSend, setFriendshipIdAfterSend] = useState({});
  const [sendingTo, setSendingTo] = useState(null);
  const [cancelingTo, setCancelingTo] = useState(null);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    onLoadSentRequests?.();
  }, [onLoadSentRequests]);

  const friendshipIdForUser = useCallback(
    (userId) =>
      sentRequests.find((r) => r.addressee_id === userId)?.id ?? friendshipIdAfterSend[userId],
    [sentRequests, friendshipIdAfterSend]
  );

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!supabase || !q || q.length < 2) return;
    setSearching(true);
    setCancelError(null);
    try {
      const { data } = await supabase.rpc('search_users_for_friendship', { p_query: q });
      const list = Array.isArray(data) ? data : [];
      setResults(
        list
          .filter((r) => r.user_id !== currentUserId)
          .map((r) => ({
            id: r.user_id,
            display_name: r.display_name,
            avatar_url: r.avatar_url ?? null,
            friendship_status: r.friendship_status,
          }))
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [supabase, query, currentUserId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const sendRequest = useCallback(
    async (addresseeId) => {
      if (!sendFriendRequest) return;
      setSendingTo(addresseeId);
      setCancelError(null);
      try {
        const res = await sendFriendRequest(addresseeId);
        if (res?.ok) {
          if (res.friendshipId) {
            setFriendshipIdAfterSend((prev) => ({ ...prev, [addresseeId]: res.friendshipId }));
          }
          setResults((prev) =>
            prev.map((u) =>
              u.id === addresseeId ? { ...u, friendship_status: 'pending' } : u
            )
          );
        }
      } finally {
        setSendingTo(null);
      }
    },
    [sendFriendRequest]
  );

  const handleCancelOutgoing = useCallback(
    async (userId) => {
      const fid = friendshipIdForUser(userId);
      if (!fid || !cancelSentFriendRequest) return;
      setCancelingTo(userId);
      setCancelError(null);
      try {
        const ok = await cancelSentFriendRequest(String(fid));
        if (ok) {
          setFriendshipIdAfterSend((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          setResults((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, friendship_status: null } : u))
          );
          await onLoadSentRequests?.();
        } else {
          setCancelError(
            'Não cancelamos esse pedido. Talvez já tenha sido aceite — atualize ou tente de novo.'
          );
        }
      } finally {
        setCancelingTo(null);
      }
    },
    [
      friendshipIdForUser,
      cancelSentFriendRequest,
      onLoadSentRequests,
    ]
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-white">Treine com amigos!</p>
        <p className="text-sm text-zinc-400">Encontre amigos que já usam o FitRank.</p>
      </div>

      {cancelError ? (
        <p
          className="text-[12px] text-amber-400/95 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2"
          role="alert"
        >
          {cancelError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por nome..."
            className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 pl-9 pr-3 text-sm outline-none focus:border-green-500/40"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleSearch}
          disabled={searching || query.trim().length < 2}
          className="h-10 px-4"
        >
          {searching ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : 'Buscar'}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {results.map((user) => {
            const isAccepted = user.friendship_status === 'accepted';
            const inOurSentList = sentRequests.some((r) => r.addressee_id === user.id);
            const fid = friendshipIdForUser(user.id);
            const isOutgoingPending =
              !isAccepted &&
              user.friendship_status === 'pending' &&
              (inOurSentList || Boolean(friendshipIdAfterSend[user.id]));
            const isIncomingPending =
              !isAccepted &&
              user.friendship_status === 'pending' &&
              !isOutgoingPending;
            const sending = sendingTo === user.id;
            const canceling = cancelingTo === user.id;
            const canCancelOutgoing =
              isOutgoingPending && Boolean(fid) && Boolean(cancelSentFriendRequest);

            let actionContent;
            if (isAccepted) {
              actionContent = (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-500 cursor-default">
                  <Check size={14} aria-hidden="true" />
                  Amigos
                </span>
              );
            } else if (canCancelOutgoing) {
              actionContent = (
                <button
                  type="button"
                  disabled={canceling}
                  onClick={() => handleCancelOutgoing(user.id)}
                  aria-label={`Cancelar solicitação enviada para ${user.display_name}`}
                  aria-busy={canceling || undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-700 text-white hover:bg-zinc-600 border border-zinc-600 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400/90"
                >
                  {canceling ? (
                    <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <X size={14} className="shrink-0" aria-hidden="true" />
                  )}
                  Cancelar
                </button>
              );
            } else if (isOutgoingPending && !fid) {
              actionContent = (
                <span
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-500"
                  role="status"
                  aria-busy="true"
                >
                  <Loader2 size={14} className="animate-spin shrink-0 text-zinc-500" aria-hidden="true" />
                  A sincronizar…
                </span>
              );
            } else if (isIncomingPending) {
              actionContent = (
                <span className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-zinc-500 bg-zinc-800/80 border border-zinc-700 max-w-[9rem] text-right leading-snug">
                  Pedido recebido — responda depois em Amigos › Solicitações.
                </span>
              );
            } else if (isOutgoingPending) {
              actionContent = (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-500 cursor-default">
                  <Check size={14} aria-hidden="true" />
                  Enviado
                </span>
              );
            } else {
              actionContent = (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => sendRequest(user.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400/90"
                  aria-label={`Adicionar ${user.display_name}`}
                  aria-busy={sending || undefined}
                >
                  {sending ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus size={14} aria-hidden="true" />
                  )}
                  {sending ? 'Enviando...' : 'Adicionar'}
                </button>
              );
            }

            return (
              <div
                key={user.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900/60 border border-zinc-800 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 shrink-0">
                      {(user.display_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-white truncate">{user.display_name}</p>
                </div>
                {actionContent}
              </div>
            );
          })}
        </div>
      )}

      {results.length === 0 && query.trim().length >= 2 && !searching && (
        <p className="text-xs text-zinc-500 text-center">Nenhum usuário encontrado.</p>
      )}

      <Button type="button" onClick={onFinish} className="w-full py-3.5 rounded-xl font-bold text-base">
        Finalizar
      </Button>
    </div>
  );
}
