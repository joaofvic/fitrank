import { User } from 'lucide-react';

const ICON_SIZES = { xs: 12, sm: 14, md: 16, lg: 20, xl: 40 };

/**
 * Avatar circular reutilizável com fallback para ícone User.
 * O tamanho do container é controlado via `className` (ex: "w-10 h-10 bg-zinc-800").
 * `size` controla apenas o ícone de fallback.
 */
export function UserAvatar({ src, size = 'md', className = '' }) {
  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center shrink-0 ${className}`}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <User size={ICON_SIZES[size] ?? 16} className="text-zinc-400" />
      )}
    </div>
  );
}
