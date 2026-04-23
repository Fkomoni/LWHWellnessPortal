import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { Network, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

type ProviderStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_REVIEW';

interface Provider {
  id: string;
  gymCode: string;
  gymName: string;
  location: string;
  lga: string;
  email: string;
  phone: string;
  status: ProviderStatus;
  statusNote: string | null;
  amenities: string[];
  _count: { sessions: number; claims: number; fwaCases: number };
}

const statusConfig: Record<ProviderStatus, { badge: string; icon: React.ReactNode; label: string }> = {
  ACTIVE: { badge: 'badge-confirmed', icon: <CheckCircle2 size={12} />, label: 'Active' },
  SUSPENDED: { badge: 'badge-flagged', icon: <AlertTriangle size={12} />, label: 'Suspended' },
  PENDING_REVIEW: { badge: 'badge-pending', icon: <Clock size={12} />, label: 'Pending Review' },
};

export default function AdvocateProviderNetwork() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<ProviderStatus>('ACTIVE');
  const [note, setNote] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ providers: Provider[] }>({
    queryKey: ['advocate-providers'],
    queryFn: () => apiClient.get('/advocate/providers').then((r) => r.data),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: ProviderStatus; note: string }) =>
      apiClient.patch(`/advocate/providers/${id}/status`, { status, note }),
    onSuccess: () => {
      toast.success('Provider status updated');
      queryClient.invalidateQueries({ queryKey: ['advocate-providers'] });
      setEditingId(null);
      setNote('');
    },
    onError: () => toast.error('Update failed'),
  });

  const providers = (data?.providers ?? []).filter((p) => !statusFilter || p.status === statusFilter);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-grey-5">Provider Network</h1>
          <p className="text-sm text-grey-4 mt-0.5">{data?.providers.length ?? 0} gym partners in the network</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['', 'ACTIVE', 'SUSPENDED', 'PENDING_REVIEW'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors
              ${statusFilter === s ? 'bg-brand-red text-white' : 'bg-grey-2 text-grey-4 hover:bg-grey-3'}`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {providers.map((provider) => {
          const sc = statusConfig[provider.status];
          const isEditing = editingId === provider.id;

          return (
            <div key={provider.id} className="card">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-brand-red/10 rounded-lg flex-shrink-0">
                  <Network size={18} className="text-brand-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-grey-5">{provider.gymName}</h3>
                    <span className={`inline-flex items-center gap-1 ${sc.badge}`}>{sc.icon} {sc.label}</span>
                    <span className="text-xs font-mono text-grey-4">{provider.gymCode}</span>
                  </div>
                  <p className="text-xs text-grey-4 mt-0.5">{provider.location} · {provider.lga}</p>
                  {provider.statusNote && (
                    <p className="text-xs text-orange-600 mt-1">Note: {provider.statusNote}</p>
                  )}
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs text-grey-4">{provider._count.sessions} sessions</span>
                    <span className="text-xs text-grey-4">{provider._count.claims} claims</span>
                    {provider._count.fwaCases > 0 && (
                      <span className="text-xs text-red-600 font-semibold">{provider._count.fwaCases} FWA cases</span>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mt-4 space-y-3 bg-grey-1 rounded-xl p-4">
                      <div>
                        <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-1">New Status</label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as ProviderStatus)}
                          className="w-full border border-grey-3 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-red"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="SUSPENDED">Suspended</option>
                          <option value="PENDING_REVIEW">Pending Review</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-1">Reason / Note</label>
                        <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Reason for status change..."
                          className="w-full border border-grey-3 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-red"
                          maxLength={500}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                        <button
                          onClick={() => updateStatusMutation.mutate({ id: provider.id, status: newStatus, note })}
                          disabled={updateStatusMutation.isPending}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <button
                    onClick={() => { setEditingId(provider.id); setNewStatus(provider.status); setNote(provider.statusNote ?? ''); }}
                    className="text-xs text-brand-red hover:underline flex-shrink-0"
                  >
                    Change Status
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
