import { NavLink } from 'react-router-dom';
import { Role } from '../../types';
import { LayoutDashboard, QrCode, History, CheckSquare, UserCheck, BarChart2, Users, AlertTriangle, FileText } from 'lucide-react';

interface SidebarProps {
  role: Role;
}

const navConfig: Record<Role, Array<{ icon: React.ReactNode; label: string; to: string }>> = {
  ENROLLEE: [
    { icon: <LayoutDashboard size={16} />, label: 'My Dashboard', to: '/member/dashboard' },
    { icon: <QrCode size={16} />, label: 'Get Session OTP', to: '/member/generate-otp' },
    { icon: <History size={16} />, label: 'Session History', to: '/member/sessions' },
  ],
  PROVIDER: [
    { icon: <LayoutDashboard size={16} />, label: 'Dashboard', to: '/provider/dashboard' },
    { icon: <CheckSquare size={16} />, label: 'Validate Session', to: '/provider/validate' },
    { icon: <UserCheck size={16} />, label: 'Check Eligibility', to: '/provider/eligibility' },
    { icon: <FileText size={16} />, label: 'Claims', to: '/provider/dashboard' },
  ],
  ADVOCATE: [
    { icon: <LayoutDashboard size={16} />, label: 'Operations Hub', to: '/advocate/dashboard' },
    { icon: <Users size={16} />, label: 'Member 360°', to: '/advocate/members' },
    { icon: <AlertTriangle size={16} />, label: 'FWA Cases', to: '/advocate/fwa' },
    { icon: <BarChart2 size={16} />, label: 'Reports', to: '/advocate/dashboard' },
  ],
};

export default function Sidebar({ role }: SidebarProps) {
  const links = navConfig[role];

  return (
    <aside className="w-56 bg-white border-r border-grey-2 flex-shrink-0 hidden md:flex flex-col sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto">
      <nav className="py-4">
        {links.map((link) => (
          <NavLink
            key={link.to + link.label}
            to={link.to}
            end
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="flex-shrink-0">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
