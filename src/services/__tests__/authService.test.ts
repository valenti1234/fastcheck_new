import { AuthService } from '../authService';
import { apiClient } from '../api';
import { LoginCredentials, RegisterData, User } from '../../types/auth';

// Mock the apiClient
jest.mock('../api', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
  });

  describe('login', () => {
    const mockCredentials: LoginCredentials = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockAuthResponse = {
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant_admin' as const,
      },
      token: 'mock-jwt-token',
    };

    it('should successfully login with valid credentials', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockAuthResponse });

      const result = await AuthService.login(mockCredentials);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/login', mockCredentials);
      expect(result).toEqual(mockAuthResponse);
    });

    it('should throw error for invalid credentials (401)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 401, data: { message: 'Invalid credentials' } },
      });

      await expect(AuthService.login(mockCredentials))
        .rejects.toThrow('Invalid email or password');
    });

    it('should throw error for bad request (400)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'Email and password are required' } },
      });

      await expect(AuthService.login(mockCredentials))
        .rejects.toThrow('Email and password are required');
    });

    it('should throw error for server error (500)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      await expect(AuthService.login(mockCredentials))
        .rejects.toThrow('Server error. Please try again later.');
    });

    it('should throw generic error for unknown errors', async () => {
      mockedApiClient.post.mockRejectedValue(new Error('Network error'));

      await expect(AuthService.login(mockCredentials))
        .rejects.toThrow('Login failed');
    });
  });

  describe('register', () => {
    const mockRegisterData: RegisterData = {
      email: 'newuser@example.com',
      password: 'password123',
      name: 'New User',
      companyName: 'New Company',
    };

    const mockAuthResponse = {
      user: {
        id: '2',
        email: 'newuser@example.com',
        name: 'New User',
        role: 'tenant_admin' as const,
        defaultTenantId: 'tenant-1',
        tenants: ['tenant-1'],
      },
      token: 'mock-jwt-token',
    };

    it('should successfully register new user', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockAuthResponse });

      const result = await AuthService.register(mockRegisterData);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/register', mockRegisterData);
      expect(result).toEqual(mockAuthResponse);
    });

    it('should throw error for invalid registration data (400)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'All fields are required' } },
      });

      await expect(AuthService.register(mockRegisterData))
        .rejects.toThrow('All fields are required');
    });

    it('should throw error for existing user (409)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 409, data: { message: 'User already exists' } },
      });

      await expect(AuthService.register(mockRegisterData))
        .rejects.toThrow('User already exists with this email');
    });

    it('should throw error for server error (500)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      await expect(AuthService.register(mockRegisterData))
        .rejects.toThrow('Server error. Please try again later.');
    });
  });

  describe('getCurrentUser', () => {
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'tenant_admin',
      defaultTenantId: 'tenant-1',
      tenants: ['tenant-1'],
    };

    const mockCurrentUserResponse = {
      user: mockUser,
    };

    it('should successfully get current user', async () => {
      mockedApiClient.get.mockResolvedValue({ data: mockCurrentUserResponse });

      const result = await AuthService.getCurrentUser();

      expect(mockedApiClient.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockCurrentUserResponse);
    });

    it('should throw error for unauthenticated user (401)', async () => {
      mockedApiClient.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Not authenticated' } },
      });

      await expect(AuthService.getCurrentUser())
        .rejects.toThrow('Not authenticated');
    });

    it('should throw error for user not found (404)', async () => {
      mockedApiClient.get.mockRejectedValue({
        response: { status: 404, data: { message: 'User not found' } },
      });

      await expect(AuthService.getCurrentUser())
        .rejects.toThrow('User not found');
    });

    it('should throw error for server error (500)', async () => {
      mockedApiClient.get.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      await expect(AuthService.getCurrentUser())
        .rejects.toThrow('Server error. Please try again later.');
    });
  });

  describe('logout', () => {
    it('should call backend logout endpoint and remove token from localStorage', async () => {
      mockedApiClient.post.mockResolvedValueOnce({ data: { success: true } });

      await AuthService.logout();

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    });

    it('should remove token from localStorage even if backend call fails', async () => {
      mockedApiClient.post.mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await AuthService.logout();

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      expect(consoleSpy).toHaveBeenCalledWith('Backend logout failed:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      mockLocalStorage.getItem.mockReturnValue('mock-token');

      const result = AuthService.isAuthenticated();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');
      expect(result).toBe(true);
    });

    it('should return false when token does not exist', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = AuthService.isAuthenticated();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');
      expect(result).toBe(false);
    });
  });

  describe('getToken', () => {
    it('should return token from localStorage', () => {
      const mockToken = 'mock-jwt-token';
      mockLocalStorage.getItem.mockReturnValue(mockToken);

      const result = AuthService.getToken();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');
      expect(result).toBe(mockToken);
    });

    it('should return null when no token exists', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = AuthService.getToken();

      expect(result).toBe(null);
    });
  });

  describe('setToken', () => {
    it('should store token in localStorage', () => {
      const mockToken = 'new-jwt-token';

      AuthService.setToken(mockToken);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', mockToken);
    });
  });

  describe('refreshSession', () => {
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'tenant_admin',
      defaultTenantId: 'tenant-1',
      tenants: ['tenant-1'],
    };

    it('should return user when authenticated and request succeeds', async () => {
      mockLocalStorage.getItem.mockReturnValue('mock-token');
      mockedApiClient.get.mockResolvedValue({ data: { user: mockUser } });

      const result = await AuthService.refreshSession();

      expect(result).toEqual(mockUser);
    });

    it('should return null when not authenticated', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = await AuthService.refreshSession();

      expect(result).toBe(null);
      expect(mockedApiClient.get).not.toHaveBeenCalled();
    });

    it('should logout and return null when refresh fails', async () => {
      mockLocalStorage.getItem.mockReturnValue('mock-token');
      mockedApiClient.get.mockRejectedValue(new Error('Unauthorized'));

      const result = await AuthService.refreshSession();

      expect(result).toBe(null);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    });
  });

  describe('changePassword', () => {
    const currentPassword = 'oldpassword';
    const newPassword = 'newpassword';
    const mockResponse = { message: 'Password changed successfully' };

    it('should successfully change password', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await AuthService.changePassword(currentPassword, newPassword);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for invalid password data (400)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'Password too weak' } },
      });

      await expect(AuthService.changePassword(currentPassword, newPassword))
        .rejects.toThrow('Password too weak');
    });

    it('should throw error for incorrect current password (401)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 401, data: { message: 'Current password is incorrect' } },
      });

      await expect(AuthService.changePassword(currentPassword, newPassword))
        .rejects.toThrow('Current password is incorrect');
    });
  });

  describe('requestPasswordReset', () => {
    const email = 'test@example.com';
    const mockResponse = { message: 'Password reset email sent' };

    it('should successfully request password reset', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await AuthService.requestPasswordReset(email);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/forgot-password', { email });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for non-existent email (404)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 404, data: { message: 'User not found' } },
      });

      await expect(AuthService.requestPasswordReset(email))
        .rejects.toThrow('No account found with this email address');
    });
  });

  describe('resetPassword', () => {
    const token = 'reset-token';
    const newPassword = 'newpassword';
    const mockResponse = { message: 'Password reset successfully' };

    it('should successfully reset password', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await AuthService.resetPassword(token, newPassword);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token,
        newPassword,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for invalid token (400)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid token' } },
      });

      await expect(AuthService.resetPassword(token, newPassword))
        .rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('verifyEmail', () => {
    const token = 'verification-token';
    const mockResponse = { message: 'Email verified successfully' };

    it('should successfully verify email', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await AuthService.verifyEmail(token);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/verify-email', { token });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for invalid verification token (400)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid verification token' } },
      });

      await expect(AuthService.verifyEmail(token))
        .rejects.toThrow('Invalid or expired verification token');
    });
  });

  describe('resendEmailVerification', () => {
    const mockResponse = { message: 'Verification email sent' };

    it('should successfully resend email verification', async () => {
      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await AuthService.resendEmailVerification();

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/resend-verification');
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for unauthenticated user (401)', async () => {
      mockedApiClient.post.mockRejectedValue({
        response: { status: 401, data: { message: 'Not authenticated' } },
      });

      await expect(AuthService.resendEmailVerification())
        .rejects.toThrow('Not authenticated');
    });
  });
});