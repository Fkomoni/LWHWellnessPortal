import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { MessageSquare, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface CommLog {
  id: string;
  senderId: string;
  senderName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  emailType: string;
  sentAt: string;
}

interface CommsResponse {
  logs: CommLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const typeLabels: Record<string, string> = {
  GYM_NETWORK_INFO: 'Gym Network Info',
  OTP_DELIVERY: 'OTP Delivery',
  FWA_NOTIFICATION: 'FWA Notification',
  FWA_PROVIDER_ALERT: 'FWA Provider Alert',
  ADVOCATE_OTP_TO_PROVIDER: 'Advocate OTP → Provider',
};

export default function AdvocateCommunicationLog() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CommsResponse>({
    queryKey: ['communication-log', page],
    queryFn: () => apiClient.get(`/advocate/communication-log?page=${page}`).then((r) => r.data),
  });

  const { logs = [], pagination } = data ?? { logs: [], pagination: { page: 1, limit: 30, total: 0, pages: 0 } };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Communication Log</h1>
        <p className="text-sm text-grey-4 mt-0.5">
          Full audit trail of all emails sent from the portal — {pagination.total} records
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-grey-1 border-b border-grey-2">
            <tr>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Sent At</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Sender</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Recipient</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">Subject</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <MessageSquare size={24} className="mx-auto mb-2 text-grey-3" />
                  <p className="text-sm text-grey-4">No communications logged yet</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="border-b border-grey-2 hover:bg-grey-1 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td className="px-5 py-3 text-xs text-grey-4">
                      {new Date(log.sentAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <div>{new Date(log.sentAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-grey-5">{log.senderName}</td>
                    <td className="px-3 py-3 text-xs text-grey-4 hidden sm:table-cell">{log.recipientEmail}</td>
                    <td className="px-3 py-3">
                      <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                        {typeLabels[log.emailType] ?? log.emailType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-grey-5 max-w-[200px] truncate hidden md:table-cell">{log.subject}</td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={log.id + '-detail'} className="bg-blue-50 border-b border-grey-2">
                      <td colSpan={5} className="px-5 py-4">
                        <div className="text-xs font-semibold text-grey-4 mb-2">Subject: {log.subject}</div>
                        <pre className="whitespace-pre-wrap text-xs text-grey-5 bg-white rounded-lg p-3 border border-grey-2 max-h-48 overflow-y-auto font-sans">
                          {log.body}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-grey-4">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={14} /> Prev
            </button>
            <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
