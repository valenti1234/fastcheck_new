import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SuperuserBlockedRoute from '../SuperuserBlockedRoute';
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

describe('SuperuserBlockedRoute Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderSuperuserBlockedRoute = (props: {
    children?: React.ReactNode;
    layout?: React.ComponentType<{ children: React.ReactNode }>;
  } = {}) => {
    return render(
      <MemoryRouter>
        <SuperuserBlockedRoute {...props} />
      </MemoryRouter>
    );
  };

  describe('Superuser Access Control', () => {
    it('redirects superuser to admin panel', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/admin');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
      expect(screen.getByText('Redirecting to /admin')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });

    it('blocks superuser even with children prop', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        children: <div data-testid="custom-content">Custom Content</div>
      });

      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-content')).not.toBeInTheDocument();
    });

    it('blocks superuser even with layout prop', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({ layout: MockLayout });

      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });
  });

  describe('Non-Superuser Access', () => {
    const nonSuperuserRoles = ['tenant_admin', 'evaluator', 'read_only', 'write_only'] as const;

    nonSuperuserRoles.forEach(role => {
      it(`allows access for ${role} user`, () => {
        mockUseAuth.mockReturnValue({
          user: { id: '1', email: 'user@example.com', name: 'Test User', role },
          token: 'valid-token',
          isAuthenticated: true,
          loading: false,
          login: jest.fn(),
          register: jest.fn(),
          logout: jest.fn()
        });

        renderSuperuserBlockedRoute();

        expect(screen.getByTestId('outlet')).toBeInTheDocument();
        expect(screen.getByText('Outlet Content')).toBeInTheDocument();
        expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
      });
    });
  });

  describe('Null/Undefined User', () => {
    it('allows access when user is null', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('allows access when user is undefined', () => {
      mockUseAuth.mockReturnValue({
        user: undefined as any,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });
  });

  describe('Children Prop', () => {
    it('renders children instead of Outlet when provided for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        children: <div data-testid="custom-children">Custom Content</div>
      });

      expect(screen.getByTestId('custom-children')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('renders complex children components for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'tenant_admin' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        children: (
          <div>
            <h1 data-testid="title">User Panel</h1>
            <button data-testid="action-button">Action</button>
          </div>
        )
      });

      expect(screen.getByTestId('title')).toBeInTheDocument();
      expect(screen.getByTestId('action-button')).toBeInTheDocument();
      expect(screen.getByText('User Panel')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });
  });

  describe('Layout Prop', () => {
    it('wraps content with Layout component when provided for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({ layout: MockLayout });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('wraps children with Layout component when both are provided for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        layout: MockLayout,
        children: <div data-testid="custom-content">Custom Content</div>
      });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('renders content without layout when layout is not provided for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles user with undefined role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: undefined as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      // Should allow access since role is not 'superuser'
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('handles user with null role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: null as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      // Should allow access since role is not 'superuser'
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('handles user with empty string role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: '' as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      // Should allow access since role is not 'superuser'
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('handles case-sensitive role comparison', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'SuperUser' as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      // Should allow access since 'SuperUser' !== 'superuser'
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('handles unknown role', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'unknown_role' as any },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      // Should allow access for unknown roles
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });
  });

  describe('Integration Scenarios', () => {
    it('works with all props combined for non-superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        layout: MockLayout,
        children: (
          <div>
            <h1 data-testid="user-title">User Dashboard</h1>
            <div data-testid="user-content">User specific content</div>
          </div>
        )
      });

      expect(screen.getByTestId('mock-layout')).toBeInTheDocument();
      expect(screen.getByTestId('user-title')).toBeInTheDocument();
      expect(screen.getByTestId('user-content')).toBeInTheDocument();
      expect(screen.getByText('User Dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('always redirects superuser regardless of props', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute({
        layout: MockLayout,
        children: (
          <div>
            <h1 data-testid="admin-title">Admin Dashboard</h1>
            <div data-testid="admin-content">Admin specific content</div>
          </div>
        )
      });

      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-layout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('admin-title')).not.toBeInTheDocument();
      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    });
  });

  describe('Component Behavior', () => {
    it('always uses replace navigation for superuser', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderSuperuserBlockedRoute();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/admin');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
    });
  });
});