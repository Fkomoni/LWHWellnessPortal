import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { BarChart2, RefreshCw, TrendingUp } from 'lucide-react';

interface UtilisationReport {
  sessionsByGym: Array<{ providerId: string; _count: { id: number } }>;
  claimsByStatus: Array<{ status: string; _count: { id: number }; _sum: { amount: number | null } }>;
  totalSessions: number;
  planBreakdown: Array<{ planType: string; _count: { id: number } }>;
}

export default function AdvocateReports() {
  const { data, isLoading } = useQuery<UtilisationReport>({
    queryKey: ['advocate-utilisation'],
    queryFn: () => apiClient.get('/advocate/reports/utilisation').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  const { claimsByStatus = [], totalSessions = 0, planBreakdown = [] } = data ?? {};
  const totalClaimAmount = claimsByStatus.reduce((s, c) => s + (c._sum.amount ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Utilisation Reports</h1>
        <p className="text-sm text-grey-4 mt-0.5">
          {new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })} · Gym usage, claims, and plan breakdown
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-brand-red">{totalSessions.toLocaleString()}</div>
          <div className="text-xs text-grey-4 mt-1">Total Sessions This Month</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-brand-orange">₦{(totalClaimAmount / 1000).toFixed(0)}k</div>
          <div className="text-xs text-grey-4 mt-1">Total Claims Value</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Claims by status */}
        <div className="card">
          <h2 className="font-bold text-grey-5 mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-brand-red" /> Claims by Status
          </h2>
          <div className="space-y-3">
            {claimsByStatus.map((c) => {
              const pct = totalSessions > 0 ? Math.round((c._count.id / totalSessions) * 100) : 0;
              return (
                <div key={c.status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-grey-5">{c.status}</span>
                    <span className="text-grey-4">{c._count.id} · ₦{(c._sum.amount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-grey-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-red rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="card">
          <h2 className="font-bold text-grey-5 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-red" /> Members by Plan Type
          </h2>
          <div className="space-y-3">
            {planBreakdown.length === 0 ? (
              <p className="text-sm text-grey-4">No data available</p>
            ) : (
              planBreakdown.map((p) => (
                <div key={p.planType} className="flex items-center justify-between py-2 border-b border-grey-2 last:border-0">
                  <span className="text-sm font-semibold text-grey-5">{p.planType}</span>
                  <span className="text-brand-red font-bold">{p._count.id.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card bg-grey-1 border-grey-2">
        <p className="text-xs text-grey-4 text-center">
          Reports are generated in real-time. For actuarial exports and historical data, contact the IT team for database-level reporting.
        </p>
      </div>
    </div>
  );
}
