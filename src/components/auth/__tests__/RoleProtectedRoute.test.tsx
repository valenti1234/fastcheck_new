import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoleProtectedRoute from '../RoleProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';

// Mock dependencies
jest.mock('../../../contexts/AuthContext');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock Navigate component
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate" data-to={to} data-replace={replace?.toString()}>
      Redirecting to {to}
    </div>
  ),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>
}));

// Mock Layout component
const MockLayout = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="mock-layout">{children}</div>
);

describe('RoleProtectedRoute Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderRoleProtectedRoute = (props: {
    role: string;
    children?: React.ReactNode;
    layout?: React.ComponentType<{ children: React.ReactNode }>;
  }) => {
    return render(
      <MemoryRouter>
        <RoleProtectedRoute {...props} />
      </MemoryRouter>
    );
  };

  describe('Access Control', () => {
    it('allows access when user has the required role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.getByText('Outlet Content')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('denies access when user has different role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'evaluator@example.com', name: 'Evaluator User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('denies access when user is null', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });
  });

  describe('Different User Roles', () => {
    const roles = ['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only'] as const;

    roles.forEach(userRole => {
      roles.forEach(requiredRole => {
        it(`${userRole === requiredRole ? 'allows' : 'denies'} access for ${userRole} user to ${requiredRole} route`, () => {
          mockUseAuth.mockReturnValue({
            user: { id: '1', email: 'test@example.com', name: 'Test User', role: userRole },
            token: 'valid-token',
            isAuthenticated: true,
            loading: false,
            login: jest.fn(),
            register: jest.fn(),
            logout: jest.fn()
          });

          renderRoleProtectedRoute({ role: requiredRole });

          if (userRole === requiredRole) {
            expect(screen.getByTestId('outlet')).toBeInTheDocument();
            expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
          } else {
            expect(screen.getByTestId('navigate')).toBeInTheDocument();
            expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
          }
        });
      });
    });
  });

  describe('Children Prop', () => {
    it('renders children instead of Outlet when provided', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({
        role: 'superuser',
        children: <div data-testid="custom-children">Custom Content</div>
      });

      expect(screen.getByTestId('custom-children')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('renders complex children components', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'tenant_admin' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({
        role: 'tenant_admin',
        children: (
          <div>
            <h1 data-testid="title">Admin Panel</h1>
            <button data-testid="action-button">Action</button>
          </div>
        )
      });

      expect(screen.getByTestId('title')).toBeInTheDocument();
      expect(screen.getByTestId('action-button')).toBeInTheDocument();
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });
  });

  describe('Layout Prop', () => {
    it('wraps content with Layout component when provided', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({
        role: 'superuser',
        layout: MockLayout
      });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    it('wraps children with Layout component when both are provided', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({
        role: 'superuser',
        layout: MockLayout,
        children: <div data-testid="custom-content">Custom Content</div>
      });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('renders content without layout when layout is not provided', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-layout')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined user role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: undefined as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('handles empty string role requirement', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: '' });

      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('handles case-sensitive role comparison', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'SuperUser' as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({ role: 'superuser' });

      // Should deny access due to case mismatch
      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });
  });

  describe('Integration Scenarios', () => {
    it('works with all props combined', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleProtectedRoute({
        role: 'superuser',
        layout: MockLayout,
        children: (
          <div>
            <h1 data-testid="admin-title">Admin Dashboard</h1>
            <div data-testid="admin-content">Admin specific content</div>
          </div>
        )
      });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('admin-title')).toBeInTheDocument();
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });
  });
});