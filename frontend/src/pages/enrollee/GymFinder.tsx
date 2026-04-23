import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import { MapPin, Search, Clock, Dumbbell, RefreshCw } from 'lucide-react';

interface Gym {
  id: string;
  gymCode: string;
  gymName: string;
  location: string;
  address: string | null;
  lga: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  hours: Record<string, string> | null;
}

const amenityIcons: Record<string, string> = {
  pool: '🏊',
  sauna: '🧖',
  classes: '🏃',
  parking: '🅿️',
  cafe: '☕',
  spa: '💆',
  yoga: '🧘',
  weights: '🏋️',
  cardio: '🚴',
};

export default function EnrolleeGymFinder() {
  const [search, setSearch] = useState('');
  const [selectedLga, setSelectedLga] = useState('');

  const { data, isLoading } = useQuery<{ gyms: Gym[] }>({
    queryKey: ['gyms'],
    queryFn: () => apiClient.get('/member/gyms').then((r) => r.data),
  });

  const gyms = data?.gyms ?? [];
  const lgas = [...new Set(gyms.map((g) => g.lga))].sort();

  const filtered = useMemo(() => {
    return gyms.filter((g) => {
      const matchSearch = !search || g.gymName.toLowerCase().includes(search.toLowerCase()) || g.location.toLowerCase().includes(search.toLowerCase());
      const matchLga = !selectedLga || g.lga === selectedLga;
      return matchSearch && matchLga;
    });
  }, [gyms, search, selectedLga]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Find a Gym</h1>
        <p className="text-sm text-grey-4 mt-1">Browse all {gyms.length} covered gyms in our network</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by gym name or area..."
            className="w-full pl-9 pr-4 py-2.5 border border-grey-3 rounded-xl text-sm focus:outline-none focus:border-brand-red transition-colors"
          />
        </div>
        <select
          value={selectedLga}
          onChange={(e) => setSelectedLga(e.target.value)}
          className="border border-grey-3 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-red bg-white"
        >
          <option value="">All LGAs</option>
          {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
        </select>
      </div>

      {/* Map placeholder — Google Maps API key needed for live embed */}
      <div className="w-full h-48 bg-grey-2 rounded-xl flex items-center justify-center border border-grey-3">
        <div className="text-center text-grey-4">
          <MapPin size={24} className="mx-auto mb-2 text-grey-3" />
          <p className="text-sm font-semibold">Map View</p>
          <p className="text-xs">Configure GOOGLE_MAPS_API_KEY to enable interactive map</p>
        </div>
      </div>

      <p className="text-xs text-grey-4">{filtered.length} gym{filtered.length !== 1 ? 's' : ''} found</p>

      {/* Gym list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-grey-4 text-sm">No gyms match your search.</div>
        ) : (
          filtered.map((gym) => (
            <div key={gym.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-brand-red/10 rounded-lg flex-shrink-0">
                  <Dumbbell size={16} className="text-brand-red" />
                </div>
                <div>
                  <h3 className="font-bold text-grey-5">{gym.gymName}</h3>
                  <div className="flex items-center gap-1 text-xs text-grey-4 mt-0.5">
                    <MapPin size={11} /> {gym.location} · {gym.lga}
                  </div>
                </div>
                <span className="ml-auto text-xs font-mono text-grey-4 bg-grey-1 px-2 py-0.5 rounded-full">{gym.gymCode}</span>
              </div>

              {gym.address && (
                <p className="text-xs text-grey-4 mb-3">{gym.address}</p>
              )}

              {/* Hours */}
              {gym.hours && (
                <div className="flex items-center gap-1.5 text-xs text-grey-4 mb-3">
                  <Clock size={11} />
                  <span>{typeof gym.hours === 'object' && gym.hours['weekday'] ? gym.hours['weekday'] : 'Hours vary'}</span>
                </div>
              )}

              {/* Amenities */}
              {gym.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gym.amenities.map((a) => (
                    <span key={a} className="text-xs bg-grey-1 text-grey-5 px-2 py-0.5 rounded-full">
                      {amenityIcons[a] ?? '•'} {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
