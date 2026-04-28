import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { QrCode, Loader2, Clock, CheckCircle2, Search, MapPin, X } from 'lucide-react';

interface Gym {
  gymCode: string;
  gymName: string;
  address?: string;
  location?: string;
  lga?: string;
  state?: string;
}

interface OtpResponse {
  otp: string;
  expiresAt: string;
  gym: { name: string; code: string };
  message: string;
}

export default function EnrolleeGenerateOTP() {
  const [search, setSearch] = useState('');
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [result, setResult] = useState<OtpResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  const { data: gymsData, isLoading: gymsLoading } = useQuery<{ gyms: Gym[] }>({
    queryKey: ['gyms'],
    queryFn: () => apiClient.get('/member/gyms').then((r) => r.data),
  });

  const gyms = gymsData?.gyms ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return gyms.slice(0, 20);
    return gyms.filter(
      (g) =>
        g.gymName.toLowerCase().includes(q) ||
        (g.address || g.location || '').toLowerCase().includes(q) ||
        (g.lga || '').toLowerCase().includes(q),
    ).slice(0, 20);
  }, [gyms, search]);

  const generateMutation = useMutation({
    mutationFn: (gymCode: string) =>
      apiClient.post<OtpResponse>('/member/generate-otp', { gymCode }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Session OTP generated!');
      startCountdown(new Date(data.expiresAt));
    },
    onError: (err: { response?: { data?: { code?: string; error?: string; nextResetDate?: string } } }) => {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.error;
      if (code === 'SESSION_LIMIT_REACHED') toast.error(msg ?? 'Weekly session limit reached. Resets Sunday.');
      else if (code === 'GYM_NOT_FOUND') toast.error('This gym is not yet registered in the portal.');
      else if (code === 'UPSTREAM_ERROR') toast.error(msg ?? 'Unable to generate OTP right now. Please try again.');
      else if (code === 'OTP_TOO_FREQUENT') toast.error('Please wait before generating another OTP.');
      else toast.error(msg ?? 'Could not generate OTP');
    },
  });

  function startCountdown(expiresAt: Date) {
    const update = () => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    update();
    const interval = setInterval(() => { update(); if (Date.now() >= expiresAt.getTime()) clearInterval(interval); }, 1000);
  }

  if (result) {
    return (
      <div className="max-w-lg space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-grey-5">Get Session OTP</h1>
        </div>
        <div className="card border-green-200 bg-green-50 space-y-5 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-xl">
              <CheckCircle2 size={24} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-bold text-green-800">OTP Generated!</h2>
              <p className="text-xs text-green-600">{result.gym.name}</p>
            </div>
          </div>

          <div className="text-center py-6">
            <div className="text-6xl font-bold font-mono tracking-widest text-brand-navy">
              {result.otp}
            </div>
            <p className="text-sm text-grey-4 mt-3">Show this code to the gym receptionist</p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-orange-600">
            <Clock size={14} />
            <span>Expires in: <strong className="font-mono">{timeLeft}</strong></span>
          </div>

          <div className="bg-white rounded-xl p-4 text-xs text-grey-4 space-y-1">
            <p>✓ This OTP can only be used once</p>
            <p>✓ Valid for 2 hours from generation</p>
            <p>✓ Your session will be confirmed via WhatsApp</p>
          </div>

          <button
            onClick={() => { setResult(null); setSelectedGym(null); setSearch(''); }}
            className="w-full btn-secondary text-sm"
          >
            Generate Another OTP
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Get Session OTP</h1>
        <p className="text-sm text-grey-4 mt-1">
          Search for your gym, select it, then generate your OTP.
        </p>
      </div>

      <div className="card space-y-5">
        {/* Gym search */}
        {!selectedGym ? (
          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">
              Search Gym
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type gym name or area..."
                className="w-full pl-9 pr-4 py-3 border border-grey-3 rounded-xl text-sm focus:outline-none focus:border-brand-red transition-colors"
                autoComplete="off"
              />
            </div>

            {gymsLoading && (
              <p className="text-xs text-grey-4 mt-2 text-center">Loading gyms...</p>
            )}

            {search && filtered.length === 0 && !gymsLoading && (
              <p className="text-xs text-grey-4 mt-2 text-center">No gyms found matching "{search}"</p>
            )}

            {filtered.length > 0 && (
              <div className="mt-2 max-h-64 overflow-y-auto border border-grey-2 rounded-xl divide-y divide-grey-2">
                {filtered.map((gym) => (
                  <button
                    key={gym.gymCode}
                    onClick={() => { setSelectedGym(gym); setSearch(''); }}
                    className="w-full flex items-start gap-3 p-3 text-left hover:bg-grey-1 transition-colors"
                  >
                    <div className="p-1.5 bg-brand-red/10 rounded text-brand-red flex-shrink-0 mt-0.5">
                      <MapPin size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-grey-5 truncate">{gym.gymName}</p>
                      <p className="text-xs text-grey-4 truncate">
                        {gym.address || gym.location || ''}
                        {gym.lga ? ` · ${gym.lga}` : ''}
                        {gym.state ? ` · ${gym.state}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">
              Selected Gym
            </label>
            <div className="flex items-start gap-3 p-3 border border-brand-red rounded-xl bg-red-50">
              <div className="p-1.5 bg-brand-red/10 rounded text-brand-red flex-shrink-0">
                <MapPin size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-grey-5">{selectedGym.gymName}</p>
                <p className="text-xs text-grey-4">
                  {selectedGym.address || selectedGym.location || ''}
                  {selectedGym.lga ? ` · ${selectedGym.lga}` : ''}
                </p>
                <p className="text-xs font-mono text-grey-3 mt-0.5">{selectedGym.gymCode}</p>
              </div>
              <button onClick={() => setSelectedGym(null)} className="text-grey-3 hover:text-grey-5 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => selectedGym && generateMutation.mutate(selectedGym.gymCode)}
          disabled={generateMutation.isPending || !selectedGym}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          {generateMutation.isPending ? (
            <><Loader2 size={16} className="animate-spin" /> Generating...</>
          ) : (
            <><QrCode size={16} /> Generate OTP</>
          )}
        </button>

        <p className="text-xs text-grey-4 text-center">
          OTP is valid for 2 hours and can only be used once.
        </p>
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 text-sm mb-2">How it works</h3>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Search for your gym by name or area</li>
          <li>Select the gym from the list</li>
          <li>Tap "Generate OTP" — the code is issued by your insurer</li>
          <li>Show the 6-digit code to the gym receptionist</li>
          <li>Receptionist validates it and you receive a WhatsApp confirmation</li>
        </ol>
      </div>
    </div>
  );
}
