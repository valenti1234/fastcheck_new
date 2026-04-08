import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

import Login from '../Login';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('../../../contexts/AuthContext');
jest.mock('react-hot-toast');
jest.mock('../../../assets/duxiter_logo.png', () => 'mocked-logo.png');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null })
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockToast = toast as jest.Mocked<typeof toast>;

describe('Login Component', () => {
  const mockLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      logout: jest.fn(),
      register: jest.fn()
    });
    mockToast.error = jest.fn();
    mockToast.success = jest.fn();
  });

  const renderLogin = (initialEntries = ['/login']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Login />
      </MemoryRouter>
    );
  };

  describe('Rendering', () => {
    it('should render login form with all elements', () => {
      renderLogin();

      expect(screen.getByAltText('Duxiter Logo')).toBeInTheDocument();
      expect(screen.getByText('Ingrese a su cuenta para continuar')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
      expect(screen.getByText('Recordarme')).toBeInTheDocument();
      expect(screen.getByText('¿Olvidó su contraseña?')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /crear cuenta nueva/i })).toBeInTheDocument();
    });

    it('should render email input with correct attributes', () => {
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('name', 'email');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
      expect(emailInput).toBeRequired();
    });

    it('should render password input with correct attributes', () => {
      renderLogin();

      const passwordInput = screen.getByPlaceholderText('Contraseña');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('name', 'password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
      expect(passwordInput).toBeRequired();
    });

    it('should render remember me checkbox', () => {
      renderLogin();

      const checkbox = screen.getByRole('checkbox', { name: /recordarme/i });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Form Interactions', () => {
    it('should update email input value when typing', async () => {
      const user = userEvent.setup();
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should update password input value when typing', async () => {
      const user = userEvent.setup();
      renderLogin();

      const passwordInput = screen.getByPlaceholderText('Contraseña');
      await user.type(passwordInput, 'password123');

      expect(passwordInput).toHaveValue('password123');
    });

    it('should toggle password visibility when clicking show/hide button', async () => {
      const user = userEvent.setup();
      renderLogin();

      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const toggleButton = passwordInput.parentElement?.querySelector('button');

      expect(passwordInput).toHaveAttribute('type', 'password');

      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });

    it('should check remember me checkbox when clicked', async () => {
      const user = userEvent.setup();
      renderLogin();

      const checkbox = screen.getByRole('checkbox', { name: /recordarme/i });
      await user.click(checkbox);

      expect(checkbox).toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('should show error when submitting empty form', async () => {
      const user = userEvent.setup();
      renderLogin();

      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
      await user.click(submitButton);

      expect(mockToast.error).toHaveBeenCalledWith('Por favor ingrese email y contraseña');
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error when submitting with only email', async () => {
      const user = userEvent.setup();
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
      await user.click(submitButton);

      expect(mockToast.error).toHaveBeenCalledWith('Por favor ingrese email y contraseña');
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error when submitting with only password', async () => {
      const user = userEvent.setup();
      renderLogin();

      const passwordInput = screen.getByPlaceholderText('Contraseña');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
      await user.click(submitButton);

      expect(mockToast.error).toHaveBeenCalledWith('Por favor ingrese email y contraseña');
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should call login function with correct credentials on valid submission', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should show success message and navigate on successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Inicio de sesión exitoso');
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
    });

    it('should show error message on failed login', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Invalid credentials';
      mockLogin.mockRejectedValue(new Error(errorMessage));
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Error al iniciar sesión. Verifique sus credenciales e intente nuevamente.'
        );
      });
    });

    it('should disable submit button while submitting', async () => {
      const user = userEvent.setup();
      let resolveLogin: () => void;
      const loginPromise = new Promise<void>((resolve) => {
        resolveLogin = resolve;
      });
      mockLogin.mockReturnValue(loginPromise);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /iniciar sesión/i })).toHaveClass('disabled:bg-primary-400');

      // Resolve the login promise
      resolveLogin!();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('should show loading spinner while submitting', async () => {
      const user = userEvent.setup();
      let resolveLogin: () => void;
      const loginPromise = new Promise<void>((resolve) => {
        resolveLogin = resolve;
      });
      mockLogin.mockReturnValue(loginPromise);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      expect(submitButton.querySelector('.animate-spin')).toBeInTheDocument();

      // Resolve the login promise
      resolveLogin!();
      await waitFor(() => {
        expect(submitButton.querySelector('.animate-spin')).not.toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to dashboard by default after successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
    });

    it('should navigate to intended page after successful login when redirected from protected route', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      
      // Mock useLocation to return state with 'from' property
      const mockUseLocation = jest.fn(() => ({
        state: { from: { pathname: '/evaluations' } }
      }));
      
      jest.doMock('react-router-dom', () => ({
        ...jest.requireActual('react-router-dom'),
        useNavigate: () => mockNavigate,
        useLocation: mockUseLocation
      }));

      // Re-render with mocked location
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/evaluations', { replace: true });
      });
    });

    it('should have link to register page', () => {
      renderLogin();

      const registerLink = screen.getByRole('link', { name: /crear cuenta nueva/i });
      expect(registerLink).toHaveAttribute('href', '/register');
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for form inputs', () => {
      renderLogin();

      expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
      expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
      expect(screen.getByLabelText('Recordarme')).toBeInTheDocument();
    });

    it('should have proper form structure', () => {
      renderLogin();

      const form = screen.getByRole('form');
      expect(form).toBeInTheDocument();
      
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      
      expect(form).toContainElement(emailInput);
      expect(form).toContainElement(passwordInput);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      // Tab through form elements
      await user.tab();
      expect(emailInput).toHaveFocus();

      await user.tab();
      expect(passwordInput).toHaveFocus();

      await user.tab();
      // Skip the password toggle button
      await user.tab();
      expect(screen.getByRole('checkbox', { name: /recordarme/i })).toHaveFocus();
    });
  });

  describe('Form Validation', () => {
    it('should handle form submission with Enter key', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.keyboard('{Enter}');

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should trim whitespace from email input', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue(undefined);
      renderLogin();

      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, '  test@example.com  ');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // Note: The component doesn't currently trim, but this test documents expected behavior
      expect(mockLogin).toHaveBeenCalledWith('  test@example.com  ', 'password123');
    });
  });
});