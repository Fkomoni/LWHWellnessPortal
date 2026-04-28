export type Role = 'ENROLLEE' | 'PROVIDER' | 'ADVOCATE';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  memberRef: string;
  role: Role;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

export interface MemberDashboard {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    memberRef: string;
    sessionsPerMonth: number;
    sessionsUsed: number;
    sessionsRemaining: number;
    resetDate: string | null;
    spouseId: string | null;
    planType: string | null;
    benefitStatus: string;
  };
  spouse: {
    firstName: string;
    lastName: string;
    sessionsUsed: number;
    sessionsPerMonth: number;
  } | null;
  recentSessions: Session[];
  nearbyGyms: Gym[];
}

export interface Session {
  id: string;
  status: 'CONFIRMED' | 'PENDING' | 'FLAGGED' | 'CANCELLED';
  whatsappVerified: boolean;
  fwaFlagged: boolean;
  sessionDate: string;
  provider: { gymName: string; location: string };
  rating?: { rating: number } | null;
  otpCode?: string; // shown in recent activity
}

export interface Gym {
  // local DB
  id?: string;
  location?: string;
  amenities?: string[];
  hours?: Record<string, string> | null;
  // Prognosis
  gymCode?: string;
  address?: string;
  state?: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // common
  gymName: string;
  lga: string;
}

export interface ProviderDashboard {
  stats: {
    todaySessions: number;
    monthSessions: number;
    pendingClaims: number;
    pendingAmount: number;
  };
  recentSessions: Array<{
    id: string;
    status: string;
    whatsappVerified: boolean;
    fwaFlagged: boolean;
    sessionDate: string;
    member: { firstName: string; lastName: string; memberRef: string };
  }>;
  fwaAlerts: FwaCase[];
}

export interface FwaCase {
  id: string;
  caseRef: string;
  memberId: string;
  providerId: string;
  flagType: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
  description: string;
  createdAt: string;
  provider?: { gymName: string; location: string };
}

export interface AdvocateDashboard {
  stats: {
    totalToday: number;
    activeMembers: number;
    openFwaCases: number;
    activeProviders: number;
  };
  topGyms: Array<{
    providerId: string;
    _count: { id: number };
    gym?: { gymName: string; location: string };
  }>;
  recentFwaFlags: FwaCase[];
}

export interface ApiError {
  error: string;
  code: string;
  details?: Array<{ field: string; message: string }>;
}
