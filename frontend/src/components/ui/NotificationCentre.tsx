import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { Bell, X, CheckCheck } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationCentre() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery<{ notifications: Notification[] }>({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/member/notifications').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiClient.patch('/member/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readOneMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/member/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-grey-2 z-30 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-grey-2">
              <h3 className="font-bold text-grey-5 text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={() => readAllMutation.mutate()} className="text-xs text-brand-red hover:underline flex items-center gap-1">
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 hover:bg-grey-1 rounded">
                  <X size={14} className="text-grey-4" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-grey-4">
                  <Bell size={24} className="mx-auto mb-2 text-grey-3" />
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.readAt && readOneMutation.mutate(n.id)}
                    className={`w-full text-left px-4 py-3 border-b border-grey-2 last:border-0 hover:bg-grey-1 transition-colors
                      ${!n.readAt ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && <div className="w-2 h-2 bg-brand-red rounded-full mt-1.5 flex-shrink-0" />}
                      <div>
                        <div className="text-sm font-semibold text-grey-5">{n.title}</div>
                        <div className="text-xs text-grey-4 mt-0.5">{n.body}</div>
                        <div className="text-xs text-grey-3 mt-1">
                          {new Date(n.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
