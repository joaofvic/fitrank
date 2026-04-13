import { useState } from 'react';
import { Loader2, MoreHorizontal, Users, X } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';

export function FriendsListDrawer({ friends = [], loading = false, onClose, onOpenProfile, onRemove }) {
  const [menuOpen, setMenuOpen] = useState(null);

  const handleRemove = async (friendshipId) => {
    setMenuOpen(null);
    await onRemove?.(friendshipId);
  };

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
                <div
                  key={friend.user_id}
                  className="flex items-center gap-3 py-1.5 -mx-2 px-2 rounded-xl hover:bg-zinc-800/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => { onOpenProfile?.(friend.user_id); onClose(); }}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-zinc-800 p-[2px] shrink-0">
                      <UserAvatar src={friend.avatar_url} size="md" className="w-full h-full bg-zinc-900" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-white truncate">{friend.display_name}</p>
                      {friend.username && (
                        <p className="text-xs text-zinc-500 truncate">@{friend.username}</p>
                      )}
                    </div>
                  </button>

                  {onRemove && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setMenuOpen(menuOpen === friend.id ? null : friend.id)}
                        className="p-2 text-zinc-500 hover:text-white transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {menuOpen === friend.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[160px]">
                            <button
                              type="button"
                              onClick={() => handleRemove(friend.id)}
                              className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-zinc-700/50 transition-colors"
                            >
                              Remover amigo
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
