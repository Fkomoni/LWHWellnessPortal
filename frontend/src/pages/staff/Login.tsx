import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi } from '../../lib/staffApi';
import { useStaffAuthStore, StaffUser } from '../../store/staffAuthStore';

export default function StaffLogin() {
  const navigate = useNavigate();
  const setAuth = useStaffAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await staffApi.post<{ accessToken: string; user: StaffUser }>(
        '/auth/login',
        { email, password },
      );
      setAuth(data.user, data.accessToken);
      navigate('/staff/dashboard', { replace: true });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Unable to sign in. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6 py-10"
      style={{ background: 'linear-gradient(180deg, #F8F9F8 0%, #F3F4F3 100%)', fontFamily: 'Poppins, -apple-system, Segoe UI, system-ui, sans-serif' }}
    >
      <div
        className="w-full max-w-[440px] rounded-xl bg-white p-7"
        style={{ border: '1px solid #E8EAE8', boxShadow: '0 12px 32px rgba(16,24,40,.12)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-extrabold"
            style={{ background: '#C61531' }}
          >
            LW
          </div>
          <div>
            <div className="text-[11px] uppercase font-bold tracking-[.08em]" style={{ color: '#7B847B' }}>
              Leadway Wellness
            </div>
            <div className="text-[16px] font-bold" style={{ color: '#263626' }}>
              Pickup Tracking — Staff Portal
            </div>
          </div>
        </div>

        <h1 className="text-[18px] font-bold mb-1" style={{ color: '#1A1D1A' }}>
          Sign in
        </h1>
        <p className="text-[13px] mb-5" style={{ color: '#4A554A' }}>
          Use your staff email and system password.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11.5px] uppercase font-bold tracking-[.06em] mb-1.5" style={{ color: '#4A554A' }}>
              Staff email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 text-[14px] outline-none"
              style={{ border: '1px solid #D3D6D3', borderRadius: 8, color: '#1A1D1A' }}
              placeholder="name@leadway.com"
            />
          </div>
          <div>
            <label className="block text-[11.5px] uppercase font-bold tracking-[.06em] mb-1.5" style={{ color: '#4A554A' }}>
              System password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 text-[14px] outline-none"
              style={{ border: '1px solid #D3D6D3', borderRadius: 8, color: '#1A1D1A' }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="text-[12.5px] px-3 py-2 rounded-[8px]"
              style={{ background: '#FBE8EC', color: '#C61531', border: '1px solid #F4C7CF' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-semibold text-[14px] disabled:opacity-60"
            style={{
              background: '#C61531',
              padding: '8px 14px',
              height: 40,
              borderRadius: 10,
              transition: 'background 120ms cubic-bezier(.22,.61,.36,1)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#A00F25')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#C61531')}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-[12px]" style={{ color: '#7B847B' }}>
          Restricted to authorised Leadway staff. All access is audited.
        </p>
      </div>
    </div>
  );
}
