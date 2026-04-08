import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { AuthService } from '../services/authService';
import { logger } from '../utils/logger';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string, email: string, password: string }) => Promise<void>;
  logout: () => Promise<void>;
  handleOAuthCallback: (token: string, provider: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function to fetch user data using shared AuthService and axios client
  const fetchUserData = async () => {
    try {
      const { user } = await AuthService.getCurrentUser();
      setUser(user);
      setIsAuthenticated(true);
    } catch (error) {
      logger.error('Error fetching user data:', error);
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUserData();
    } else {
      setIsAuthenticated(false);
      setLoading(false);
    }
  }, []);

  const register = async (data: { name: string, email: string, password: string }) => {
    try {
      const response = await AuthService.register(data);
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
      setIsAuthenticated(true);
      toast.success('Registro exitoso');
    } catch (error: any) {
      toast.error(error.message || 'Error de registro');
      throw error;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await AuthService.login({ email, password });
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
      setIsAuthenticated(true);
      toast.success('Inicio de sesión exitoso');
    } catch (error: any) {
      toast.error(error.message || 'Error de inicio de sesión');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully');
    } catch (error) {
      logger.error('Logout error:', error);
      // Even if logout fails, clear local state
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully');
    }
  };

  const handleOAuthCallback = async (token: string, provider: string) => {
    try {
      localStorage.setItem('token', token);
      setToken(token);
      await fetchUserData();
      toast.success(`Sesión iniciada con ${provider}`);
    } catch (error: any) {
      logger.error('OAuth callback error:', error);
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isAuthenticated, login, register, logout, handleOAuthCallback }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};