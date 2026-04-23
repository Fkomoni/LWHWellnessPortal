import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { FwaCase } from '../../types';
import { AlertTriangle, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const map = { OPEN: 'badge-open', UNDER_REVIEW: 'badge-pending', RESOLVED: 'badge-confirmed', ESCALATED: 'badge-flagged' };
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
  const [closingCase, setClosingCase] = useState<FwaCase | null>(null);
  const [resolution, setResolution] = useState('');
  const [reverseClaim, setReverseClaim] = useState(true);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<FwaCasesResponse>({
    queryKey: ['advocate-fwa', page, statusFilter],
    queryFn: () => apiClient.get(`/advocate/fwa?page=${page}${statusFilter ? `&status=${statusFilter}` : ''}`).then((r) => r.data),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, resolution, reverseClaimm }: { id: string; resolution: string; reverseClaimm: boolean }) =>
      apiClient.patch(`/advocate/fwa/${id}/close`, { resolution, reverseClaimm }),
    onSuccess: () => {
      toast.success('FWA case resolved and claim reversed');
      queryClient.invalidateQueries({ queryKey: ['advocate-fwa'] });
      queryClient.invalidateQueries({ queryKey: ['advocate-dashboard'] });
      setClosingCase(null);
      setResolution('');
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? 'Could not close case'),
  });

  const { cases = [], pagination } = data ?? { cases: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Close case modal */}
      {closingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-grey-5">Close Case — {closingCase.caseRef}</h2>
              <button onClick={() => setClosingCase(null)} className="p-1 hover:bg-grey-1 rounded"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">Resolution Notes *</label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={4}
                  placeholder="Describe the outcome of the investigation..."
                  className="w-full border border-grey-3 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-red resize-none"
                  minLength={10}
                  maxLength={2000}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reverseClaim}
                  onChange={(e) => setReverseClaim(e.target.checked)}
                  className="w-4 h-4 text-brand-red"
                />
                <div>
                  <div className="text-sm font-semibold text-grey-5">Reverse the associated claim</div>
                  <div className="text-xs text-grey-4">Automatically mark claim as REVERSED via API</div>
                </div>
              </label>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
                This action is permanent. The case will be marked RESOLVED and the claim reversed if selected.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setClosingCase(null)} className="flex-1 btn-secondary">Cancel</button>
                <button
                  onClick={() => closeMutation.mutate({ id: closingCase.id, resolution, reverseClaimm: reverseClaim })}
                  disabled={closeMutation.isPending || resolution.length < 10}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={14} /> Close Case
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-grey-5">FWA Cases</h1>
          <p className="text-sm text-grey-4 mt-0.5">Fraud, Waste & Abuse investigation queue</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors
              ${statusFilter === opt.value ? 'bg-brand-red text-white' : 'bg-grey-2 text-grey-4 hover:bg-grey-3'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>
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
                  <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <AlertTriangle size={24} className="mx-auto mb-2 text-grey-3" />
                      <span className="text-sm text-grey-4">No FWA cases found</span>
                    </td>
                  </tr>
                ) : (
                  cases.map((c) => (
                    <tr key={c.id} className="border-b border-grey-2 last:border-0 hover:bg-grey-1 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                          <span className="font-bold text-red-700 text-xs font-mono">{c.caseRef}</span>
                        </div>
                        <p className="text-xs text-grey-4 mt-0.5 max-w-[180px] truncate">{c.description}</p>
                      </td>
                      <td className="px-3 py-3 text-xs hidden sm:table-cell">
                        <div className="font-semibold text-grey-5">{c.provider?.gymName ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-grey-5 hidden md:table-cell">{flagTypeLabel(c.flagType)}</td>
                      <td className="px-3 py-3">{statusBadge(c.status)}</td>
                      <td className="px-3 py-3">
                        {(c.status === 'OPEN' || c.status === 'UNDER_REVIEW') && (
                          <button
                            onClick={() => setClosingCase(c)}
                            className="text-xs text-brand-red hover:underline font-semibold"
                          >
                            Close Case
                          </button>
                        )}
                        {c.status === 'RESOLVED' && <span className="text-xs text-green-600">✓ Resolved</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-grey-4">{pagination.total} cases · Page {pagination.page} of {pagination.pages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">← Prev</button>
                <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
