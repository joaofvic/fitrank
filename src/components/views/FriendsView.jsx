import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Clock, Loader2, Search, Trash2, User, UserPlus, X
} from 'lucide-react';

const TABS = [
  { id: 'search', label: 'Buscar' },
  { id: 'pending', label: 'Solicitações' },
  { id: 'friends', label: 'Amigos' },
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
    <div className="space-y-5 animate-in-fade">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-black tracking-tight">Amigos</h2>
      </div>

      <div className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1" role="tablist">
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
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors relative ${
                tab === id
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'text-zinc-500 border border-transparent hover:text-zinc-300'
              }`}
            >
              {label}
              {badge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Buscar por nome..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-green-500/50 transition-colors"
        />
      </div>

      {searching ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
        </div>
      ) : results.length === 0 && query.trim() ? (
        <p className="text-center text-sm text-zinc-600 py-8">Nenhum usuário encontrado.</p>
      ) : (
        <div className="space-y-2">
          {results.map((u) => {
            const alreadySent = sentIds.has(u.id) || u.friendship_status === 'pending';
            const alreadyFriend = u.friendship_status === 'accepted';
            return (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                  <span className="text-sm font-bold text-white truncate">{u.display_name}</span>
                </div>
                {alreadyFriend ? (
                  <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> Amigos
                  </span>
                ) : alreadySent ? (
                  <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Enviado
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sendingTo === u.id}
                    onClick={() => handleSend(u.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                  >
                    {sendingTo === u.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserPlus className="w-3 h-3" />
                    )}
                    Adicionar
                  </button>
                )}
              </div>
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
      <p className="text-center text-sm text-zinc-600 py-8">Nenhuma solicitação pendente.</p>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-zinc-400" />
            </div>
            <span className="text-sm font-bold text-white truncate">{r.display_name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={processingId === r.id}
              onClick={() => handleAction(r.id, 'accept')}
              className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              {processingId === r.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              disabled={processingId === r.id}
              onClick={() => handleAction(r.id, 'decline')}
              className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FriendsTab({ friends, loading, onRemove }) {
  const [removingId, setRemovingId] = useState(null);

  const handleRemove = async (id) => {
    setRemovingId(id);
    try {
      await onRemove?.(id);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-sm text-zinc-600">Você ainda não tem amigos adicionados.</p>
        <p className="text-xs text-zinc-700">Use a aba "Buscar" para encontrar pessoas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {friends.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between gap-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-zinc-400" />
            </div>
            <span className="text-sm font-bold text-white truncate">{f.display_name}</span>
          </div>
          <button
            type="button"
            disabled={removingId === f.id}
            onClick={() => handleRemove(f.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-zinc-600 hover:text-red-400 disabled:opacity-50"
            title="Remover amigo"
          >
            {removingId === f.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
