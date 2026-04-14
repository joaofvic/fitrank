import { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal, Users } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx';

export function FriendsListDrawer({ friends = [], loading = false, onClose, onOpenProfile, onRemove }) {
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

  const handleRemove = async (friendshipId) => {
    setMenuOpen(null);
    await onRemove?.(friendshipId);
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="max-w-lg mx-auto max-h-[70vh]" showClose={false}>
        <SheetHeader className="flex items-center justify-between flex-row">
          <SheetTitle className="text-sm font-black uppercase tracking-wide text-zinc-300">
            Amigos
          </SheetTitle>
        </SheetHeader>

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
                        aria-label={`Mais opções para ${friend.display_name}`}
                        aria-expanded={menuOpen === friend.id}
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {menuOpen === friend.id && (
                        <div ref={menuRef} role="menu" className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[160px]">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleRemove(friend.id)}
                            className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-zinc-700/50 transition-colors"
                          >
                            Remover amigo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
