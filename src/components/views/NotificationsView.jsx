import { useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  ImageOff,
  RefreshCw,
  User
} from 'lucide-react';
import { formatTimeAgo } from '../../lib/dates.js';

const SOCIAL_TYPES = new Set(['like', 'comment', 'friend_request', 'friend_accepted']);

const SYSTEM_ICONS = {
  checkin_rejected: AlertTriangle,
  checkin_approved: CheckCircle2,
  checkin_photo_rejected: ImageOff,
  photo_rejected: ImageOff,
  admin_message: Bell
};

function groupByTimePeriod(items) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const groups = {
    Hoje: [],
    Ontem: [],
    'Esta semana': [],
    'Este mês': [],
    Anteriores: []
  };

  for (const item of items) {
    const d = new Date(item.created_at);
    if (d >= today) groups['Hoje'].push(item);
    else if (d >= yesterday) groups['Ontem'].push(item);
    else if (d >= weekAgo) groups['Esta semana'].push(item);
    else if (d >= monthAgo) groups['Este mês'].push(item);
    else groups['Anteriores'].push(item);
  }

  return Object.entries(groups).filter(([, list]) => list.length > 0);
}

function NotificationItem({ notification, isNew }) {
  const isSocial = SOCIAL_TYPES.has(notification.type);
  const actorName = notification.data?.actor_name;
  const thumbUrl = notification.data?.foto_url ?? null;
  const SystemIcon = !isSocial ? (SYSTEM_ICONS[notification.type] || Bell) : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        isNew ? 'bg-zinc-800/30' : ''
      }`}
    >
      {isSocial ? (
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 p-[2px] shrink-0">
          <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center">
            <User size={18} className="text-zinc-400" />
          </div>
        </div>
      ) : (
        <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
          <SystemIcon size={18} className="text-zinc-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-zinc-300 leading-[1.4]">
          {actorName ? (
            <>
              <span className="font-bold text-white">{actorName}</span>
              {' '}{notification.body}
            </>
          ) : (
            <>
              <span className="font-bold text-white">{notification.title}</span>
              {notification.body && <>{' '}{notification.body}</>}
            </>
          )}
          {'  '}
          <span className="text-zinc-600">{formatTimeAgo(notification.created_at)}</span>
        </p>
      </div>

      {thumbUrl && (
        <div className="w-11 h-11 rounded overflow-hidden bg-zinc-800 shrink-0">
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
    </div>
  );
}

export function NotificationsView({
  notifications = [],
  readNotifications = [],
  onMarkAllRead,
  onBack
}) {
  useEffect(() => {
    if (notifications.length > 0 && onMarkAllRead) {
      onMarkAllRead();
    }
  }, []);

  const groupedRead = useMemo(() => groupByTimePeriod(readNotifications), [readNotifications]);

  const hasAny = notifications.length > 0 || readNotifications.length > 0;

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center gap-3 px-4 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={16} className="text-zinc-400" />
        </button>
        <h2 className="text-lg font-bold text-white">Notificações</h2>
      </div>

      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <BellOff size={28} className="text-zinc-600" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">Nenhuma notificação</p>
          <p className="text-xs text-zinc-600 mt-1">
            Quando houver novidades, elas aparecerão aqui.
          </p>
        </div>
      )}

      {notifications.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-xs font-black uppercase text-white tracking-wide">Novas</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-900/40 font-bold">
              {notifications.length}
            </span>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} isNew />
            ))}
          </div>
        </div>
      )}

      {groupedRead.length > 0 && (
        <div>
          {groupedRead.map(([label, items]) => (
            <div key={label}>
              <div className="px-4 py-2 mt-2">
                <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wide">
                  {label}
                </h3>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {items.map((n) => (
                  <NotificationItem key={n.id} notification={n} isNew={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasAny && (
        <div className="flex items-center justify-center py-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <RefreshCw size={12} />
            Voltar ao início
          </button>
        </div>
      )}
    </div>
  );
}
