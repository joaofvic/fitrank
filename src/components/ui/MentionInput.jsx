import { useCallback, useEffect, useRef, useState } from 'react';
import { UserAvatar } from './user-avatar.jsx';

/**
 * Textarea com autocomplete de @menções.
 * Ao digitar "@", mostra dropdown de amigos filtrados.
 *
 * @param {{ value: string, onChange: (v: string) => void, friends: Array<{user_id: string, display_name: string, avatar_url: string|null, username: string|null}>, maxLength?: number, placeholder?: string, rows?: number, className?: string }} props
 */
export function MentionInput({ value, onChange, friends = [], maxLength = 200, placeholder, rows = 3, className = '' }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = friends.filter((f) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (f.username && f.username.toLowerCase().includes(q)) ||
      f.display_name.toLowerCase().includes(q)
    );
  }).slice(0, 5);

  const handleInput = useCallback((e) => {
    const newValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    onChange(newValue);

    const pos = e.target.selectionStart ?? newValue.length;
    setCursorPos(pos);

    const textBefore = newValue.slice(0, pos);
    const atMatch = textBefore.match(/@([a-zA-Z0-9_]*)$/);

    if (atMatch) {
      setMentionStart(pos - atMatch[0].length);
      setQuery(atMatch[1]);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setQuery('');
      setMentionStart(-1);
    }
  }, [onChange, maxLength]);

  const handleSelect = useCallback((friend) => {
    const username = friend.username || friend.display_name.replace(/\s/g, '');
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${username} ${after}`;
    const capped = maxLength ? newValue.slice(0, maxLength) : newValue;
    onChange(capped);
    setShowDropdown(false);
    setQuery('');
    setMentionStart(-1);

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newPos = before.length + username.length + 2;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, mentionStart, cursorPos, onChange, maxLength]);

  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || filtered.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
    }
  }, [showDropdown, filtered]);

  useEffect(() => {
    if (!showDropdown) return;
    const close = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && e.target !== textareaRef.current) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showDropdown]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />

      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 bottom-full mb-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 max-h-[200px] overflow-y-auto animate-in-fade"
        >
          {filtered.map((friend) => (
            <button
              key={friend.user_id}
              type="button"
              onClick={() => handleSelect(friend)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-700/50 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[1px] shrink-0">
                <UserAvatar src={friend.avatar_url} size="sm" className="w-full h-full bg-zinc-900" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{friend.display_name}</p>
                {friend.username && (
                  <p className="text-[11px] text-zinc-500 truncate">@{friend.username}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {maxLength > 0 && (
        <span className={`absolute bottom-2 right-3 text-[10px] ${value.length >= maxLength ? 'text-red-400' : 'text-zinc-600'}`}>
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}
