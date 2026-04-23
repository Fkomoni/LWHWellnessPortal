import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Role } from '../types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  selectedRole: Role | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  setSelectedRole: (role: Role) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      selectedRole: null,
      isAuthenticated: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true, selectedRole: user.role }),

      setAccessToken: (accessToken) => set({ accessToken }),

      setSelectedRole: (role) => set({ selectedRole: role }),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false, selectedRole: null }),
    }),
    {
      name: 'lwh-auth',
      // Only persist non-sensitive state — access token is kept in memory only
      partialize: (state) => ({ user: state.user, selectedRole: state.selectedRole, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
