import { Plus } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';

export function StoriesRing({ stories = [], currentUserId, onOpenStory, onCreateStory, selfAvatarUrl }) {
  if (stories.length === 0 && !onCreateStory) return null;

  const selfInRing = stories.find((s) => s.user_id === currentUserId);
  const hasOwnStories = selfInRing && selfInRing.story_count > 0;

  const handleSelfTap = () => {
    if (hasOwnStories) {
      onOpenStory?.(currentUserId);
    } else {
      onCreateStory?.();
    }
  };

  return (
    <div className="flex gap-3 px-4 pb-3 overflow-x-auto scrollbar-hide -mr-4 pr-4">
      {(onCreateStory || hasOwnStories) && (
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="relative cursor-pointer" onClick={handleSelfTap} role="button" tabIndex={0}>
            <div
              className={`w-16 h-16 rounded-full p-[3px] ${
                hasOwnStories
                  ? selfInRing.has_unseen
                    ? 'bg-gradient-to-br from-green-400 to-green-600'
                    : 'bg-zinc-700'
                  : 'bg-zinc-800'
              }`}
            >
              <div className="w-full h-full rounded-full bg-black p-[2px]">
                <UserAvatar
                  src={selfInRing?.avatar_url ?? selfAvatarUrl}
                  size="lg"
                  className="w-full h-full bg-zinc-900"
                />
              </div>
            </div>
            {onCreateStory && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCreateStory(); }}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-500 border-2 border-black flex items-center justify-center"
              >
                <Plus className="w-3 h-3 text-black" strokeWidth={3} />
              </button>
            )}
          </div>
          <span className="text-[10px] font-semibold text-zinc-400 w-16 text-center truncate">
            Seu story
          </span>
        </div>
      )}

      {stories
        .filter((s) => s.user_id !== currentUserId)
        .map((s) => (
          <button
            key={s.user_id}
            type="button"
            onClick={() => onOpenStory?.(s.user_id)}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div
              className={`w-16 h-16 rounded-full p-[3px] ${
                s.has_unseen
                  ? 'bg-gradient-to-br from-green-400 to-green-600'
                  : 'bg-zinc-700'
              }`}
            >
              <div className="w-full h-full rounded-full bg-black p-[2px]">
                <UserAvatar
                  src={s.avatar_url}
                  size="lg"
                  className="w-full h-full bg-zinc-900"
                />
              </div>
            </div>
            <span className="text-[10px] font-semibold text-zinc-400 w-16 text-center truncate">
              {s.display_name?.split(' ')[0]}
            </span>
          </button>
        ))}
    </div>
  );
}
