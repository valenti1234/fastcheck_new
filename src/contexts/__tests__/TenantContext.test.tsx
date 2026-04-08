import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantProvider, useTenant } from '../TenantContext';
import { AuthProvider } from '../AuthContext';

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

// Mock AuthContext
const mockAuthContext = {
  user: null,
  token: null,
  loading: false,
  isAuthenticated: false,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
};

jest.mock('../AuthContext', () => ({
  ...jest.requireActual('../AuthContext'),
  useAuth: () => mockAuthContext,
}));

// Test component to access context
const TestComponent = () => {
  const { tenant, loading, error, updateTenant } = useTenant();
  
  const mockTenant = {
    _id: '1',
    name: 'Updated Tenant',
    settings: {},
    usageStats: {
      evaluationsRemaining: 100,
      evaluationsUsed: 50,
      lastEvaluationDate: new Date(),
    },
  };
  
  return (
    <div>
      <div data-testid="tenant">{tenant ? JSON.stringify(tenant) : 'null'}</div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="error">{error || 'null'}</div>
      <button onClick={() => updateTenant(mockTenant)} data-testid="update-btn">
        Update Tenant
      </button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <TenantProvider>
      <TestComponent />
    </TenantProvider>
  );
};

describe('TenantContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
    mockAuthContext.isAuthenticated = false;
  });

  describe('useTenant hook', () => {
    it('should throw error when used outside TenantProvider', () => {
      const TestComponentOutside = () => {
        useTenant();
        return <div>Test</div>;
      };

      // Suppress logger.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => render(<TestComponentOutside />)).toThrow(
        'useTenant must be used within a TenantProvider'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Initial state', () => {
    it('should initialize with default values when not authenticated', async () => {
      mockAuthContext.isAuthenticated = false;
      
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('null');
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch tenant data when authenticated', async () => {
      const mockTenant = {
        _id: '1',
        name: 'Test Tenant',
        settings: { theme: 'dark' },
        usageStats: {
          evaluationsRemaining: 100,
          evaluationsUsed: 50,
          lastEvaluationDate: new Date('2023-01-01'),
        },
        creditBalance: {
          availableCredits: 1000,
          totalCreditsUsed: 500,
          lastCreditOperation: new Date('2023-01-01'),
        },
      };

      mockAuthContext.isAuthenticated = true;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTenant,
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent(JSON.stringify(mockTenant));
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('null');
      });

      expect(mockFetch).toHaveBeenCalledWith('https://duxiter.azurianlab.com/api/tenant', {
        headers: {
          'Authorization': 'Bearer mock-token',
        },
      });
    });

    it('should handle 404 error gracefully (superuser case)', async () => {
      mockAuthContext.isAuthenticated = true;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Tenant not found' }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('null');
      });
    });

    it('should handle other fetch errors', async () => {
      mockAuthContext.isAuthenticated = true;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal server error' }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch tenant data');
      });
    });

    it('should handle network errors', async () => {
      mockAuthContext.isAuthenticated = true;
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      });
    });
  });

  describe('updateTenant function', () => {
    it('should update tenant data', async () => {
      const initialTenant = {
        _id: '1',
        name: 'Initial Tenant',
        settings: {},
        usageStats: {
          evaluationsRemaining: 100,
          evaluationsUsed: 0,
          lastEvaluationDate: null,
        },
      };

      const updatedTenant = {
        _id: '1',
        name: 'Updated Tenant',
        settings: { theme: 'dark' },
        usageStats: {
          evaluationsRemaining: 90,
          evaluationsUsed: 10,
          lastEvaluationDate: new Date(),
        },
      };

      mockAuthContext.isAuthenticated = true;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialTenant,
      });

      renderWithProvider();

      // Wait for initial fetch
      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent(JSON.stringify(initialTenant));
      });

      // Update tenant
      await act(async () => {
        await userEvent.click(screen.getByTestId('update-btn'));
      });

      expect(screen.getByTestId('tenant')).toHaveTextContent(JSON.stringify({
        _id: '1',
        name: 'Updated Tenant',
        settings: {},
        usageStats: {
          evaluationsRemaining: 100,
          evaluationsUsed: 50,
          lastEvaluationDate: expect.any(String), // Date will be stringified
        },
      }));
    });
  });

  describe('Authentication state changes', () => {
    it('should refetch tenant data when authentication state changes', async () => {
      const mockTenant = {
        _id: '1',
        name: 'Test Tenant',
        settings: {},
        usageStats: {
          evaluationsRemaining: 100,
          evaluationsUsed: 50,
          lastEvaluationDate: new Date(),
        },
      };

      // Start unauthenticated
      mockAuthContext.isAuthenticated = false;
      const { rerender } = renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent('null');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // Become authenticated
      mockAuthContext.isAuthenticated = true;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTenant,
      });

      rerender(
        <TenantProvider>
          <TestComponent />
        </TenantProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('tenant')).toHaveTextContent(JSON.stringify(mockTenant));
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(mockFetch).toHaveBeenCalledWith('https://duxiter.azurianlab.com/api/tenant', {
        headers: {
          'Authorization': 'Bearer mock-token',
        },
      });
    });
  });
});