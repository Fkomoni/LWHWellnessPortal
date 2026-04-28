import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { Session } from '../../types';
import { CheckCircle2, AlertTriangle, Clock, ChevronLeft, ChevronRight, RefreshCw, Trash2, TimerReset, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface SessionsResponse {
  sessions: Session[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function useCountdown(expiresAt: string | null | undefined) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return label;
}

function ActiveOtpCard({ session, onCancel, onExtend }: {
  session: Session;
  onCancel: (id: string) => void;
  onExtend: (id: string) => void;
}) {
  const [visible, setVisible] = useState(true);
  const countdown = useCountdown(session.otpExpiresAt);
  const expired = countdown === 'Expired' || !countdown;

  return (
    <div className={`card border-2 space-y-4 ${expired ? 'border-grey-3 opacity-60' : 'border-brand-red bg-red-50/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-grey-5">{session.provider.gymName}</p>
          <p className="text-xs text-grey-4">{session.provider.location}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${expired ? 'bg-grey-2 text-grey-4' : 'bg-orange-100 text-orange-700'}`}>
          {expired ? 'Expired' : `Expires in ${countdown}`}
        </span>
      </div>

      {/* OTP display */}
      <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-grey-2">
        <div>
          <p className="text-xs text-grey-4 mb-1">Your OTP Code</p>
          <div className="text-3xl font-bold font-mono tracking-widest text-brand-navy">
            {visible ? session.otpCode : '••••••'}
          </div>
        </div>
        <button onClick={() => setVisible((v) => !v)} className="text-grey-3 hover:text-grey-5 p-2">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <p className="text-xs text-grey-4">Show this code to the gym receptionist. It can only be used once.</p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onExtend(session.id)}
          disabled={expired}
          className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm disabled:opacity-40"
        >
          <TimerReset size={15} /> Extend +2h
        </button>
        <button
          onClick={() => onCancel(session.id)}
          className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 transition-colors font-semibold"
        >
          <Trash2 size={15} /> Cancel OTP
        </button>
      </div>
    </div>
  );
}

export default function EnrolleeSessionHistory() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SessionsResponse>({
    queryKey: ['member-sessions', page],
    queryFn: () => apiClient.get(`/member/sessions?page=${page}&limit=20`).then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/member/sessions/${sessionId}`),
    onSuccess: () => {
      toast.success('Session cancelled and OTP voided.');
      queryClient.invalidateQueries({ queryKey: ['member-sessions'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? 'Could not cancel session'),
  });

  const extendMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.post<{ otpExpiresAt: string }>(`/member/sessions/${sessionId}/extend-otp`).then((r) => r.data),
    onSuccess: () => {
      toast.success('OTP extended by 2 hours.');
      queryClient.invalidateQueries({ queryKey: ['member-sessions'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? 'Could not extend OTP'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-red" />
      </div>
    );
  }

  const { sessions = [], pagination } = data ?? { sessions: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
  const activeSessions = sessions.filter((s) => s.status === 'PENDING' && s.otpCode);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Session History</h1>
        <p className="text-sm text-grey-4 mt-0.5">{pagination.total} sessions total</p>
      </div>

      {/* Active OTPs */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-grey-5 text-sm uppercase tracking-wider">Active OTPs</h2>
          {activeSessions.map((session) => (
            <ActiveOtpCard
              key={session.id}
              session={session}
              onCancel={(id) => cancelMutation.mutate(id)}
              onExtend={(id) => extendMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Full history table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-grey-1 border-b border-grey-2">
            <tr>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Gym</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Date</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">WhatsApp</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">Rating</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-grey-4 text-sm">
                  No sessions found. Start using gyms to see your history here.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="border-b border-grey-2 hover:bg-grey-1 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {session.fwaFlagged ? (
                        <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-grey-5">{session.provider.gymName}</div>
                        <div className="text-xs text-grey-4">{session.provider.location}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-grey-4 text-xs hidden sm:table-cell">
                    {new Date(session.sessionDate).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    <div>{new Date(session.sessionDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-3 py-3">
                    {session.fwaFlagged ? (
                      <span className="badge-flagged">Flagged</span>
                    ) : session.status === 'CONFIRMED' ? (
                      <span className="badge-confirmed">Confirmed</span>
                    ) : session.status === 'CANCELLED' ? (
                      <span className="badge-flagged">Cancelled</span>
                    ) : (
                      <span className="badge-pending">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    {session.whatsappVerified ? (
                      <span className="text-green-600 text-xs font-semibold">✓ Verified</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-grey-4">
                        <Clock size={12} /> Awaiting
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    {session.rating ? (
                      <span className="text-yellow-500 text-xs">{'★'.repeat(session.rating.rating)}{'☆'.repeat(5 - session.rating.rating)}</span>
                    ) : (
                      <span className="text-xs text-grey-3">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-grey-4">
            Page {pagination.page} of {pagination.pages} ({pagination.total} sessions)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
