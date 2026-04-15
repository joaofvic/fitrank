import { useCallback, useState } from 'react';
import { Search, UserPlus, Check, Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button.jsx';

export function FriendsStep({ supabase, currentUserId, onFinish }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!supabase || !q || q.length < 2) return;
    setSearching(true);
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

  const sendRequest = useCallback(async (addresseeId) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: currentUserId, addressee_id: addresseeId });
    if (!error) {
      setSentIds((prev) => new Set([...prev, addresseeId]));
    }
  }, [supabase, currentUserId]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-white">Treine com amigos!</p>
        <p className="text-sm text-zinc-400">Encontre amigos que já usam o FitRank.</p>
      </div>

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
          {searching ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {results.map((user) => {
            const alreadySent = sentIds.has(user.id) || user.friendship_status === 'pending' || user.friendship_status === 'accepted';
            return (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-xl bg-zinc-900/60 border border-zinc-800 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                      {(user.display_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-white truncate">{user.display_name}</p>
                </div>
                <button
                  type="button"
                  disabled={alreadySent}
                  onClick={() => sendRequest(user.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${alreadySent
                      ? 'bg-zinc-800 text-zinc-500 cursor-default'
                      : 'bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30'
                    }
                  `}
                  aria-label={alreadySent ? 'Solicitação enviada' : `Adicionar ${user.display_name}`}
                >
                  {alreadySent ? <Check size={14} /> : <UserPlus size={14} />}
                  {alreadySent ? 'Enviado' : 'Adicionar'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {results.length === 0 && query.trim().length >= 2 && !searching && (
        <p className="text-xs text-zinc-500 text-center">Nenhum usuário encontrado.</p>
      )}

      <Button
        type="button"
        onClick={onFinish}
        className="w-full py-3.5 rounded-xl font-bold text-base"
      >
        Finalizar
      </Button>
    </div>
  );
}
