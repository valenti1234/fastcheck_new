import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Test component to access context
const TestComponent = () => {
  const { user, token, loading, isAuthenticated, login, register, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'null'}</div>
      <div data-testid="token">{token || 'null'}</div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="isAuthenticated">{isAuthenticated.toString()}</div>
      <button onClick={() => login('test@example.com', 'password')} data-testid="login-btn">
        Login
      </button>
      <button 
        onClick={() => register({ name: 'Test User', email: 'test@example.com', password: 'password' })} 
        data-testid="register-btn"
      >
        Register
      </button>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      const TestComponentOutside = () => {
        useAuth();
        return <div>Test</div>;
      };

      // Suppress logger.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => render(<TestComponentOutside />)).toThrow(
        'useAuth must be used within an AuthProvider'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Initial state', () => {
    it('should initialize with default values when no token in localStorage', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('token')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      });
    });

    it('should fetch user data when token exists in localStorage', async () => {
      const mockToken = 'mock-token';
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant_admin' as const,
      };

      mockLocalStorage.getItem.mockReturnValue(mockToken);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
        expect(screen.getByTestId('token')).toHaveTextContent(mockToken);
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      expect(mockFetch).toHaveBeenCalledWith('/auth/me', {
        headers: {
          'Authorization': `Bearer ${mockToken}`,
        },
      });
    });

    it('should handle failed user data fetch', async () => {
      const mockToken = 'invalid-token';
      mockLocalStorage.getItem.mockReturnValue(mockToken);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Unauthorized' }),
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('token')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      consoleSpy.mockRestore();
    });
  });

  describe('login function', () => {
    it('should login successfully', async () => {
      const mockToken = 'login-token';
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant_admin' as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken, user: mockUser }),
      });

      renderWithProvider();
      
      await act(async () => {
        await userEvent.click(screen.getByTestId('login-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
        expect(screen.getByTestId('token')).toHaveTextContent(mockToken);
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      expect(mockFetch).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
      });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', mockToken);
      expect(toast.success).toHaveBeenCalledWith('Login successful!');
    });

    it('should handle login failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid credentials' }),
      });

      renderWithProvider();
      
      await act(async () => {
        await userEvent.click(screen.getByTestId('login-btn'));
      });

      expect(toast.error).toHaveBeenCalledWith('Invalid credentials');
    });
  });

  describe('register function', () => {
    it('should register successfully', async () => {
      const mockToken = 'register-token';
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant_admin' as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken, user: mockUser }),
      });

      renderWithProvider();
      
      await act(async () => {
        await userEvent.click(screen.getByTestId('register-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
        expect(screen.getByTestId('token')).toHaveTextContent(mockToken);
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      expect(mockFetch).toHaveBeenCalledWith('/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'password' }),
      });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', mockToken);
      expect(toast.success).toHaveBeenCalledWith('Registration successful!');
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Email already exists' }),
      });

      renderWithProvider();
      
      await act(async () => {
        await userEvent.click(screen.getByTestId('register-btn'));
      });

      expect(toast.error).toHaveBeenCalledWith('Email already exists');
    });
  });

  describe('logout function', () => {
    it('should logout successfully', async () => {
      const mockToken = 'logout-token';
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant_admin' as const,
      };

      // First login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken, user: mockUser }),
      });

      renderWithProvider();
      
      await act(async () => {
        await userEvent.click(screen.getByTestId('login-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      // Then logout
      await act(async () => {
        await userEvent.click(screen.getByTestId('logout-btn'));
      });

      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully');
    });
  });
});