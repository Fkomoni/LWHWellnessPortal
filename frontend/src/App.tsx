import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Role } from './types';

import Login from './pages/Login';
import AppShell from './components/layout/AppShell';

// Staff (prescription pickup tracking)
import StaffLogin from './pages/staff/Login';
import StaffDashboard from './pages/staff/Dashboard';
import { useStaffAuthStore } from './store/staffAuthStore';

// Enrollee
import EnrolleeDashboard from './pages/enrollee/Dashboard';
import EnrolleeGenerateOTP from './pages/enrollee/GenerateOTP';
import EnrolleeSessionHistory from './pages/enrollee/SessionHistory';
import EnrolleeGymFinder from './pages/enrollee/GymFinder';
import EnrolleeTopUp from './pages/enrollee/TopUp';

// Provider
import ProviderDashboard from './pages/provider/Dashboard';
import ProviderValidateSession from './pages/provider/ValidateSession';
import ProviderEligibility from './pages/provider/EligibilityCheck';
import ProviderGenerateOTP from './pages/provider/GenerateOTPForMember';
import ProviderClaims from './pages/provider/Claims';

// Advocate
import AdvocateDashboard from './pages/advocate/Dashboard';
import AdvocateMemberView from './pages/advocate/MemberView';
import AdvocateFWACases from './pages/advocate/FWACases';
import AdvocateProviderNetwork from './pages/advocate/ProviderNetwork';
import AdvocateCommunicationLog from './pages/advocate/CommunicationLog';
import AdvocateReports from './pages/advocate/Reports';

function StaffGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStaffAuthStore();
  if (!isAuthenticated) return <Navigate to="/staff/login" replace />;
  return <>{children}</>;
}

function RoleGuard({ children, allowedRole }: { children: React.ReactNode; allowedRole: Role }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== allowedRole) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  const map: Record<Role, string> = { ENROLLEE: '/member/dashboard', PROVIDER: '/provider/dashboard', ADVOCATE: '/advocate/dashboard' };
  return <Navigate to={map[user.role]} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthRedirect />} />

        {/* Enrollee */}
        <Route path="/member" element={<RoleGuard allowedRole="ENROLLEE"><AppShell role="ENROLLEE" /></RoleGuard>}>
          <Route path="dashboard" element={<EnrolleeDashboard />} />
          <Route path="generate-otp" element={<EnrolleeGenerateOTP />} />
          <Route path="sessions" element={<EnrolleeSessionHistory />} />
          <Route path="gyms" element={<EnrolleeGymFinder />} />
          <Route path="top-up" element={<EnrolleeTopUp />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Provider */}
        <Route path="/provider" element={<RoleGuard allowedRole="PROVIDER"><AppShell role="PROVIDER" /></RoleGuard>}>
          <Route path="dashboard" element={<ProviderDashboard />} />
          <Route path="validate" element={<ProviderValidateSession />} />
          <Route path="eligibility" element={<ProviderEligibility />} />
          <Route path="generate-otp" element={<ProviderGenerateOTP />} />
          <Route path="claims" element={<ProviderClaims />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Advocate */}
        <Route path="/advocate" element={<RoleGuard allowedRole="ADVOCATE"><AppShell role="ADVOCATE" /></RoleGuard>}>
          <Route path="dashboard" element={<AdvocateDashboard />} />
          <Route path="members" element={<AdvocateMemberView />} />
          <Route path="fwa" element={<AdvocateFWACases />} />
          <Route path="providers" element={<AdvocateProviderNetwork />} />
          <Route path="comms" element={<AdvocateCommunicationLog />} />
          <Route path="reports" element={<AdvocateReports />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Staff prescription pickup tracking portal */}
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route
          path="/staff/dashboard"
          element={
            <StaffGuard>
              <StaffDashboard />
            </StaffGuard>
          }
        />
        <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
