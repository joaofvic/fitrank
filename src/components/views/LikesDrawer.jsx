import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx';

export function LikesDrawer({ checkinId, onClose, onLoadLikes, onOpenProfile }) {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checkinId || !onLoadLikes) return;
    let cancelled = false;
    setLoading(true);
    onLoadLikes(checkinId).then((rows) => {
      if (!cancelled) {
        setLikes(rows ?? []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [checkinId, onLoadLikes]);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="max-w-lg mx-auto max-h-[70vh]" showClose={false}>
        <SheetHeader className="flex items-center justify-between flex-row">
          <SheetTitle className="text-sm font-black uppercase tracking-wide text-zinc-300">
            Curtidas
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
            </div>
          ) : likes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Heart className="w-8 h-8 text-zinc-700" />
              <p className="text-center text-sm text-zinc-600">
                Nenhuma curtida ainda.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 font-semibold">
                {likes.length} curtida{likes.length !== 1 ? 's' : ''}
              </p>
              {likes.map((like) => (
                <button
                  key={like.user_id}
                  type="button"
                  onClick={() => { onOpenProfile?.(like.user_id); onClose(); }}
                  className="w-full flex items-center gap-3 py-1.5 hover:bg-zinc-800/50 -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px] shrink-0">
                    <UserAvatar src={like.avatar_url} size="md" className="w-full h-full bg-zinc-900" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-white truncate">{like.display_name}</p>
                  </div>
                  <Heart className="w-4 h-4 text-red-500 fill-red-500 shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
