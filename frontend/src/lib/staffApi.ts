import axios, { AxiosError } from 'axios';
import { useStaffAuthStore } from '../store/staffAuthStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const staffApi = axios.create({
  baseURL: `${BASE_URL}/staff`,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

staffApi.interceptors.request.use((config) => {
  const token = useStaffAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

staffApi.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useStaffAuthStore.getState().logout();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/staff/login')) {
        window.location.href = '/staff/login';
      }
    }
    return Promise.reject(error);
  },
);
