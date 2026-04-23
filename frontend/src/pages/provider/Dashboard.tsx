import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import StatCard from '../../components/ui/StatCard';
import { ProviderDashboard } from '../../types';
import { CheckSquare, UserCheck, AlertTriangle, RefreshCw } from 'lucide-react';

export default function ProviderDashboard() {
  const { data, isLoading } = useQuery<ProviderDashboard>({
    queryKey: ['provider-dashboard'],
    queryFn: () => apiClient.get('/provider/dashboard').then((r) => r.data),
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-red" />
      </div>
    );
  }

  const { stats, recentSessions, fwaAlerts } = data ?? {
    stats: { todaySessions: 0, monthSessions: 0, pendingClaims: 0, pendingAmount: 0 },
    recentSessions: [],
    fwaAlerts: [],
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-grey-5">Provider Dashboard</h1>
          <p className="text-sm text-grey-4 mt-0.5">
            {new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/provider/validate">
            <button className="btn-primary flex items-center gap-2 text-xs">
              <CheckSquare size={14} /> Validate Session
            </button>
          </Link>
          <Link to="/provider/eligibility">
            <button className="btn-secondary flex items-center gap-2 text-xs">
              <UserCheck size={14} /> Check Eligibility
            </button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sessions Today" value={stats.todaySessions} sub="Leadway members" color="red" />
        <StatCard label="This Month" value={stats.monthSessions} sub="sessions validated" color="orange" />
        <StatCard label="Pending Claims" value={stats.pendingClaims} sub="ready to submit" color="blue" />
        <StatCard
          label="Amount Payable"
          value={`₦${(stats.pendingAmount / 1000).toFixed(0)}k`}
          sub="pending payment"
          color="green"
        />
      </div>

      {/* FWA alerts */}
      {fwaAlerts.length > 0 && (
        <div className="space-y-3">
          {fwaAlerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-red-700">🚨 FWA Alert: </span>
                <span className="text-red-700">
                  {alert.description} Case Ref: <strong>{alert.caseRef}</strong>. Investigation underway.
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Today's sessions table */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-grey-2">
          <h2 className="font-bold text-grey-5">Today's Validated Sessions</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-grey-1 border-b border-grey-2">
            <tr>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Time</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Member</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Status</th>
              <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3 hidden md:table-cell">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-grey-4 text-sm">
                  No sessions validated today yet.
                </td>
              </tr>
            ) : (
              recentSessions.map((session) => (
                <tr key={session.id} className="border-b border-grey-2 last:border-0 hover:bg-grey-1">
                  <td className="px-5 py-3 text-xs text-grey-4 font-mono">
                    {new Date(session.sessionDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-grey-5 text-sm">
                      {session.member.firstName} {session.member.lastName}
                    </div>
                    <div className="text-xs text-grey-4 font-mono">{session.member.memberRef}</div>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    {session.fwaFlagged ? (
                      <span className="badge-flagged">❌ FWA Alert</span>
                    ) : session.status === 'CONFIRMED' ? (
                      <span className="badge-confirmed">✅ Confirmed</span>
                    ) : (
                      <span className="badge-pending">⏳ Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs hidden md:table-cell">
                    {session.whatsappVerified ? (
                      <span className="text-green-600 font-semibold">YES ✓</span>
                    ) : (
                      <span className="text-grey-4">Awaiting</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
