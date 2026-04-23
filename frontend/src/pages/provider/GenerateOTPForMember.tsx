import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { QrCode, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface GenOtpResponse {
  otp: string;
  expiresAt: string;
  note: string;
  member: { name: string; ref: string };
}

export default function ProviderGenerateOTP() {
  const [memberRef, setMemberRef] = useState('');
  const [result, setResult] = useState<GenOtpResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  const generateMutation = useMutation({
    mutationFn: (ref: string) =>
      apiClient.post<GenOtpResponse>('/provider/generate-otp-for-member', { memberRef: ref }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      toast.success('OTP generated for member');
      startCountdown(new Date(data.expiresAt));
    },
    onError: (err: { response?: { data?: { code?: string; error?: string } } }) => {
      const code = err.response?.data?.code;
      if (code === 'SESSION_LIMIT_REACHED') toast.error('Member has reached their monthly limit');
      else if (code === 'NOT_FOUND') toast.error('Member not found or inactive');
      else toast.error(err.response?.data?.error ?? 'Could not generate OTP');
    },
  });

  function startCountdown(expiresAt: Date) {
    const tick = () => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(() => { tick(); if (Date.now() >= expiresAt.getTime()) clearInterval(id); }, 1000);
  }

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Generate OTP for Member</h1>
        <p className="text-sm text-grey-4 mt-1">
          Use only when a member is physically present but unable to self-generate their OTP (e.g. no smartphone).
          This is automatically flagged in the audit trail.
        </p>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-orange-700">
          <strong>Audit Notice:</strong> Provider-generated OTPs are permanently logged against your gym code,
          the member's ID, timestamp, and your session. Misuse will trigger an FWA investigation.
        </div>
      </div>

      {!result ? (
        <div className="card space-y-4">
          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">Member ID / Reference</label>
            <input
              type="text"
              value={memberRef}
              onChange={(e) => setMemberRef(e.target.value.toUpperCase())}
              placeholder="e.g. 21000645/0 or LWH-004822"
              className="w-full px-4 py-3 border border-grey-3 rounded-xl text-sm font-mono focus:outline-none focus:border-brand-red transition-colors"
              autoComplete="off" maxLength={30}
            />
          </div>
          <div className="bg-grey-1 rounded-lg p-3 text-xs text-grey-4">
            The member must be physically present. The OTP will also be sent to their registered number.
          </div>
          <button
            onClick={() => generateMutation.mutate(memberRef.trim())}
            disabled={generateMutation.isPending || !memberRef.trim()}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {generateMutation.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Generating...</>
            ) : (
              <><QrCode size={16} /> Generate OTP for Member</>
            )}
          </button>
        </div>
      ) : (
        <div className="card border-green-200 bg-green-50 space-y-5 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-green-600" />
            <div>
              <h2 className="font-bold text-green-800">OTP Generated</h2>
              <p className="text-xs text-green-600">{result.member.name} · {result.member.ref}</p>
            </div>
          </div>

          <div className="text-center py-5">
            <div className="text-6xl font-bold font-mono tracking-widest text-brand-navy">{result.otp}</div>
            <p className="text-sm text-grey-4 mt-3">Enter this in the Validate Session screen</p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-orange-600">
            <Clock size={14} /><span>Expires in: <strong className="font-mono">{timeLeft}</strong></span>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
            ⚠️ {result.note}
          </div>

          <button onClick={() => { setResult(null); setMemberRef(''); }} className="w-full btn-secondary text-sm">
            Generate for Another Member
          </button>
        </div>
      )}
    </div>
  );
}
