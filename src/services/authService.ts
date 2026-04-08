import { apiClient } from './api';
import { User, LoginCredentials, RegisterData } from '../types/auth';
import logger from '../utils/logger';

export interface AuthResponse {
  user: User;
  token: string;
}

export interface CurrentUserResponse {
  user: User;
}

export class AuthService {
  /**
   * Login user with email and password
   */
  static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Check if it's an activation pending error
        if (error.response.data?.activationStatus === 'pending') {
          throw new Error(error.response.data.message);
        }
        throw new Error('Email o contraseña inválidos');
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Datos de solicitud inválidos');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error de inicio de sesión');
    }
  }

  /**
   * Register new user
   */
  static async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/auth/register', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Datos de registro inválidos');
      } else if (error.response?.status === 409) {
        throw new Error('Ya existe un usuario con este email');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error de registro');
    }
  }

  /**
   * Get current authenticated user
   */
  static async getCurrentUser(): Promise<CurrentUserResponse> {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('No autenticado');
      } else if (error.response?.status === 404) {
        throw new Error('Usuario no encontrado');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al obtener datos del usuario');
    }
  }

  /**
   * Logout user (call backend and clear local storage)
   */
  static async logout(): Promise<void> {
    try {
      // Call backend logout endpoint
      await apiClient.post('/auth/logout');
    } catch (error) {
      // Even if backend call fails, we still clear local storage
      logger.warn('Backend logout failed:', error);
    } finally {
      // Always clear local storage
      localStorage.removeItem('token');
    }
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const token = localStorage.getItem('token');
    return !!token;
  }

  /**
   * Get stored authentication token
   */
  static getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Store authentication token
   */
  static setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  /**
   * Refresh user session by fetching current user data
   */
  static async refreshSession(): Promise<User | null> {
    try {
      if (!this.isAuthenticated()) {
        return null;
      }
      const response = await this.getCurrentUser();
      return response.user;
    } catch (error) {
      // If refresh fails, clear token and return null
      await this.logout();
      return null;
    }
  }

  /**
   * Change user password
   */
  static async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Datos de contraseña inválidos');
      } else if (error.response?.status === 401) {
        throw new Error('La contraseña actual es incorrecta');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al cambiar la contraseña');
    }
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error('No se encontró una cuenta con esta dirección de email');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al enviar email de restablecimiento de contraseña');
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        token,
        newPassword
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new Error('Token de restablecimiento inválido o expirado');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al restablecer la contraseña');
    }
  }

  /**
   * Verify email with token
   */
  static async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/verify-email', { token });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new Error('Token de verificación inválido o expirado');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al verificar el email');
    }
  }

  /**
   * Resend email verification
   */
  static async resendEmailVerification(): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/resend-verification');
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('No autenticado');
      } else if (error.response?.status >= 500) {
        throw new Error('Error del servidor. Por favor intente nuevamente.');
      }
      throw new Error(error.response?.data?.message || 'Error al reenviar email de verificación');
    }
  }
}

export default AuthService;