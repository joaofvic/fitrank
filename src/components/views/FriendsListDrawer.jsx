import { Loader2, User, Users, X } from 'lucide-react';

export function FriendsListDrawer({ friends = [], loading = false, onClose, onOpenProfile }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in-fade"
        onClick={onClose}
      />

      <div className="relative max-w-lg w-full mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-2xl flex flex-col max-h-[70vh] animate-in-slide-up">
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="w-10 h-1 bg-zinc-700 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">
            Amigos
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Users className="w-8 h-8 text-zinc-700" />
              <p className="text-center text-sm text-zinc-600">
                Você ainda não adicionou nenhum amigo.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 font-semibold">
                {friends.length} amigo{friends.length !== 1 ? 's' : ''}
              </p>
              {friends.map((friend) => (
                <button
                  key={friend.user_id}
                  type="button"
                  onClick={() => { onOpenProfile?.(friend.user_id); onClose(); }}
                  className="w-full flex items-center gap-3 py-1.5 hover:bg-zinc-800/50 -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-zinc-800 p-[2px] shrink-0">
                    <div className="w-full h-full rounded-full bg-zinc-900 overflow-hidden flex items-center justify-center">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-white truncate">{friend.display_name}</p>
                    {friend.username && (
                      <p className="text-xs text-zinc-500 truncate">@{friend.username}</p>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
