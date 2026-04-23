import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { QrCode, Loader2, Clock, CheckCircle2, MapPin } from 'lucide-react';

interface OtpResponse {
  otp: string;
  expiresAt: string;
  gym: { name: string; code: string };
  message: string;
}

export default function EnrolleeGenerateOTP() {
  const [gymCode, setGymCode] = useState('');
  const [result, setResult] = useState<OtpResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  const generateMutation = useMutation({
    mutationFn: (gymCode: string) =>
      apiClient.post<OtpResponse>('/member/generate-otp', { gymCode }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Session OTP generated!');
      startCountdown(new Date(data.expiresAt));
    },
    onError: (err: { response?: { data?: { code?: string; error?: string } } }) => {
      const code = err.response?.data?.code;
      if (code === 'SESSION_LIMIT_REACHED') toast.error('Monthly session limit reached');
      else if (code === 'GYM_NOT_FOUND') toast.error('Gym code not found. Check and try again.');
      else if (code === 'OTP_TOO_FREQUENT') toast.error('Please wait before generating another OTP');
      else toast.error(err.response?.data?.error ?? 'Could not generate OTP');
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

  const commonGyms = [
    { code: 'GYM-001', name: 'iFitness Lekki' },
    { code: 'GYM-002', name: 'EkoFit V.I.' },
    { code: 'GYM-003', name: 'FitnessOne Ikeja' },
  ];

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Get Session OTP</h1>
        <p className="text-sm text-grey-4 mt-1">
          Generate a one-time code to validate your gym visit. Show it to the receptionist.
        </p>
      </div>

      {!result ? (
        <div className="card space-y-5">
          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">
              Gym Code
            </label>
            <input
              type="text"
              value={gymCode}
              onChange={(e) => setGymCode(e.target.value.toUpperCase())}
              placeholder="e.g. GYM-001"
              maxLength={20}
              className="w-full px-4 py-3 border border-grey-3 rounded-xl text-sm font-mono
                         focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red/20 transition-all"
              autoComplete="off"
            />
          </div>

          {/* Quick select gym */}
          <div>
            <p className="text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">Quick Select</p>
            <div className="space-y-2">
              {commonGyms.map((gym) => (
                <button
                  key={gym.code}
                  onClick={() => setGymCode(gym.code)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm
                    ${gymCode === gym.code
                      ? 'border-brand-red bg-red-50 text-brand-red'
                      : 'border-grey-2 hover:border-grey-3 hover:bg-grey-1'
                    }`}
                >
                  <MapPin size={14} className="flex-shrink-0" />
                  <div>
                    <span className="font-semibold">{gym.name}</span>
                    <span className="text-xs text-grey-4 ml-2 font-mono">{gym.code}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => generateMutation.mutate(gymCode)}
            disabled={generateMutation.isPending || !gymCode.trim()}
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
      ) : (
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
            <div className="text-6xl font-bold font-mono tracking-widest text-brand-navy letter-spacing-wider">
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
            onClick={() => { setResult(null); setGymCode(''); }}
            className="w-full btn-secondary text-sm"
          >
            Generate Another OTP
          </button>
        </div>
      )}

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 text-sm mb-2">How it works</h3>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Select or enter your gym code</li>
          <li>Generate your OTP above</li>
          <li>Show the 6-digit code to the gym receptionist</li>
          <li>Receptionist validates it in their portal</li>
          <li>You receive a WhatsApp confirmation</li>
        </ol>
      </div>
    </div>
  );
}
