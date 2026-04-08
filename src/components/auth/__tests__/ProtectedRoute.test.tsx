import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';

// Mock dependencies
jest.mock('../../../contexts/AuthContext');
jest.mock('../../common/PageLoader', () => {
  return function MockPageLoader() {
    return <div data-testid="page-loader">Loading...</div>;
  };
});
jest.mock('../../layouts/DashboardLayout', () => {
  return function MockDashboardLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="dashboard-layout">{children}</div>;
  };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock Outlet component
const MockOutlet = () => <div data-testid="outlet">Protected Content</div>;
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <MockOutlet />,
  Navigate: ({ to, state, replace }: { to: string; state?: any; replace?: boolean }) => (
    <div data-testid="navigate" data-to={to} data-state={JSON.stringify(state)} data-replace={replace?.toString()}>
      Redirecting to {to}
    </div>
  ),
  useLocation: () => ({ pathname: '/protected-page', search: '', hash: '', state: null })
}));

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderProtectedRoute = (initialEntries = ['/protected-page']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <ProtectedRoute />
      </MemoryRouter>
    );
  };

  describe('Loading State', () => {
    it('renders PageLoader when loading is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      expect(screen.getByTestId('page-loader')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('does not render other components when loading', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: true,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'evaluator' },
        token: 'token',
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      expect(screen.getByTestId('page-loader')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('redirects to login when user is not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/login');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
      expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
    });

    it('passes current location as state when redirecting to login', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute(['/some-protected-route']);

      const navigateElement = screen.getByTestId('navigate');
      const stateData = JSON.parse(navigateElement.getAttribute('data-state') || '{}');
      
      expect(stateData.from).toEqual({
        pathname: '/protected-page',
        search: '',
        hash: '',
        state: null
      });
    });

    it('does not render protected content when unauthenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    it('renders DashboardLayout with Outlet when user is authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
    });

    it('works with different user roles', () => {
      const roles = ['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only'] as const;
      
      roles.forEach(role => {
        jest.clearAllMocks();
        
        mockUseAuth.mockReturnValue({
          isAuthenticated: true,
          loading: false,
          user: { id: '1', email: 'test@example.com', name: 'Test User', role },
          token: 'valid-token',
          login: jest.fn(),
          register: jest.fn(),
          logout: jest.fn()
        });

        const { unmount } = renderProtectedRoute();

        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
        expect(screen.getByTestId('outlet')).toBeInTheDocument();
        expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
        
        unmount();
      });
    });

    it('does not redirect when authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
      expect(screen.queryByText(/Redirecting to/)).not.toBeInTheDocument();
    });
  });

  describe('State Transitions', () => {
    it('transitions from loading to authenticated state', () => {
      const { rerender } = render(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      // Initial loading state
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      expect(screen.getByTestId('page-loader')).toBeInTheDocument();

      // Transition to authenticated
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    it('transitions from loading to unauthenticated state', () => {
      const { rerender } = render(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      // Initial loading state
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      expect(screen.getByTestId('page-loader')).toBeInTheDocument();

      // Transition to unauthenticated
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
        user: null,
        token: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <ProtectedRoute />
        </MemoryRouter>
      );

      expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles null user when authenticated is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
        user: null, // Edge case: authenticated but no user data
        token: 'valid-token',
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      // Should still render protected content if isAuthenticated is true
      expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    it('handles null token when authenticated is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'evaluator' },
        token: null, // Edge case: authenticated but no token
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderProtectedRoute();

      // Should still render protected content if isAuthenticated is true
      expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });
  });
});