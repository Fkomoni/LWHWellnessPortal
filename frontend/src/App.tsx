import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Role } from './types';

import Login from './pages/Login';
import AppShell from './components/layout/AppShell';

// Enrollee
import EnrolleeDashboard from './pages/enrollee/Dashboard';
import EnrolleeGenerateOTP from './pages/enrollee/GenerateOTP';
import EnrolleeSessionHistory from './pages/enrollee/SessionHistory';

// Provider
import ProviderDashboard from './pages/provider/Dashboard';
import ProviderValidateSession from './pages/provider/ValidateSession';
import ProviderEligibility from './pages/provider/EligibilityCheck';

// Advocate
import AdvocateDashboard from './pages/advocate/Dashboard';
import AdvocateMemberView from './pages/advocate/MemberView';
import AdvocateFWACases from './pages/advocate/FWACases';

function RoleGuard({ children, allowedRole }: { children: React.ReactNode; allowedRole: Role }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== allowedRole) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  const redirectMap: Record<Role, string> = {
    ENROLLEE: '/member/dashboard',
    PROVIDER: '/provider/dashboard',
    ADVOCATE: '/advocate/dashboard',
  };
  return <Navigate to={redirectMap[user.role]} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthRedirect />} />

        {/* Enrollee routes */}
        <Route
          path="/member"
          element={
            <RoleGuard allowedRole="ENROLLEE">
              <AppShell role="ENROLLEE" />
            </RoleGuard>
          }
        >
          <Route path="dashboard" element={<EnrolleeDashboard />} />
          <Route path="generate-otp" element={<EnrolleeGenerateOTP />} />
          <Route path="sessions" element={<EnrolleeSessionHistory />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Provider routes */}
        <Route
          path="/provider"
          element={
            <RoleGuard allowedRole="PROVIDER">
              <AppShell role="PROVIDER" />
            </RoleGuard>
          }
        >
          <Route path="dashboard" element={<ProviderDashboard />} />
          <Route path="validate" element={<ProviderValidateSession />} />
          <Route path="eligibility" element={<ProviderEligibility />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Advocate routes */}
        <Route
          path="/advocate"
          element={
            <RoleGuard allowedRole="ADVOCATE">
              <AppShell role="ADVOCATE" />
            </RoleGuard>
          }
        >
          <Route path="dashboard" element={<AdvocateDashboard />} />
          <Route path="members" element={<AdvocateMemberView />} />
          <Route path="fwa" element={<AdvocateFWACases />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
