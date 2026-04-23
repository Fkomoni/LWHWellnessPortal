import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { UserCheck, Loader2, CheckCircle2, XCircle, Calendar } from 'lucide-react';

interface EligibilityResponse {
  eligible: boolean;
  reason?: string;
  member?: {
    name: string;
    memberRef: string;
    sessionsRemaining: number;
    sessionsPerMonth: number;
    resetDate: string | null;
  };
}

export default function ProviderEligibility() {
  const [memberRef, setMemberRef] = useState('');
  const [result, setResult] = useState<EligibilityResponse | null>(null);

  const checkMutation = useMutation({
    mutationFn: (ref: string) =>
      apiClient.post<EligibilityResponse>('/provider/check-eligibility', { memberRef: ref }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      if (!data.eligible) toast.error('Member is not eligible for a session');
    },
    onError: () => toast.error('Could not check eligibility. Try again.'),
  });

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Check Member Eligibility</h1>
        <p className="text-sm text-grey-4 mt-1">Verify coverage before accepting a session.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">
            Member ID / Reference
          </label>
          <input
            type="text"
            value={memberRef}
            onChange={(e) => { setMemberRef(e.target.value.toUpperCase()); setResult(null); }}
            placeholder="e.g. 21000645/0 or LWH-004822"
            onKeyDown={(e) => e.key === 'Enter' && memberRef.trim() && checkMutation.mutate(memberRef.trim())}
            className="w-full px-4 py-3 border border-grey-3 rounded-xl text-sm font-mono
                       focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red/20 transition-all"
            autoComplete="off"
            maxLength={30}
          />
        </div>
        <button
          onClick={() => checkMutation.mutate(memberRef.trim())}
          disabled={checkMutation.isPending || !memberRef.trim()}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          {checkMutation.isPending ? (
            <><Loader2 size={16} className="animate-spin" /> Checking...</>
          ) : (
            <><UserCheck size={16} /> Check Eligibility</>
          )}
        </button>
      </div>

      {result && (
        <div className={`card animate-slide-up border-2 ${result.eligible ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-xl ${result.eligible ? 'bg-green-100' : 'bg-red-100'}`}>
              {result.eligible ? (
                <CheckCircle2 size={24} className="text-green-600" />
              ) : (
                <XCircle size={24} className="text-red-600" />
              )}
            </div>
            <div>
              <h2 className={`font-bold ${result.eligible ? 'text-green-800' : 'text-red-800'}`}>
                {result.eligible ? 'Member is Eligible ✅' : 'Not Eligible ❌'}
              </h2>
              {!result.eligible && result.reason && (
                <p className="text-sm text-red-600">{result.reason}</p>
              )}
            </div>
          </div>

          {result.member && (
            <div className="bg-white rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-grey-5">{result.member.name}</span>
                <span className="text-xs font-mono text-grey-4">{result.member.memberRef}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-grey-1 rounded-lg">
                  <div className="text-2xl font-bold text-brand-red">{result.member.sessionsRemaining}</div>
                  <div className="text-xs text-grey-4 mt-0.5">Sessions remaining</div>
                </div>
                <div className="text-center p-3 bg-grey-1 rounded-lg">
                  <div className="text-2xl font-bold text-grey-5">{result.member.sessionsPerMonth}</div>
                  <div className="text-xs text-grey-4 mt-0.5">Monthly allowance</div>
                </div>
              </div>
              {result.member.resetDate && (
                <div className="flex items-center gap-2 text-xs text-grey-4">
                  <Calendar size={12} />
                  Resets: {new Date(result.member.resetDate).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
