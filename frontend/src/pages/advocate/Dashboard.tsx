import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import StatCard from '../../components/ui/StatCard';
import type { AdvocateDashboard } from '../../types';
import { Users, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';

export default function AdvocateDashboard() {
  const { data, isLoading } = useQuery<AdvocateDashboard>({
    queryKey: ['advocate-dashboard'],
    queryFn: () => apiClient.get('/advocate/dashboard').then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-red" />
      </div>
    );
  }

  const { stats, topGyms, recentFwaFlags } = data ?? {
    stats: { totalToday: 0, activeMembers: 0, openFwaCases: 0, activeProviders: 0 },
    topGyms: [],
    recentFwaFlags: [],
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Advocate Operations Dashboard</h1>
        <p className="text-sm text-grey-4 mt-0.5">
          Leadway Wellness — {new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sessions Today" value={stats.totalToday} sub="network-wide" color="red" />
        <StatCard label="Active Members" value={stats.activeMembers.toLocaleString()} sub="with gym benefit" color="orange" />
        <StatCard label="Open FWA Cases" value={stats.openFwaCases} sub="under investigation" color="purple" />
        <StatCard label="Provider Network" value={stats.activeProviders} sub="active gyms" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top gyms */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-grey-5">Top 5 Gyms by Volume</h2>
            <span className="text-xs text-grey-4">This month</span>
          </div>
          <div className="space-y-3">
            {topGyms.length === 0 ? (
              <p className="text-sm text-grey-4">No data yet.</p>
            ) : (
              topGyms.map((gym, i) => (
                <div key={gym.providerId} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0
                    ${i === 0 ? 'bg-brand-red' : i === 1 ? 'bg-brand-orange' : 'bg-grey-4'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-grey-5">{gym.gym?.gymName ?? 'Unknown'}</div>
                    <div className="text-xs text-grey-4">{gym.gym?.location}</div>
                  </div>
                  <div className="text-sm font-bold text-brand-red">{gym._count.id.toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* FWA flags */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-grey-5">Recent FWA Flags</h2>
            <Link to="/advocate/fwa" className="text-xs text-brand-red hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentFwaFlags.length === 0 ? (
              <p className="text-sm text-grey-4">No open FWA cases. Great news!</p>
            ) : (
              recentFwaFlags.map((flag) => (
                <div key={flag.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-700">{flag.caseRef}</span>
                      <span className="badge-open">{flag.status}</span>
                    </div>
                    <div className="text-xs text-grey-5 mt-0.5">{flag.memberId.slice(0, 8)}... · {flag.provider?.gymName}</div>
                    <div className="text-xs text-grey-4 mt-0.5">{flag.description.slice(0, 80)}...</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/advocate/members">
          <div className="card hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
            <div className="p-3 bg-brand-red/10 rounded-xl">
              <Users size={20} className="text-brand-red" />
            </div>
            <div>
              <div className="font-semibold text-grey-5">Member 360° View</div>
              <div className="text-xs text-grey-4">Search and view full member benefit history</div>
            </div>
            <ArrowRight size={16} className="text-grey-3 ml-auto" />
          </div>
        </Link>
        <Link to="/advocate/fwa">
          <div className="card hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-xl">
              <AlertTriangle size={20} className="text-brand-orange" />
            </div>
            <div>
              <div className="font-semibold text-grey-5">Manage FWA Cases</div>
              <div className="text-xs text-grey-4">Review, investigate, and resolve cases</div>
            </div>
            <ArrowRight size={16} className="text-grey-3 ml-auto" />
          </div>
        </Link>
      </div>
    </div>
  );
}
