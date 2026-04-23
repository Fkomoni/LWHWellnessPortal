import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';
import OTPInput from '../../components/ui/OTPInput';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, Loader2, CheckSquare } from 'lucide-react';
import axios from 'axios';

interface ValidateResponse {
  message: string;
  session: { id: string; memberName: string; status: string };
}

export default function ProviderValidateSession() {
  const [memberId, setMemberId] = useState('');
  const [otp, setOtp] = useState('');
  const [result, setResult] = useState<'success' | 'failure' | null>(null);
  const [resultData, setResultData] = useState<ValidateResponse | null>(null);

  const validateMutation = useMutation({
    mutationFn: () => apiClient.post<ValidateResponse>('/provider/validate-session', { otp, memberId }).then((r) => r.data),
    onSuccess: (data) => {
      setResult('success');
      setResultData(data);
      toast.success('Session validated successfully!');
    },
    onError: (err) => {
      setResult('failure');
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        if (code === 'OTP_INVALID') toast.error('OTP is invalid or expired');
        else if (code === 'MEMBER_NOT_FOUND') toast.error('Member not found or inactive');
        else if (code === 'SESSION_LIMIT_REACHED') toast.error('Member has reached their monthly limit');
        else toast.error('Validation failed. Please try again.');
      }
    },
  });

  const reset = () => {
    setMemberId('');
    setOtp('');
    setResult(null);
    setResultData(null);
  };

  return (
    <div className="max-w-lg space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-grey-5">Validate Member Session</h1>
        <p className="text-sm text-grey-4 mt-1">
          Enter the member ID and the 6-digit OTP they provide to confirm their gym visit.
        </p>
      </div>

      {!result ? (
        <div className="card space-y-5">
          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-2">
              Member ID / Reference
            </label>
            <input
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value.toUpperCase())}
              placeholder="e.g. 21000645/0 or LWH-004822"
              className="w-full px-4 py-3 border border-grey-3 rounded-xl text-sm font-mono
                         focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red/20 transition-all"
              autoComplete="off"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-grey-4 uppercase tracking-wider mb-3">
              Member's OTP
            </label>
            <OTPInput value={otp} onChange={setOtp} disabled={validateMutation.isPending} />
          </div>

          <button
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending || otp.length !== 6 || !memberId.trim()}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {validateMutation.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Validating...</>
            ) : (
              <><CheckSquare size={16} /> Validate Session</>
            )}
          </button>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-700">
              <strong>Important:</strong> The member must show you their OTP — do not generate OTPs on behalf of members.
              Any mismatch triggers an automatic FWA investigation.
            </p>
          </div>
        </div>
      ) : result === 'success' && resultData ? (
        <div className="card border-green-200 bg-green-50 space-y-5 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-xl">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-bold text-green-800 text-lg">Session Confirmed!</h2>
              <p className="text-sm text-green-600">{resultData.session.memberName}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-grey-4">Session ID</span>
              <span className="font-mono text-xs">{resultData.session.id.slice(0, 12)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-4">Status</span>
              <span className="badge-confirmed">{resultData.session.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-4">WhatsApp</span>
              <span className="text-xs text-orange-600">Confirmation pending...</span>
            </div>
          </div>
          <p className="text-xs text-green-700">
            A WhatsApp confirmation has been sent to the member. The session has been logged and a claim created automatically.
          </p>
          <button onClick={reset} className="w-full btn-primary">Validate Another Session</button>
        </div>
      ) : (
        <div className="card border-red-200 bg-red-50 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-xl">
              <XCircle size={28} className="text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-red-800">Validation Failed</h2>
              <p className="text-sm text-red-600">OTP could not be verified</p>
            </div>
          </div>
          <p className="text-xs text-red-700">
            Please ask the member to regenerate their OTP from the Member Portal and try again.
            Multiple failed attempts may trigger an FWA review.
          </p>
          <button onClick={reset} className="w-full btn-secondary">Try Again</button>
        </div>
      )}
    </div>
  );
}
