import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../lib/apiClient';
import StatCard from '../../components/ui/StatCard';
import { MemberDashboard, Session, Gym } from '../../types';
import { QrCode, Star, CheckCircle2, Clock, AlertTriangle, MapPin, RefreshCw } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useState, useCallback, useRef } from 'react';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const LAGOS = { lat: 6.5244, lng: 3.3792 };
import toast from 'react-hot-toast';

function SessionBubble({ session, index }: { session: Session; index: number }) {
  const used = session.status === 'CONFIRMED';
  return (
    <div
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
        ${used ? 'bg-brand-red text-white' : 'bg-grey-2 text-grey-4 border-2 border-dashed border-grey-3'}`}
      title={used ? `Session ${index + 1} used` : `Session ${index + 1} available`}
    >
      {used ? <CheckCircle2 size={14} /> : index + 1}
    </div>
  );
}

function statusBadge(session: Session) {
  if (session.fwaFlagged) return <span className="badge-flagged">FWA Flag</span>;
  if (session.status === 'CONFIRMED') return <span className="badge-confirmed">Confirmed</span>;
  if (session.status === 'PENDING') return <span className="badge-pending">Pending</span>;
  return <span className="badge-flagged">{session.status}</span>;
}

export default function EnrolleeDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeGym, setActiveGym] = useState<Gym | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  const { isLoaded: mapsLoaded } = useJsApiLoader({ googleMapsApiKey: MAPS_API_KEY ?? '' });

  const { data, isLoading, error } = useQuery<MemberDashboard>({
    queryKey: ['member-dashboard'],
    queryFn: () => apiClient.get('/member/dashboard').then((r) => r.data),
  });

  const rateMutation = useMutation({
    mutationFn: ({ sessionId, rating }: { sessionId: string; rating: number }) =>
      apiClient.post('/member/rate-gym', { sessionId, rating }),
    onSuccess: () => {
      toast.success('Rating submitted!');
      queryClient.invalidateQueries({ queryKey: ['member-dashboard'] });
    },
    onError: () => toast.error('Could not submit rating'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-red" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="card text-red-600 text-sm">Failed to load dashboard. Please refresh.</div>;
  }

  const { member, spouse, recentSessions, nearbyGyms } = data;
  const sessionBubbles = Array.from({ length: member.sessionsPerMonth }, (_, i) => i < member.sessionsUsed);

  const isInactive = member.benefitStatus && member.benefitStatus !== 'ACTIVE' && member.benefitStatus !== 'UNKNOWN';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-grey-5">My Wellness Dashboard</h1>
          <p className="text-sm text-grey-4 mt-0.5">
            Welcome back, {user?.firstName} — here's your gym benefit summary
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {member.planType && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-red/10 text-brand-red">
              {member.planType}
            </span>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            member.benefitStatus === 'ACTIVE'
              ? 'bg-green-100 text-green-700'
              : member.benefitStatus === 'UNKNOWN'
              ? 'bg-grey-2 text-grey-4'
              : 'bg-red-100 text-red-700'
          }`}>
            {member.benefitStatus === 'UNKNOWN' ? 'Status unknown' : member.benefitStatus}
          </span>
        </div>
      </div>

      {isInactive && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <div className="text-red-500 mt-0.5 flex-shrink-0">⚠️</div>
          <div className="text-xs text-red-700">
            <strong>Benefit {member.benefitStatus}:</strong> Your gym benefit is currently not active.
            Please contact Leadway Health for assistance.
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Sessions Remaining"
          value={member.sessionsRemaining}
          sub={`of ${member.sessionsPerMonth} monthly`}
          color="red"
          icon={<QrCode size={18} />}
        />
        <StatCard
          label="Sessions Used"
          value={member.sessionsUsed}
          sub={`This month`}
          color="orange"
        />
        {spouse && (
          <StatCard
            label="Spouse Sessions"
            value={spouse.sessionsPerMonth - spouse.sessionsUsed}
            sub={`${spouse.firstName} — ${spouse.sessionsUsed} used`}
            color="blue"
          />
        )}
        <StatCard
          label="Covered Gyms"
          value={nearbyGyms.length}
          sub="on your plan"
          color="green"
          icon={<MapPin size={18} />}
        />
      </div>

      {/* Benefit note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="text-blue-500 mt-0.5 flex-shrink-0">ℹ️</div>
        <div className="text-xs text-blue-700">
          <strong>Benefit Note:</strong> Only principal and spouse are covered. Each member must generate their own OTP.
          Sessions reset on {member.resetDate ? new Date(member.resetDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : 'next month 1st'}.
        </div>
      </div>

      {/* Monthly sessions visual */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-grey-5">Monthly Sessions</h2>
            <p className="text-xs text-grey-4 mt-0.5">{new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })} breakdown</p>
          </div>
          <Link to="/member/generate-otp">
            <button className="btn-primary flex items-center gap-2 text-xs">
              <QrCode size={14} /> Get OTP
            </button>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {sessionBubbles.map((used, i) => (
            <SessionBubble key={i} session={{ status: used ? 'CONFIRMED' : 'PENDING' } as Session} index={i} />
          ))}
        </div>
        {member.resetDate && (
          <p className="text-xs text-grey-4 mt-3 flex items-center gap-1">
            <Clock size={12} />
            Plan resets on {new Date(member.resetDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Recent activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-grey-5">Recent Activity</h2>
          <Link to="/member/sessions" className="text-xs text-brand-red hover:underline">View all</Link>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-grey-4">No sessions yet. Get your first OTP to visit a gym!</p>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <div key={session.id} className="flex items-center gap-3 py-2 border-b border-grey-2 last:border-0">
                <div className={`p-2 rounded-lg ${session.fwaFlagged ? 'bg-red-100' : 'bg-green-100'}`}>
                  {session.fwaFlagged ? (
                    <AlertTriangle size={14} className="text-red-600" />
                  ) : (
                    <CheckCircle2 size={14} className="text-green-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-grey-5 truncate">{session.provider.gymName}</div>
                  <div className="text-xs text-grey-4">
                    {new Date(session.sessionDate).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {session.whatsappVerified && <span className="ml-2 text-green-600">✓ WhatsApp verified</span>}
                  </div>
                </div>
                {statusBadge(session)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rate last visit */}
      {recentSessions[0] && !recentSessions[0].rating && recentSessions[0].status === 'CONFIRMED' && (
        <div className="card border-brand-orange/30 bg-orange-50">
          <h3 className="font-bold text-grey-5 mb-1">⭐ Rate Your Last Visit</h3>
          <p className="text-xs text-grey-4 mb-3">{recentSessions[0].provider.gymName} — How was your experience?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => rateMutation.mutate({ sessionId: recentSessions[0].id, rating: star })}
                disabled={rateMutation.isPending}
                className="text-2xl hover:scale-110 transition-transform disabled:opacity-50"
                title={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                <Star size={24} className="text-grey-3 hover:text-yellow-400 fill-current" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearby gyms */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-grey-5">Covered Gyms</h2>
          <Link to="/member/gyms" className="text-xs text-brand-red hover:underline">View all</Link>
        </div>

        {/* Mini map */}
        {MAPS_API_KEY && mapsLoaded ? (
          <div className="w-full h-48 rounded-xl overflow-hidden border border-grey-3 mb-4">
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={LAGOS}
              zoom={10}
              onLoad={onMapLoad}
              options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: false }}
            >
              {nearbyGyms
                .filter((g) => typeof g.latitude === 'number' && typeof g.longitude === 'number')
                .map((gym) => (
                  <Marker
                    key={gym.gymCode ?? gym.id ?? gym.gymName}
                    position={{ lat: gym.latitude as number, lng: gym.longitude as number }}
                    onClick={() => {
                      setActiveGym(gym);
                      mapRef.current?.panTo({ lat: gym.latitude as number, lng: gym.longitude as number });
                      mapRef.current?.setZoom(14);
                    }}
                    title={gym.gymName}
                  />
                ))}
            </GoogleMap>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nearbyGyms.slice(0, 6).map((gym) => {
            const key = gym.gymCode ?? gym.id ?? gym.gymName;
            const isActive = activeGym?.gymCode === gym.gymCode && activeGym?.id === gym.id;
            return (
              <div
                key={key}
                onClick={() => {
                  setActiveGym(gym);
                  if (typeof gym.latitude === 'number' && typeof gym.longitude === 'number') {
                    mapRef.current?.panTo({ lat: gym.latitude, lng: gym.longitude });
                    mapRef.current?.setZoom(14);
                  }
                }}
                className={`flex items-start gap-3 p-3 bg-grey-1 rounded-lg cursor-pointer transition-colors ${isActive ? 'ring-2 ring-brand-red bg-red-50' : 'hover:bg-grey-2'}`}
              >
                <div className="p-1.5 bg-brand-red/10 rounded text-brand-red flex-shrink-0">
                  <MapPin size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-grey-5 truncate">{gym.gymName}</div>
                  <div className="text-xs text-grey-4 mt-0.5 truncate">{gym.address ?? gym.location ?? ''}</div>
                  {gym.lga && <div className="text-xs text-grey-3">{gym.lga}{gym.state ? ` · ${gym.state}` : ''}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
