import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Clock, Loader2, MoreHorizontal, Search, User, UserPlus, X
} from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';

const TABS = [
  { id: 'friends', label: 'Amigos' },
  { id: 'pending', label: 'Solicitações' },
  { id: 'search', label: 'Descobrir' },
];

export function FriendsView({
  friends = [],
  friendsLoading = false,
  pendingRequests = [],
  sentRequests = [],
  onLoadFriends,
  onLoadPendingRequests,
  onLoadSentRequests,
  onSearch,
  onSendRequest,
  onCancelSentRequest,
  onAccept,
  onDecline,
  onRemove,
  onOpenProfile,
  onBack
}) {
  const [tab, setTab] = useState('friends');
  const tablistRef = useRef(null);

  useEffect(() => {
    onLoadFriends?.();
    onLoadPendingRequests?.();
    onLoadSentRequests?.();
  }, [onLoadFriends, onLoadPendingRequests, onLoadSentRequests]);

  const handleTabKeyDown = useCallback((e) => {
    const tabIds = TABS.map((t) => t.id);
    const currentIdx = tabIds.indexOf(tab);
    let nextIdx = -1;

    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % tabIds.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + tabIds.length) % tabIds.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = tabIds.length - 1;
    }

    if (nextIdx >= 0) {
      e.preventDefault();
      setTab(tabIds[nextIdx]);
      tablistRef.current?.querySelector(`[id="tab-${tabIds[nextIdx]}"]`)?.focus();
    }
  }, [tab]);

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center gap-3 px-4 pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="p-1 text-white hover:text-zinc-400 transition-colors shrink-0"
        >
          <ArrowLeft size={24} aria-hidden="true" />
        </button>
        <h2 className="text-base font-semibold flex-1">Amigos</h2>
        <button type="button" onClick={() => setTab('search')} aria-label="Buscar pessoas" className="p-1 text-white">
          <UserPlus size={22} aria-hidden="true" />
        </button>
      </div>

      <div ref={tablistRef} className="flex border-b border-zinc-800" role="tablist" onKeyDown={handleTabKeyDown}>
        {TABS.map(({ id, label }) => {
          const badge =
            id === 'pending' && pendingRequests.length + sentRequests.length > 0
              ? pendingRequests.length + sentRequests.length
              : null;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`tabpanel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 text-[13px] font-semibold transition-colors relative ${
                tab === id
                  ? 'text-white border-b-2 border-white'
                  : 'text-zinc-500'
              }`}
            >
              {label}
              {badge && (
                <span className="absolute top-2 ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`tabpanel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="px-4 pt-4"
      >
        {tab === 'search' && (
          <SearchTab
            onSearch={onSearch}
            onSendRequest={onSendRequest}
            onCancelSentRequest={onCancelSentRequest}
            sentRequests={sentRequests}
            onLoadSentRequests={onLoadSentRequests}
            onOpenProfile={onOpenProfile}
          />
        )}
        {tab === 'pending' && (
          <PendingTab
            requests={pendingRequests}
            sentRequests={sentRequests}
            onAccept={onAccept}
            onDecline={onDecline}
            onCancelSentRequest={onCancelSentRequest}
            onOpenProfile={onOpenProfile}
          />
        )}
        {tab === 'friends' && (
          <FriendsTab friends={friends} loading={friendsLoading} onRemove={onRemove} onOpenProfile={onOpenProfile} />
        )}
      </div>
    </div>
  );
}

function UserRow({ children, name, subtitle, avatarUrl, onClick }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`flex items-center gap-3 min-w-0 flex-1 text-left ${onClick ? 'cursor-pointer' : ''}`}
      >
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px] shrink-0">
          <UserAvatar src={avatarUrl} size="lg" className="w-full h-full bg-zinc-900" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate">{name}</p>
          {subtitle && <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>}
        </div>
      </button>
      {children}
    </div>
  );
}

function SearchTab({
  onSearch,
  onSendRequest,
  onCancelSentRequest,
  sentRequests,
  onLoadSentRequests,
  onOpenProfile
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  /** IDs de friendship recém-enviados nesta sessão (antes do parent atualizar sentRequests). */
  const [friendshipIdAfterSend, setFriendshipIdAfterSend] = useState({});
  const [cancelingTo, setCancelingTo] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const debounceRef = useRef(null);

  const sentIds = new Set(sentRequests.map((r) => r.addressee_id));

  const friendshipIdForUser = useCallback(
    (userId) =>
      sentRequests.find((r) => r.addressee_id === userId)?.id ?? friendshipIdAfterSend[userId],
    [sentRequests, friendshipIdAfterSend]
  );

  const doSearch = useCallback(
    async (q) => {
      if (!q.trim() || !onSearch) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const rows = await onSearch(q.trim());
        setResults(rows ?? []);
      } finally {
        setSearching(false);
      }
    },
    [onSearch]
  );

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 400);
  };

  const handleSend = async (userId) => {
    if (!onSendRequest) return;
    setCancelError(null);
    setSendingTo(userId);
    try {
      const res = await onSendRequest(userId);
      if (res?.ok) {
        setResults((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, friendship_status: 'pending' } : u))
        );
        if (res.friendshipId) {
          setFriendshipIdAfterSend((prev) => ({ ...prev, [userId]: res.friendshipId }));
        }
      }
    } finally {
      setSendingTo(null);
    }
  };

  const handleCancelOutgoing = async (userId) => {
    const fid = friendshipIdForUser(userId);
    if (!fid || !onCancelSentRequest) return;
    setCancelError(null);
    setCancelingTo(userId);
    try {
      const ok = await onCancelSentRequest(fid);
      if (ok) {
        setFriendshipIdAfterSend((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        setResults((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, friendship_status: null } : u
          )
        );
        onLoadSentRequests?.();
      } else {
        setCancelError(
          'Não cancelamos esse pedido. Talvez já tenha sido aceite — verifique Solicitações e Amigos, ou tente de novo.'
        );
      }
    } finally {
      setCancelingTo(null);
    }
  };

  return (
    <div className="space-y-2">
      {cancelError ? (
        <p className="text-[12px] text-amber-400/95 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2" role="alert">
          {cancelError}
        </p>
      ) : null}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Pesquisar"
          className="w-full bg-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none border-none focus:ring-1 focus:ring-zinc-600 transition-all"
        />
      </div>

      {searching ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : results.length === 0 && query.trim() ? (
        <p className="text-center text-[13px] text-zinc-600 py-10">Nenhum resultado encontrado.</p>
      ) : (
        <div>
          {results.map((u) => {
            const alreadySent = sentIds.has(u.id) || u.friendship_status === 'pending';
            const alreadyFriend = u.friendship_status === 'accepted';
            const canCancelOutgoing =
              alreadySent &&
              !alreadyFriend &&
              Boolean(onCancelSentRequest && friendshipIdForUser(u.id));
            const canceling = cancelingTo === u.id;
            return (
              <UserRow key={u.id} name={u.display_name} avatarUrl={u.avatar_url} onClick={onOpenProfile ? () => onOpenProfile(u.id) : undefined}>
                {alreadyFriend ? (
                  <span className="text-[12px] font-semibold text-zinc-500 px-3 py-1.5">
                    Amigos
                  </span>
                ) : canCancelOutgoing ? (
                  <button
                    type="button"
                    disabled={canceling}
                    aria-label={`Cancelar solicitação enviada para ${u.display_name}`}
                    aria-busy={canceling || undefined}
                    onClick={() => handleCancelOutgoing(u.id)}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/90"
                  >
                    {canceling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    Cancelar
                  </button>
                ) : alreadySent ? (
                  <span className="text-[12px] font-semibold text-zinc-500 bg-zinc-800 rounded-lg px-4 py-1.5">
                    Solicitado
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sendingTo === u.id}
                    onClick={() => handleSend(u.id)}
                    aria-busy={sendingTo === u.id || undefined}
                    className="text-[12px] font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/90"
                  >
                    {sendingTo === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mx-2" aria-hidden="true" />
                    ) : (
                      'Seguir'
                    )}
                  </button>
                )}
              </UserRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PendingTab({
  requests,
  sentRequests,
  onAccept,
  onDecline,
  onCancelSentRequest,
  onOpenProfile
}) {
  const [processingId, setProcessingId] = useState(null);
  const [cancelingSentId, setCancelingSentId] = useState(null);
  const [sentCancelError, setSentCancelError] = useState(null);

  const handleAction = async (id, action) => {
    setProcessingId(id);
    try {
      if (action === 'accept') await onAccept?.(id);
      else await onDecline?.(id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelSent = async (friendshipId) => {
    if (!onCancelSentRequest) return;
    setSentCancelError(null);
    setCancelingSentId(friendshipId);
    try {
      const ok = await onCancelSentRequest(friendshipId);
      if (!ok) {
        setSentCancelError(
          'Não cancelamos esse pedido. Talvez já tenha sido aceite — confira a lista ou tente de novo.'
        );
      }
    } finally {
      setCancelingSentId(null);
    }
  };

  if (requests.length === 0 && sentRequests.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-[13px] text-zinc-500">Nenhuma solicitação pendente</p>
        <p className="text-[11px] text-zinc-600">
          Quando alguém te enviar uma solicitação ou quando enviares uma, aparecerá aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sentCancelError ? (
        <p className="text-[12px] text-amber-400/95 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2" role="alert">
          {sentCancelError}
        </p>
      ) : null}
      {requests.length > 0 ? (
        <div>
          <p className="text-[12px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
            Solicitações de amizade
          </p>
          {requests.map((r) => (
            <UserRow key={r.id} name={r.display_name} avatarUrl={r.avatar_url} subtitle="Quer ser seu amigo" onClick={onOpenProfile ? () => onOpenProfile(r.user_id) : undefined}>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={processingId === r.id}
                  onClick={() => handleAction(r.id, 'accept')}
                  aria-busy={processingId === r.id || undefined}
                  className="text-[12px] font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/90"
                >
                  {processingId === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mx-2" aria-hidden="true" />
                  ) : (
                    'Confirmar'
                  )}
                </button>
                <button
                  type="button"
                  disabled={processingId === r.id}
                  onClick={() => handleAction(r.id, 'decline')}
                  aria-busy={processingId === r.id || undefined}
                  className="text-[12px] font-bold text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400/90"
                >
                  Excluir
                </button>
              </div>
            </UserRow>
          ))}
        </div>
      ) : (
        sentRequests.length > 0 ? (
          <p className="text-[11px] text-zinc-600 text-center pb-1">
            Nenhuma solicitação recebida neste momento.
          </p>
        ) : null
      )}

      {sentRequests.length > 0 ? (
        <div>
          <p className="text-[12px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
            Aguardando resposta
          </p>
          <p className="text-[11px] text-zinc-600 mb-3">
            Pedidos que enviaste e ainda não foram aceites.
          </p>
          {sentRequests.map((r) => {
            const canceling = cancelingSentId === r.id;
            return (
              <UserRow
                key={r.id}
                name={r.display_name}
                avatarUrl={r.avatar_url}
                subtitle="Solicitação enviada"
                onClick={onOpenProfile ? () => onOpenProfile(r.addressee_id) : undefined}
              >
                <button
                  type="button"
                  disabled={canceling || !onCancelSentRequest}
                  aria-label={`Cancelar solicitação enviada para ${r.display_name}`}
                  aria-busy={canceling || undefined}
                  onClick={() => handleCancelSent(r.id)}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/90"
                >
                  {canceling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  Cancelar solicitação
                </button>
              </UserRow>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FriendsTab({ friends, loading, onRemove, onOpenProfile }) {
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (menuOpen === null) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const handleRemove = async (id) => {
    setMenuOpen(null);
    await onRemove?.(id);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center mx-auto mb-3">
          <User className="w-8 h-8 text-zinc-700" />
        </div>
        <p className="text-[13px] text-zinc-400 font-semibold">Nenhum amigo ainda</p>
        <p className="text-[11px] text-zinc-600">Descubra pessoas na aba "Descobrir".</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
        {friends.length} {friends.length === 1 ? 'amigo' : 'amigos'}
      </p>
      {friends.map((f) => (
        <UserRow key={f.id} name={f.display_name} avatarUrl={f.avatar_url} onClick={onOpenProfile ? () => onOpenProfile(f.user_id) : undefined}>
          <div className="relative" ref={menuOpen === f.id ? menuRef : undefined}>
            <button
              type="button"
              onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)}
              aria-label={`Mais opções para ${f.display_name}`}
              aria-expanded={menuOpen === f.id}
              aria-haspopup="menu"
              className="p-2 text-zinc-500 hover:text-white transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            </button>
            {menuOpen === f.id && (
              <div role="menu" className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[140px]">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleRemove(f.id)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-zinc-700/50 transition-colors"
                >
                  Remover amigo
                </button>
              </div>
            )}
          </div>
        </UserRow>
      ))}
    </div>
  );
}
