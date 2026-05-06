import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StaffRole = 'PHARMACY_OPS' | 'CARE_MANAGER' | 'ADMIN';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
}

interface StaffAuthStore {
  staff: StaffUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (staff: StaffUser, accessToken: string) => void;
  logout: () => void;
}

export const useStaffAuthStore = create<StaffAuthStore>()(
  persist(
    (set) => ({
      staff: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (staff, accessToken) => set({ staff, accessToken, isAuthenticated: true }),
      logout: () => set({ staff: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'lwh-staff-auth',
      partialize: (state) => ({
        staff: state.staff,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
