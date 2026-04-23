import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../lib/apiClient';
import { AlertTriangle, Timer } from 'lucide-react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 2 * 60 * 1000;       // warn 2 minutes before

export default function SessionTimeoutModal() {
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimers = useCallback(() => {
    if (!isAuthenticated) return;
    setShowWarning(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);

    idleTimer.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(Math.floor(WARNING_MS / 1000));

      warningTimer.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            // Auto-logout
            apiClient.post('/auth/logout').catch(() => {});
            logout();
            navigate('/login');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_MS);
  }, [isAuthenticated, logout, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimers));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warningTimer.current) clearInterval(warningTimer.current);
    };
  }, [isAuthenticated, resetTimers]);

  const handleStayLoggedIn = () => {
    if (warningTimer.current) clearInterval(warningTimer.current);
    setShowWarning(false);
    resetTimers();
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 animate-slide-up text-center">
        <div className="flex items-center justify-center w-14 h-14 bg-orange-100 rounded-full mx-auto mb-5">
          <AlertTriangle size={24} className="text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-grey-5 mb-2">Session Expiring</h2>
        <p className="text-sm text-grey-4 mb-6">
          You've been inactive. Your session will expire in
        </p>
        <div className="flex items-center justify-center gap-2 mb-8">
          <Timer size={20} className="text-brand-red" />
          <span className="text-4xl font-bold font-mono text-brand-red">
            {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { apiClient.post('/auth/logout').catch(() => {}); logout(); navigate('/login'); }}
            className="flex-1 btn-secondary text-sm"
          >
            Log Out
          </button>
          <button onClick={handleStayLoggedIn} className="flex-1 btn-primary text-sm">
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
