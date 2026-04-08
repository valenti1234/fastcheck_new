import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoleBasedRedirect from '../RoleBasedRedirect';
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
  )
}));

describe('RoleBasedRedirect Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderRoleBasedRedirect = () => {
    return render(
      <MemoryRouter>
        <RoleBasedRedirect />
      </MemoryRouter>
    );
  };

  describe('Unauthenticated User', () => {
    it('redirects to login when user is null', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/login');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
      expect(screen.getByText('Redirecting to /login')).toBeInTheDocument();
    });

    it('redirects to login when user is undefined', () => {
      mockUseAuth.mockReturnValue({
        user: undefined as any,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/login');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
    });
  });

  describe('Superuser Role', () => {
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

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toBeInTheDocument();
      expect(navigateElement).toHaveAttribute('data-to', '/admin');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
      expect(screen.getByText('Redirecting to /admin')).toBeInTheDocument();
    });
  });

  describe('Other User Roles', () => {
    const nonSuperuserRoles = ['tenant_admin', 'evaluator', 'read_only', 'write_only'] as const;

    nonSuperuserRoles.forEach(role => {
      it(`redirects ${role} to dashboard`, () => {
        mockUseAuth.mockReturnValue({
          user: { id: '1', email: 'user@example.com', name: 'Test User', role },
          token: 'valid-token',
          isAuthenticated: true,
          loading: false,
          login: jest.fn(),
          register: jest.fn(),
          logout: jest.fn()
        });

        renderRoleBasedRedirect();

        const navigateElement = screen.getByTestId('navigate');
        expect(navigateElement).toBeInTheDocument();
        expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
        expect(navigateElement).toHaveAttribute('data-replace', 'true');
        expect(screen.getByText('Redirecting to /dashboard')).toBeInTheDocument();
      });
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

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
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

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
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

      renderRoleBasedRedirect();

      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
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

      renderRoleBasedRedirect();

      // Should redirect to dashboard since 'SuperUser' !== 'superuser'
      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
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

      renderRoleBasedRedirect();

      // Should redirect to dashboard for unknown roles
      const navigateElement = screen.getByTestId('navigate');
      expect(navigateElement).toHaveAttribute('data-to', '/dashboard');
      expect(navigateElement).toHaveAttribute('data-replace', 'true');
    });
  });

  describe('Component Behavior', () => {
    it('always uses replace navigation', () => {
      const testCases = [
        { user: null, expectedTo: '/login' },
        { user: { id: '1', email: 'admin@example.com', name: 'Admin', role: 'superuser' as const }, expectedTo: '/admin' },
        { user: { id: '2', email: 'user@example.com', name: 'User', role: 'evaluator' as const }, expectedTo: '/dashboard' }
      ];

      testCases.forEach(({ user, expectedTo }) => {
        jest.clearAllMocks();
        
        mockUseAuth.mockReturnValue({
          user,
          token: user ? 'valid-token' : null,
          isAuthenticated: !!user,
          loading: false,
          login: jest.fn(),
          register: jest.fn(),
          logout: jest.fn()
        });

        const { unmount } = renderRoleBasedRedirect();

        const navigateElement = screen.getByTestId('navigate');
        expect(navigateElement).toHaveAttribute('data-to', expectedTo);
        expect(navigateElement).toHaveAttribute('data-replace', 'true');
        
        unmount();
      });
    });

    it('renders only Navigate component', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'user@example.com', name: 'Test User', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      renderRoleBasedRedirect();

      // Should only render the Navigate component, no other content
      expect(screen.getByTestId('navigate')).toBeInTheDocument();
      expect(screen.queryByText(/dashboard/i)).toBeInTheDocument(); // From the redirect text
      
      // Check that there's no other content
      const container = screen.getByTestId('navigate').parentElement;
      expect(container?.children).toHaveLength(1);
    });
  });

  describe('Integration with Auth Context', () => {
    it('responds to auth context changes', () => {
      const { rerender } = render(
        <MemoryRouter>
          <RoleBasedRedirect />
        </MemoryRouter>
      );

      // Initial state: no user
      mockUseAuth.mockReturnValue({
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <RoleBasedRedirect />
        </MemoryRouter>
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');

      // User logs in as superuser
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin', role: 'superuser' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <RoleBasedRedirect />
        </MemoryRouter>
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/admin');

      // User role changes to evaluator
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'admin@example.com', name: 'Admin', role: 'evaluator' },
        token: 'valid-token',
        isAuthenticated: true,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn()
      });

      rerender(
        <MemoryRouter>
          <RoleBasedRedirect />
        </MemoryRouter>
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/dashboard');
    });
  });
});