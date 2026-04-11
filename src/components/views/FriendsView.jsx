import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Clock, Loader2, MoreHorizontal, Search, User, UserPlus, X
} from 'lucide-react';

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
  onAccept,
  onDecline,
  onRemove,
  onBack
}) {
  const [tab, setTab] = useState('friends');

  useEffect(() => {
    onLoadFriends?.();
    onLoadPendingRequests?.();
    onLoadSentRequests?.();
  }, [onLoadFriends, onLoadPendingRequests, onLoadSentRequests]);

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center gap-3 px-4 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1 text-white hover:text-zinc-400 transition-colors shrink-0"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-base font-semibold flex-1">Amigos</h2>
        <button type="button" className="p-1 text-white">
          <UserPlus size={22} onClick={() => setTab('search')} />
        </button>
      </div>

      <div className="flex border-b border-zinc-800" role="tablist">
        {TABS.map(({ id, label }) => {
          const badge =
            id === 'pending' && pendingRequests.length > 0
              ? pendingRequests.length
              : null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
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

      <div className="px-4 pt-4">
        {tab === 'search' && (
          <SearchTab onSearch={onSearch} onSendRequest={onSendRequest} sentRequests={sentRequests} />
        )}
        {tab === 'pending' && (
          <PendingTab requests={pendingRequests} onAccept={onAccept} onDecline={onDecline} />
        )}
        {tab === 'friends' && (
          <FriendsTab friends={friends} loading={friendsLoading} onRemove={onRemove} />
        )}
      </div>
    </div>
  );
}

function UserRow({ children, name, subtitle }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px] shrink-0">
        <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center">
          <User className="w-5 h-5 text-zinc-400" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white truncate">{name}</p>
        {subtitle && <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SearchTab({ onSearch, onSendRequest, sentRequests }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  const debounceRef = useRef(null);

  const sentIds = new Set(sentRequests.map((r) => r.addressee_id));

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
    setSendingTo(userId);
    try {
      await onSendRequest(userId);
      setResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, friendship_status: 'pending' } : u))
      );
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <div className="space-y-2">
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
            return (
              <UserRow key={u.id} name={u.display_name}>
                {alreadyFriend ? (
                  <span className="text-[12px] font-semibold text-zinc-500 px-3 py-1.5">
                    Amigos
                  </span>
                ) : alreadySent ? (
                  <span className="text-[12px] font-semibold text-zinc-500 bg-zinc-800 rounded-lg px-4 py-1.5">
                    Solicitado
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sendingTo === u.id}
                    onClick={() => handleSend(u.id)}
                    className="text-[12px] font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {sendingTo === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mx-2" />
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

function PendingTab({ requests, onAccept, onDecline }) {
  const [processingId, setProcessingId] = useState(null);

  const handleAction = async (id, action) => {
    setProcessingId(id);
    try {
      if (action === 'accept') await onAccept?.(id);
      else await onDecline?.(id);
    } finally {
      setProcessingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-[13px] text-zinc-500">Nenhuma solicitação pendente</p>
        <p className="text-[11px] text-zinc-600">Quando alguém te enviar uma solicitação, ela aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
        Solicitações de amizade
      </p>
      {requests.map((r) => (
        <UserRow key={r.id} name={r.display_name} subtitle="Quer ser seu amigo">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={processingId === r.id}
              onClick={() => handleAction(r.id, 'accept')}
              className="text-[12px] font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
            >
              {processingId === r.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mx-2" />
              ) : (
                'Confirmar'
              )}
            </button>
            <button
              type="button"
              disabled={processingId === r.id}
              onClick={() => handleAction(r.id, 'decline')}
              className="text-[12px] font-bold text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </UserRow>
      ))}
    </div>
  );
}

function FriendsTab({ friends, loading, onRemove }) {
  const [menuOpen, setMenuOpen] = useState(null);

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
        <UserRow key={f.id} name={f.display_name}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)}
              className="p-2 text-zinc-500 hover:text-white transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {menuOpen === f.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => handleRemove(f.id)}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-zinc-700/50 transition-colors"
                  >
                    Remover amigo
                  </button>
                </div>
              </>
            )}
          </div>
        </UserRow>
      ))}
    </div>
  );
}
