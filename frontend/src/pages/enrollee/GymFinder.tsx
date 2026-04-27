import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import apiClient from '../../lib/apiClient';
import { MapPin, Search, Clock, Dumbbell, RefreshCw, Phone } from 'lucide-react';

interface Gym {
  gymCode: string;
  gymName: string;
  state: string;
  lga: string;
  address: string;
  phone?: string | null;
  id?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  amenities?: string[];
  hours?: Record<string, string> | null;
}

const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const amenityIcons: Record<string, string> = {
  pool: '🏊', sauna: '🧖', classes: '🏃', parking: '🅿️',
  cafe: '☕', spa: '💆', yoga: '🧘', weights: '🏋️', cardio: '🚴',
};

export default function EnrolleeGymFinder() {
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedLga, setSelectedLga] = useState('');
  const [activeGymCode, setActiveGymCode] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(LAGOS_CENTER);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [infoWindowGym, setInfoWindowGym] = useState<Gym | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: MAPS_API_KEY ?? '',
  });

  const { data, isLoading } = useQuery<{ gyms: Gym[]; source: 'prognosis' | 'local' }>({
    queryKey: ['gyms'],
    queryFn: () => apiClient.get('/member/gyms').then((r) => r.data),
  });

  const gyms = data?.gyms ?? [];

  // Request geolocation once on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setMapCenter(loc);
      },
      () => { /* denied or unavailable — stay on Lagos default */ },
    );
  }, []);

  const states = [...new Set(gyms.map((g) => g.state).filter(Boolean))].sort();
  const lgas = [...new Set(
    gyms.filter((g) => !selectedState || g.state === selectedState).map((g) => g.lga).filter(Boolean),
  )].sort();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return gyms.filter((g) => {
      const matchSearch = !q ||
        g.gymName.toLowerCase().includes(q) ||
        (g.address || g.location || '').toLowerCase().includes(q) ||
        g.lga.toLowerCase().includes(q);
      const matchState = !selectedState || g.state === selectedState;
      const matchLga = !selectedLga || g.lga === selectedLga;
      return matchSearch && matchState && matchLga;
    });
  }, [gyms, search, selectedState, selectedLga]);

  const mappableGyms = filtered.filter(
    (g) => typeof g.latitude === 'number' && typeof g.longitude === 'number',
  );

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleMarkerClick = (gym: Gym) => {
    setActiveGymCode(gym.gymCode);
    setInfoWindowGym(gym);
    const key = gym.gymCode || gym.id || gym.gymName;
    cardRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleCardClick = (gym: Gym) => {
    const key = gym.gymCode || gym.id || gym.gymName;
    setActiveGymCode(gym.gymCode);
    if (typeof gym.latitude === 'number' && typeof gym.longitude === 'number') {
      mapRef.current?.panTo({ lat: gym.latitude, lng: gym.longitude });
      mapRef.current?.setZoom(15);
      setInfoWindowGym(gym);
    }
    cardRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw size={24} className="animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Find a Gym</h1>
        <p className="text-sm text-grey-4 mt-1">
          {gyms.length} covered gym{gyms.length !== 1 ? 's' : ''} on your plan
          {data?.source === 'local' && <span className="ml-1 text-xs text-grey-3">(local data)</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, area or LGA..."
            className="w-full pl-9 pr-4 py-2.5 border border-grey-3 rounded-xl text-sm focus:outline-none focus:border-brand-red transition-colors"
          />
        </div>
        <select
          value={selectedState}
          onChange={(e) => { setSelectedState(e.target.value); setSelectedLga(''); }}
          className="border border-grey-3 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-red bg-white"
        >
          <option value="">All States</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={selectedLga}
          onChange={(e) => setSelectedLga(e.target.value)}
          className="border border-grey-3 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-red bg-white"
          disabled={lgas.length === 0}
        >
          <option value="">All LGAs</option>
          {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
        </select>
      </div>

      {/* Map */}
      {MAPS_API_KEY && mapsLoaded ? (
        <div className="w-full h-72 rounded-xl overflow-hidden border border-grey-3">
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter}
            zoom={userLocation ? 12 : 10}
            onLoad={onMapLoad}
            options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
          >
            {/* User location dot */}
            {userLocation && (
              <Marker
                position={userLocation}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
                title="Your location"
              />
            )}

            {/* Gym markers */}
            {mappableGyms.map((gym) => (
              <Marker
                key={gym.gymCode || gym.id || gym.gymName}
                position={{ lat: gym.latitude as number, lng: gym.longitude as number }}
                onClick={() => handleMarkerClick(gym)}
                icon={{
                  url: activeGymCode === gym.gymCode
                    ? 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
                    : 'http://maps.google.com/mapfiles/ms/icons/red.png',
                }}
                title={gym.gymName}
              />
            ))}

            {/* Info window on active marker */}
            {infoWindowGym && typeof infoWindowGym.latitude === 'number' && typeof infoWindowGym.longitude === 'number' && (
              <InfoWindow
                position={{ lat: infoWindowGym.latitude, lng: infoWindowGym.longitude }}
                onCloseClick={() => { setInfoWindowGym(null); setActiveGymCode(null); }}
              >
                <div className="text-sm max-w-[200px]">
                  <p className="font-semibold text-grey-5">{infoWindowGym.gymName}</p>
                  {infoWindowGym.address && <p className="text-grey-4 text-xs mt-0.5">{infoWindowGym.address}</p>}
                  {infoWindowGym.phone && <p className="text-grey-4 text-xs">{infoWindowGym.phone}</p>}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>
      ) : !MAPS_API_KEY ? (
        <div className="w-full h-48 bg-grey-2 rounded-xl flex items-center justify-center border border-grey-3">
          <div className="text-center text-grey-4">
            <MapPin size={24} className="mx-auto mb-2 text-grey-3" />
            <p className="text-sm font-semibold">Map View</p>
            <p className="text-xs">Set VITE_GOOGLE_MAPS_API_KEY to enable</p>
          </div>
        </div>
      ) : (
        <div className="w-full h-48 bg-grey-2 rounded-xl flex items-center justify-center border border-grey-3">
          <RefreshCw size={20} className="animate-spin text-grey-3" />
        </div>
      )}

      <p className="text-xs text-grey-4">{filtered.length} gym{filtered.length !== 1 ? 's' : ''} found</p>

      {/* Gym list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-grey-4 text-sm">No gyms match your search.</div>
        ) : (
          filtered.map((gym, i) => {
            const key = gym.gymCode || gym.id || gym.gymName || String(i);
            const isActive = activeGymCode === gym.gymCode;
            return (
              <div
                key={key}
                ref={(el) => { cardRefs.current[key] = el; }}
                onClick={() => handleCardClick(gym)}
                className={`card hover:shadow-md transition-shadow cursor-pointer ${isActive ? 'ring-2 ring-brand-red' : ''}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 bg-brand-red/10 rounded-lg flex-shrink-0">
                    <Dumbbell size={16} className="text-brand-red" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-grey-5 truncate">{gym.gymName}</h3>
                    <div className="flex items-center gap-1 text-xs text-grey-4 mt-0.5">
                      <MapPin size={11} />
                      <span className="truncate">{gym.address || gym.location || '—'}</span>
                      {gym.lga && <span>· {gym.lga}</span>}
                      {gym.state && <span>· {gym.state}</span>}
                    </div>
                  </div>
                  {gym.gymCode && (
                    <span className="flex-shrink-0 text-xs font-mono text-grey-4 bg-grey-1 px-2 py-0.5 rounded-full">
                      {gym.gymCode}
                    </span>
                  )}
                </div>

                {gym.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-grey-4 mb-2">
                    <Phone size={11} />
                    <span>{gym.phone}</span>
                  </div>
                )}

                {gym.hours && (
                  <div className="flex items-center gap-1.5 text-xs text-grey-4 mb-2">
                    <Clock size={11} />
                    <span>{typeof gym.hours === 'object' && gym.hours['weekday'] ? gym.hours['weekday'] : 'Hours vary'}</span>
                  </div>
                )}

                {gym.amenities && gym.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {gym.amenities.map((a) => (
                      <span key={a} className="text-xs bg-grey-1 text-grey-5 px-2 py-0.5 rounded-full">
                        {amenityIcons[a] ?? '•'} {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
