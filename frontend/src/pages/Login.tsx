import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Role, User } from '../types';
import { useAuthStore } from '../store/authStore';
import OTPInput from '../components/ui/OTPInput';
import { Dumbbell, UserCircle, Shield, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import apiClient from '../lib/apiClient';

// ENROLLEE: Member ID + DOB. PROVIDER: email + password [+ OTP]. ADVOCATE: phone + OTP.
type Step = 'role' | 'dob' | 'email-password' | 'provider-otp' | 'phone' | 'otp';

const roles: Array<{ value: Role; icon: React.ReactNode; label: string; sub: string; description: string }> = [
  {
    value: 'ENROLLEE',
    icon: <UserCircle size={28} />,
    label: 'Member',
    sub: 'Member Portal',
    description: 'Access your gym sessions, generate OTPs, and view your wellness activity',
  },
  {
    value: 'PROVIDER',
    icon: <Dumbbell size={28} />,
    label: 'Gym Partner',
    sub: 'Gym Portal',
    description: 'Validate member sessions, check eligibility, and manage your claims',
  },
  {
    value: 'ADVOCATE',
    icon: <Shield size={28} />,
    label: 'Advocate',
    sub: 'Internal Portal',
    description: 'Leadway staff — member 360° view, FWA investigation, and utilisation reports',
  },
];

const redirectMap: Record<Role, string> = {
  ENROLLEE: '/member/dashboard',
  PROVIDER: '/provider/dashboard',
  ADVOCATE: '/advocate/dashboard',
};

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState<Step>('role');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // ENROLLEE fields
  const [memberRef, setMemberRef] = useState('');
  const [dob, setDob] = useState('');

  // PROVIDER fields
  const [providerEmail, setProviderEmail] = useState('');
  const [providerPassword, setProviderPassword] = useState('');
  const [providerOtp, setProviderOtp] = useState('');

  // ADVOCATE fields
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // ── ENROLLEE: Member ID + DOB ─────────────────────────────────────────────

  const loginDobMutation = useMutation({
    mutationFn: async ({ memberRef, dob }: { memberRef: string; dob: string }) => {
      const { data } = await apiClient.post('/auth/login-dob', { memberRef, dob });
      return data as { accessToken: string; user: User };
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      toast.success(`Welcome back, ${data.user.firstName}!`);
      navigate(redirectMap[data.user.role]);
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code as string | undefined;
        if (code === 'RATE_LIMIT_EXCEEDED') {
          toast.error('Too many attempts. Please wait 15 minutes.');
        } else if (code === 'UPSTREAM_ERROR') {
          toast.error('Authentication service temporarily unavailable. Please try again.');
        } else {
          toast.error('Invalid Member ID or date of birth. Please check and try again.');
        }
      } else {
        toast.error('Network error. Please try again.');
      }
    },
  });

  const handleDobLogin = () => {
    if (!memberRef.trim() || !dob) return;
    loginDobMutation.mutate({ memberRef: memberRef.trim(), dob });
  };

  // ── PROVIDER: Email + Password via Prognosis ─────────────────────────────

  const providerLoginMutation = useMutation({
    mutationFn: async ({ email, password, otp }: { email: string; password: string; otp?: string }) => {
      const { data } = await apiClient.post('/auth/provider-login', { email, password, ...(otp ? { otp } : {}) });
      return data as { accessToken?: string; user?: User; needsOtp?: boolean; message?: string };
    },
    onSuccess: (data) => {
      if (data.needsOtp) {
        setStep('provider-otp');
        toast.success(data.message ?? 'OTP sent to your registered contact.');
        return;
      }
      if (data.accessToken && data.user) {
        setAuth(data.user, data.accessToken);
        toast.success(`Welcome, ${data.user.gymName}!`);
        navigate(redirectMap[data.user.role]);
      }
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code as string | undefined;
        if (code === 'INVALID_CREDENTIALS') toast.error(err.response?.data?.error ?? 'Invalid credentials. Please try again.');
        else if (code === 'PROVIDER_NOT_FOUND') toast.error('Gym not registered in the portal. Contact Leadway Health.');
        else if (code === 'UPSTREAM_ERROR') toast.error('Authentication service temporarily unavailable.');
        else toast.error(err.response?.data?.error ?? 'Login failed');
      } else {
        toast.error('Network error. Please try again.');
      }
    },
  });

  const handleProviderLogin = () => {
    if (!providerEmail.trim() || !providerPassword) return;
    providerLoginMutation.mutate({ email: providerEmail.trim(), password: providerPassword });
  };

  const handleProviderOtp = () => {
    if (providerOtp.length !== 5) return;
    providerLoginMutation.mutate({ email: providerEmail.trim(), password: providerPassword, otp: providerOtp });
  };

  // ── Provider / Advocate: Phone + OTP ─────────────────────────────────────

  const requestOtpMutation = useMutation({
    mutationFn: async ({ phone, role }: { phone: string; role: Role }) => {
      const { data } = await apiClient.post('/auth/request-otp', { phone, role });
      return data as { message: string; expiresAt: string; _devOtp?: string };
    },
    onSuccess: (data) => {
      toast.success('OTP sent to your registered number');
      setStep('otp');
      if (data._devOtp) {
        setDevOtp(data._devOtp);
        toast('Dev mode: OTP is ' + data._devOtp, { icon: '🔧', duration: 10000 });
      }
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code as string | undefined;
        if (code === 'RATE_LIMIT_EXCEEDED') toast.error('Too many attempts. Please wait 15 minutes.');
        else if (code === 'OTP_TOO_FREQUENT') toast.error('Please wait 60 seconds before requesting another OTP.');
        else toast.error(err.response?.data?.error ?? 'Failed to send OTP');
      } else {
        toast.error('Network error. Please try again.');
      }
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phone, otp, role }: { phone: string; otp: string; role: Role }) => {
      const { data } = await apiClient.post('/auth/verify-otp', { phone, otp, role });
      return data as { accessToken: string; user: User };
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      toast.success(`Welcome back, ${data.user.firstName}!`);
      navigate(redirectMap[data.user.role]);
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code as string | undefined;
        if (code === 'MAX_ATTEMPTS') toast.error('Too many failed attempts. Request a new OTP.');
        else toast.error('Invalid OTP. Please check and try again.');
      }
      setOtp('');
    },
  });

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    if (role === 'ENROLLEE') setStep('dob');
    else if (role === 'PROVIDER') setStep('email-password');
    else setStep('phone');
  };

  const handleRequestOtp = () => {
    if (!selectedRole) return;
    const cleaned = phone.trim();
    if (!cleaned) { toast.error('Enter your phone number'); return; }
    requestOtpMutation.mutate({ phone: cleaned, role: selectedRole });
  };

  const handleVerifyOtp = () => {
    if (!selectedRole || otp.length !== 6) return;
    verifyOtpMutation.mutate({ phone: phone.trim(), otp, role: selectedRole });
  };

  const selectedRoleMeta = roles.find((r) => r.value === selectedRole);

  return (
    <div className="min-h-screen bg-brand-navy flex flex-col">
      {/* Portal header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-white font-bold text-xl tracking-tight">
            <span className="text-brand-red">L</span>WH
          </div>
          <div className="h-5 w-px bg-white/20" />
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Wellness Portal
          </span>
        </div>
        <span className="text-xs text-white/30 hidden sm:block">Powered by Leadway Health</span>
      </header>

      {/* Role tabs */}
      <div className="border-b border-white/10">
        <div className="flex">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRoleSelect(r.value)}
              className={`flex-1 flex flex-col items-center gap-1 py-4 px-3 transition-all duration-150
                border-b-[3px] cursor-pointer
                ${selectedRole === r.value && step !== 'role'
                  ? 'border-brand-orange text-white bg-white/5'
                  : 'border-transparent text-white/50 hover:bg-white/5 hover:text-white/80'}
              `}
            >
              <span className="text-xl">{r.icon}</span>
              <span className="text-xs font-bold uppercase tracking-wide hidden sm:block">{r.label}</span>
              <span className={`text-[10px] font-medium ${selectedRole === r.value && step !== 'role' ? 'text-brand-orange' : 'opacity-70'} hidden sm:block`}>
                {r.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {/* Role selection */}
          {step === 'role' && (
            <div className="animate-fade-in">
              <div className="text-center mb-10">
                <h1 className="text-2xl font-bold text-white mb-2">Welcome to the Wellness Portal</h1>
                <p className="text-white/50 text-sm">Select your portal to continue</p>
              </div>
              <div className="space-y-3">
                {roles.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleRoleSelect(r.value)}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10
                               border border-white/10 hover:border-brand-orange/50 rounded-xl
                               text-left transition-all duration-150 group"
                  >
                    <div className="text-brand-orange p-2 bg-brand-orange/10 rounded-lg group-hover:bg-brand-orange/20 transition-colors">
                      {r.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-semibold text-sm">{r.label}</div>
                      <div className="text-white/50 text-xs mt-0.5">{r.description}</div>
                    </div>
                    <ChevronRight size={16} className="text-white/30 group-hover:text-brand-orange transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── ENROLLEE: Member ID + Date of Birth ── */}
          {step === 'dob' && selectedRoleMeta && (
            <div className="animate-fade-in">
              <button
                onClick={() => setStep('role')}
                className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-8 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <div className="text-center mb-8">
                <div className="inline-flex p-3 bg-brand-orange/10 rounded-xl text-brand-orange mb-4">
                  {selectedRoleMeta.icon}
                </div>
                <h2 className="text-xl font-bold text-white">Member Login</h2>
                <p className="text-white/50 text-sm mt-1">Enter your Leadway member details to continue</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Member ID
                  </label>
                  <input
                    type="text"
                    value={memberRef}
                    onChange={(e) => setMemberRef(e.target.value)}
                    placeholder="e.g. 21000645/0"
                    onKeyDown={(e) => e.key === 'Enter' && handleDobLogin()}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl
                               text-white placeholder-white/30 text-sm focus:outline-none
                               focus:border-brand-orange focus:bg-white/10 transition-all font-mono"
                    autoComplete="username"
                    maxLength={50}
                    spellCheck={false}
                  />
                  <p className="text-white/30 text-xs mt-1.5">Found on your Leadway Health insurance card</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDobLogin()}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl
                               text-white text-sm focus:outline-none
                               focus:border-brand-orange focus:bg-white/10 transition-all
                               [color-scheme:dark]"
                    autoComplete="bday"
                  />
                </div>

                <button
                  onClick={handleDobLogin}
                  disabled={loginDobMutation.isPending || !memberRef.trim() || !dob}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-red
                             text-white font-semibold rounded-xl hover:bg-red-700 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loginDobMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── PROVIDER: Email + Password ── */}
          {step === 'email-password' && selectedRoleMeta && (
            <div className="animate-fade-in">
              <button onClick={() => setStep('role')} className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-8 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="text-center mb-8">
                <div className="inline-flex p-3 bg-brand-orange/10 rounded-xl text-brand-orange mb-4">
                  {selectedRoleMeta.icon}
                </div>
                <h2 className="text-xl font-bold text-white">Gym Partner Login</h2>
                <p className="text-white/50 text-sm mt-1">Sign in with your Leadway Health gym credentials</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={providerEmail}
                    onChange={(e) => setProviderEmail(e.target.value)}
                    placeholder="gym@example.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleProviderLogin()}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl
                               text-white placeholder-white/30 text-sm focus:outline-none
                               focus:border-brand-orange focus:bg-white/10 transition-all"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={providerPassword}
                    onChange={(e) => setProviderPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => e.key === 'Enter' && handleProviderLogin()}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl
                               text-white placeholder-white/30 text-sm focus:outline-none
                               focus:border-brand-orange focus:bg-white/10 transition-all"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  onClick={handleProviderLogin}
                  disabled={providerLoginMutation.isPending || !providerEmail.trim() || !providerPassword}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-red
                             text-white font-semibold rounded-xl hover:bg-red-700 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {providerLoginMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                  ) : (
                    'Sign In'
                  )}
                </button>
                <p className="text-center text-white/30 text-xs">
                  Use the email and password provided by Leadway Health
                </p>
              </div>
            </div>
          )}

          {/* ── PROVIDER: OTP verification ── */}
          {step === 'provider-otp' && selectedRoleMeta && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setStep('email-password'); setProviderOtp(''); }}
                className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-8 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <div className="text-center mb-8">
                <div className="inline-flex p-3 bg-brand-orange/10 rounded-xl text-brand-orange mb-4">
                  {selectedRoleMeta.icon}
                </div>
                <h2 className="text-xl font-bold text-white">Enter Your OTP</h2>
                <p className="text-white/50 text-sm mt-1">
                  A 5-digit code was sent to <span className="text-white font-mono">{providerEmail}</span>
                </p>
                <p className="text-white/30 text-xs mt-2">Check your registered email or phone number</p>
              </div>
              <div className="space-y-6">
                <OTPInput value={providerOtp} onChange={setProviderOtp} disabled={providerLoginMutation.isPending} length={5} />
                <button
                  onClick={handleProviderOtp}
                  disabled={providerLoginMutation.isPending || providerOtp.length !== 5}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-red
                             text-white font-semibold rounded-xl hover:bg-red-700 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {providerLoginMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
                <div className="text-center">
                  <button
                    onClick={handleProviderLogin}
                    disabled={providerLoginMutation.isPending}
                    className="text-white/40 hover:text-white/70 text-xs transition-colors disabled:opacity-30"
                  >
                    Didn't receive it? Resend OTP
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Provider / Advocate: Phone entry ── */}
          {step === 'phone' && selectedRoleMeta && (
            <div className="animate-fade-in">
              <button onClick={() => setStep('role')} className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-8 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="text-center mb-8">
                <div className="inline-flex p-3 bg-brand-orange/10 rounded-xl text-brand-orange mb-4">
                  {selectedRoleMeta.icon}
                </div>
                <h2 className="text-xl font-bold text-white">{selectedRoleMeta.label} Login</h2>
                <p className="text-white/50 text-sm mt-1">{selectedRoleMeta.sub}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    onKeyDown={(e) => e.key === 'Enter' && handleRequestOtp()}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl
                               text-white placeholder-white/30 text-sm focus:outline-none
                               focus:border-brand-orange focus:bg-white/10 transition-all"
                    autoComplete="tel"
                    maxLength={15}
                    inputMode="tel"
                  />
                  <p className="text-white/30 text-xs mt-1.5">Enter the number linked to your Leadway account</p>
                </div>
                <button
                  onClick={handleRequestOtp}
                  disabled={requestOtpMutation.isPending || !phone.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-red
                             text-white font-semibold rounded-xl hover:bg-red-700 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {requestOtpMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending OTP...</>
                  ) : (
                    'Send OTP via WhatsApp'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── OTP verification (Provider / Advocate) ── */}
          {step === 'otp' && selectedRoleMeta && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setStep('phone'); setOtp(''); setDevOtp(null); }}
                className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-8 transition-colors"
              >
                <ArrowLeft size={14} /> Change number
              </button>
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-white">Enter Your OTP</h2>
                <p className="text-white/50 text-sm mt-1">
                  A 6-digit code was sent to <span className="text-white font-mono">{phone}</span>
                </p>
                {devOtp && (
                  <div className="mt-3 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-xs font-mono">Dev OTP: {devOtp}</p>
                  </div>
                )}
              </div>
              <div className="space-y-6">
                <OTPInput value={otp} onChange={setOtp} disabled={verifyOtpMutation.isPending} />
                <button
                  onClick={handleVerifyOtp}
                  disabled={verifyOtpMutation.isPending || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-red
                             text-white font-semibold rounded-xl hover:bg-red-700 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {verifyOtpMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
                <div className="text-center">
                  <button
                    onClick={() => { setStep('phone'); setOtp(''); setDevOtp(null); }}
                    className="text-white/40 hover:text-white/70 text-xs transition-colors"
                  >
                    Didn't receive it? Go back to resend
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="text-center py-4 text-white/20 text-xs">
        &copy; {new Date().getFullYear()} Leadway Health. All rights reserved. &nbsp;|&nbsp; Secured with multi-factor authentication
      </footer>
    </div>
  );
}
