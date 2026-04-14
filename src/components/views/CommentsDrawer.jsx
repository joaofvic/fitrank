import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2, X } from 'lucide-react';
import { formatTimeAgo } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { UserAvatar } from '../ui/user-avatar.jsx';

export function CommentsDrawer({
  checkinId,
  onClose,
  onLoadComments,
  onAddComment,
  onDeleteComment,
  currentUserId,
  allowComments = true
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!checkinId || !onLoadComments) return;
    let cancelled = false;
    setLoading(true);
    onLoadComments(checkinId).then((rows) => {
      if (!cancelled) {
        setComments(rows ?? []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [checkinId, onLoadComments]);

  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length, loading]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending || !onAddComment) return;
    setSending(true);
    try {
      const newComment = await onAddComment(checkinId, content);
      if (newComment) setComments((prev) => [...prev, newComment]);
      setText('');
    } catch (err) {
      logger.error('add comment', err);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!onDeleteComment) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await onDeleteComment(commentId, checkinId);
    } catch (err) {
      logger.error('delete comment', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
            Comentários
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-zinc-600 py-10">
              Nenhum comentário ainda. Seja o primeiro!
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3 group">
                <UserAvatar src={c.avatar_url} size="sm" className="w-8 h-8 bg-zinc-800 border border-zinc-700 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{c.display_name}</span>
                    <span className="text-[10px] text-zinc-600">{formatTimeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-zinc-300 mt-0.5 break-words">{c.content}</p>
                </div>
                {c.user_id === currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-600 hover:text-red-400"
                    title="Excluir comentário"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {allowComments ? (
          <div className="shrink-0 border-t border-zinc-800 px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva um comentário..."
              maxLength={500}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-green-500/50 transition-colors"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-black shrink-0 disabled:opacity-40 disabled:cursor-not-allowed active:scale-90 transition-transform"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        ) : (
          <div className="shrink-0 border-t border-zinc-800 px-4 py-4">
            <p className="text-sm text-zinc-500 text-center">
              Os comentários estão desativados para esta publicação.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
