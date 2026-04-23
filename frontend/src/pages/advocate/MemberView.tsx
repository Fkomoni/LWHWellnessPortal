import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { Search, User, RefreshCw, ChevronRight } from 'lucide-react';

interface MemberSearchResult {
  id: string;
  memberRef: string;
  firstName: string;
  lastName: string;
  phone: string;
  isActive: boolean;
  sessionsUsed: number;
  sessionsPerMonth: number;
}

interface Member360 {
  id: string;
  firstName: string;
  lastName: string;
  memberRef: string;
  phone: string;
  isActive: boolean;
  sessionsUsed: number;
  sessionsPerMonth: number;
  sessions: Array<{
    id: string;
    status: string;
    sessionDate: string;
    fwaFlagged: boolean;
    whatsappVerified: boolean;
    provider: { gymName: string; location: string };
  }>;
}

export default function AdvocateMemberView() {
  const [searchQ, setSearchQ] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchQuery = useQuery<{ members: MemberSearchResult[] }>({
    queryKey: ['advocate-members', query],
    queryFn: () => apiClient.get(`/advocate/members?q=${encodeURIComponent(query)}`).then((r) => r.data),
    enabled: query.length >= 2,
  });

  const memberQuery = useQuery<{ member: Member360 }>({
    queryKey: ['advocate-member-360', selectedId],
    queryFn: () => apiClient.get(`/advocate/members/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const handleSearch = () => {
    if (searchQ.trim().length < 2) return;
    setQuery(searchQ.trim());
    setSelectedId(null);
  };

  const member = memberQuery.data?.member;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Member 360° View</h1>
        <p className="text-sm text-grey-4 mt-1">Search any enrollee for complete benefit and history detail</p>
      </div>

      {/* Search */}
      <div className="card">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-3" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name, member ID, or phone..."
              className="w-full pl-9 pr-4 py-2.5 border border-grey-3 rounded-lg text-sm
                         focus:outline-none focus:border-brand-red transition-colors"
              autoComplete="off"
            />
          </div>
          <button onClick={handleSearch} disabled={searchQ.trim().length < 2} className="btn-primary text-sm">
            Search
          </button>
        </div>

        {/* Search results */}
        {searchQuery.isLoading && query && (
          <div className="flex items-center gap-2 mt-3 text-sm text-grey-4">
            <RefreshCw size={14} className="animate-spin" /> Searching...
          </div>
        )}
        {searchQuery.data?.members && !selectedId && (
          <div className="mt-3 space-y-2">
            {searchQuery.data.members.length === 0 ? (
              <p className="text-sm text-grey-4">No members found for "{query}"</p>
            ) : (
              searchQuery.data.members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="w-full flex items-center gap-3 p-3 bg-grey-1 hover:bg-grey-2 rounded-xl text-left transition-colors"
                >
                  <div className="p-2 bg-brand-red/10 rounded-lg flex-shrink-0">
                    <User size={14} className="text-brand-red" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-grey-5 text-sm">{m.firstName} {m.lastName}</div>
                    <div className="text-xs text-grey-4 font-mono">{m.memberRef} · {m.isActive ? 'Active' : 'Inactive'}</div>
                  </div>
                  <div className="text-xs text-grey-4">{m.sessionsUsed}/{m.sessionsPerMonth} sessions</div>
                  <ChevronRight size={14} className="text-grey-3 flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Member 360 detail */}
      {selectedId && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setSelectedId(null)} className="text-xs text-brand-red hover:underline">
            ← Back to results
          </button>

          {memberQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-grey-4">
              <RefreshCw size={14} className="animate-spin" /> Loading member data...
            </div>
          ) : member ? (
            <>
              {/* Member info */}
              <div className="card">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-brand-red/10 rounded-full flex items-center justify-center">
                    <User size={20} className="text-brand-red" />
                  </div>
                  <div>
                    <h2 className="font-bold text-grey-5">{member.firstName} {member.lastName}</h2>
                    <p className="text-xs text-grey-4 font-mono">{member.memberRef}</p>
                  </div>
                  <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${member.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 py-4 border-t border-grey-2">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-brand-red">{member.sessionsUsed}</div>
                    <div className="text-xs text-grey-4 mt-0.5">Sessions used</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-grey-5">{member.sessionsPerMonth - member.sessionsUsed}</div>
                    <div className="text-xs text-grey-4 mt-0.5">Sessions left</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-grey-5">{member.sessionsPerMonth}</div>
                    <div className="text-xs text-grey-4 mt-0.5">Monthly limit</div>
                  </div>
                </div>
              </div>

              {/* Session history */}
              <div className="card overflow-hidden p-0">
                <div className="px-5 py-4 border-b border-grey-2">
                  <h3 className="font-bold text-grey-5">Session History</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-grey-1 border-b border-grey-2">
                    <tr>
                      <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-5 py-3">Gym</th>
                      <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Date</th>
                      <th className="text-left text-xs font-semibold text-grey-4 uppercase tracking-wider px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.sessions.map((s) => (
                      <tr key={s.id} className="border-b border-grey-2 last:border-0">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-grey-5">{s.provider.gymName}</div>
                          <div className="text-xs text-grey-4">{s.provider.location}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-grey-4">
                          {new Date(s.sessionDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3">
                          {s.fwaFlagged ? (
                            <span className="badge-flagged">FWA Flagged</span>
                          ) : s.status === 'CONFIRMED' ? (
                            <span className="badge-confirmed">Confirmed</span>
                          ) : (
                            <span className="badge-pending">{s.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {member.sessions.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-grey-4 text-sm">No sessions on record</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
