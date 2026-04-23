import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Role } from '../../types';
import Sidebar from './Sidebar';
import SessionTimeoutModal from '../ui/SessionTimeoutModal';
import NotificationCentre from '../ui/NotificationCentre';
import apiClient from '../../lib/apiClient';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';

interface AppShellProps { role: Role; }

const roleMeta: Record<Role, { label: string; color: string }> = {
  ENROLLEE: { label: 'Member Portal', color: 'text-brand-orange' },
  PROVIDER: { label: 'Gym Portal', color: 'text-green-400' },
  ADVOCATE: { label: 'Internal Portal', color: 'text-blue-400' },
};

export default function AppShell({ role }: AppShellProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await apiClient.post('/auth/logout'); } catch { /* proceed */ }
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  return (
    <div className="flex flex-col min-h-screen bg-grey-1">
      <SessionTimeoutModal />

      {/* Top Bar */}
      <header className="bg-brand-navy flex items-center justify-between px-6 py-3 min-h-[60px] sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="text-white font-bold text-lg tracking-tight">
            <span className="text-brand-red">L</span><span>WH</span>
          </div>
          <div className="h-5 w-px bg-white/20" />
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Wellness Portal</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification centre — only for ENROLLEE (members get WhatsApp alerts) */}
          {role === 'ENROLLEE' && <NotificationCentre />}
          <div className="text-right">
            <div className="text-white text-sm font-semibold">{user?.firstName} {user?.lastName}</div>
            <div className={`text-xs font-semibold uppercase tracking-wider ${roleMeta[role].color}`}>
              {roleMeta[role].label}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="ml-1 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={role} />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
