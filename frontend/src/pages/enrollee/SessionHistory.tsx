import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { Session } from '../../types';
import { CheckCircle2, AlertTriangle, Clock, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

interface SessionsResponse {
  sessions: Session[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export default function EnrolleeSessionHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<SessionsResponse>({
    queryKey: ['member-sessions', page],
    queryFn: () => apiClient.get(`/member/sessions?page=${page}&limit=20`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-red" />
      </div>
    );
  }

  const { sessions = [], pagination } = data ?? { sessions: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-grey-5">Session History</h1>
          <p className="text-sm text-grey-4 mt-0.5">{pagination.total} sessions total</p>
        </div>
      </div>

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
                    <div className="text-xs">
                      {new Date(session.sessionDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {session.fwaFlagged ? (
                      <span className="badge-flagged">Flagged</span>
                    ) : session.status === 'CONFIRMED' ? (
                      <span className="badge-confirmed">Confirmed</span>
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

      {/* Pagination */}
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
