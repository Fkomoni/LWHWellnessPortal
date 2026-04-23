import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { FwaCase } from '../../types';
import { AlertTriangle, RefreshCw, Filter } from 'lucide-react';

interface FwaCasesResponse {
  cases: FwaCase[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const statusOptions = [
  { value: '', label: 'All Cases' },
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const statusBadge = (status: FwaCase['status']) => {
  const map = {
    OPEN: 'badge-open',
    UNDER_REVIEW: 'badge-pending',
    RESOLVED: 'badge-confirmed',
    ESCALATED: 'badge-flagged',
  };
  return <span className={map[status]}>{status.replace('_', ' ')}</span>;
};

const flagTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    MEMBER_DENIED_VISIT: 'Member Denied Visit',
    PROVIDER_GENERATED_OTP: 'Provider-Generated OTP',
    DUPLICATE_SESSION: 'Duplicate Session',
    EXCESSIVE_SESSIONS: 'Excessive Sessions',
  };
  return map[type] ?? type;
};

export default function AdvocateFWACases() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery<FwaCasesResponse>({
    queryKey: ['advocate-fwa', page, statusFilter],
    queryFn: () =>
      apiClient.get(`/advocate/fwa?page=${page}${statusFilter ? `&status=${statusFilter}` : ''}`).then((r) => r.data),
  });

  const { cases = [], pagination } = data ?? { cases: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-grey-5">FWA Cases</h1>
          <p className="text-sm text-grey-4 mt-0.5">Fraud, Waste & Abuse investigation queue</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-grey-4" />
        <div className="flex gap-2 flex-wrap">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors
                ${statusFilter === opt.value
                  ? 'bg-brand-red text-white'
                  : 'bg-grey-2 text-grey-4 hover:bg-grey-3'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw size={24} className="animate-spin text-brand-red" />
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-grey-1 border-b border-grey-2">
                <tr>
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Case Ref</th>
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Gym</th>
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">Flag Type</th>
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-grey-4">
                        <AlertTriangle size={24} className="text-grey-3" />
                        <span className="text-sm">No FWA cases found</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cases.map((c) => (
                    <tr key={c.id} className="border-b border-grey-2 last:border-0 hover:bg-grey-1 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                          <span className="font-bold text-red-700 text-xs font-mono">{c.caseRef}</span>
                        </div>
                        <p className="text-xs text-grey-4 mt-0.5 max-w-[200px] truncate">{c.description}</p>
                      </td>
                      <td className="px-3 py-3 text-xs hidden sm:table-cell">
                        <div className="font-semibold text-grey-5">{c.provider?.gymName ?? '—'}</div>
                        <div className="text-grey-4">{c.provider?.location}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-grey-5 hidden md:table-cell">
                        {flagTypeLabel(c.flagType)}
                      </td>
                      <td className="px-3 py-3">{statusBadge(c.status)}</td>
                      <td className="px-3 py-3 text-xs text-grey-4 hidden lg:table-cell">
                        {new Date(c.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-grey-4">
                {pagination.total} cases · Page {pagination.page} of {pagination.pages}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
                  ← Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
