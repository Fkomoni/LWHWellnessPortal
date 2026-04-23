import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { FileText, Download, Send, RefreshCw } from 'lucide-react';

interface Claim {
  id: string;
  amount: number;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVERSED';
  submittedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  session: {
    sessionDate: string;
    generatedBy: string;
    member: { firstName: string; lastName: string; memberRef: string };
  };
}

interface ClaimsResponse {
  claims: Claim[];
  summary: Array<{ status: string; _count: { id: number }; _sum: { amount: number | null } }>;
  pagination: { page: number; limit: number; total: number; pages: number };
}

const statusColors: Record<string, string> = {
  PENDING: 'badge-pending',
  SUBMITTED: 'badge-open',
  APPROVED: 'badge-confirmed',
  REJECTED: 'badge-flagged',
  REVERSED: 'badge-flagged',
};

export default function ProviderClaims() {
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ClaimsResponse>({
    queryKey: ['provider-claims', statusFilter],
    queryFn: () => apiClient.get(`/provider/claims${statusFilter ? `?status=${statusFilter}` : ''}`).then((r) => r.data),
  });

  const submitMutation = useMutation({
    mutationFn: () => apiClient.post('/provider/claims/submit'),
    onSuccess: () => {
      toast.success('Claims submitted successfully!');
      queryClient.invalidateQueries({ queryKey: ['provider-claims'] });
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? 'Submission failed'),
  });

  const payAdviceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/provider/claims/pay-advice', {}, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PayAdvice-${new Date().toISOString().slice(0, 7)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Pay advice downloaded'),
    onError: () => toast.error('Could not generate pay advice'),
  });

  const { claims = [], summary = [] } = data ?? {};
  const pendingCount = summary.find((s) => s.status === 'PENDING')?._count.id ?? 0;

  const statusOptions = ['', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'];

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-grey-5">Claims & Pay Advice</h1>
          <p className="text-sm text-grey-4 mt-0.5">Manage session claims and download payment advice</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => payAdviceMutation.mutate()}
            disabled={payAdviceMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Download size={14} /> Download Pay Advice
          </button>
          {pendingCount > 0 && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Send size={14} /> Submit {pendingCount} Pending Claims
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map((s) => (
          <div key={s.status} className="card text-center">
            <div className="text-xl font-bold text-brand-red">{s._count.id}</div>
            <div className="text-xs text-grey-4 mt-0.5">{s.status}</div>
            <div className="text-xs font-semibold text-grey-5 mt-0.5">₦{(s._sum.amount ?? 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {statusOptions.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors
              ${statusFilter === s ? 'bg-brand-red text-white' : 'bg-grey-2 text-grey-4 hover:bg-grey-3'}`}
          >
            {s || 'All Claims'}
          </button>
        ))}
      </div>

      {/* Claims table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-grey-1 border-b border-grey-2">
            <tr>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Member</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Session Date</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">Generated By</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Amount</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-grey-4 text-sm"><FileText size={24} className="mx-auto mb-2 text-grey-3" />No claims found</td></tr>
            ) : (
              claims.map((claim) => (
                <tr key={claim.id} className="border-b border-grey-2 last:border-0 hover:bg-grey-1">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-grey-5">{claim.session.member.firstName} {claim.session.member.lastName}</div>
                    <div className="text-xs text-grey-4 font-mono">{claim.session.member.memberRef}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-grey-4 hidden sm:table-cell">
                    {new Date(claim.session.sessionDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    {claim.session.generatedBy === 'PROVIDER' ? (
                      <span className="text-xs text-orange-600 font-semibold">Provider-Gen ⚠️</span>
                    ) : claim.session.generatedBy === 'ADVOCATE' ? (
                      <span className="text-xs text-blue-600 font-semibold">Advocate-Gen</span>
                    ) : (
                      <span className="text-xs text-grey-4">Member</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold text-grey-5">₦{claim.amount.toLocaleString()}</td>
                  <td className="px-3 py-3"><span className={statusColors[claim.status] ?? 'badge-pending'}>{claim.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
