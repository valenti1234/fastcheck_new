import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import Register from '../Register';
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
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockToast = toast as jest.Mocked<typeof toast>;

describe('Register Component', () => {
  const mockRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      register: mockRegister,
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      login: jest.fn(),
      logout: jest.fn()
    });
    mockToast.error = jest.fn();
    mockToast.success = jest.fn();
  });

  const renderRegister = () => {
    return render(
      <BrowserRouter>
        <Register />
      </BrowserRouter>
    );
  };

  describe('Rendering', () => {
    it('renders all form elements correctly', () => {
      renderRegister();
      
      expect(screen.getByRole('img', { name: /duxiter logo/i })).toBeInTheDocument();
      expect(screen.getByText('Cree su cuenta para comenzar')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Nombre completo')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument();
    });

    it('has proper form structure and accessibility', () => {
      renderRegister();
      
      const nameInput = screen.getByLabelText(/nombre/i);
      const emailInput = screen.getByLabelText(/correo electrónico/i);
      const passwordInput = screen.getByLabelText(/contraseña/i);
      const termsCheckbox = screen.getByLabelText(/acepto los términos y condiciones/i);
      
      expect(nameInput).toHaveAttribute('type', 'text');
      expect(nameInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('required');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('required');
      expect(termsCheckbox).toHaveAttribute('type', 'checkbox');
      expect(termsCheckbox).toHaveAttribute('required');
    });
  });

  describe('Form Interactions', () => {
    it('updates input values when user types', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      
      expect(nameInput).toHaveValue('John Doe');
      expect(emailInput).toHaveValue('john@example.com');
      expect(passwordInput).toHaveValue('password123');
    });

    it('toggles terms checkbox when clicked', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      
      expect(termsCheckbox).not.toBeChecked();
      
      await user.click(termsCheckbox);
      expect(termsCheckbox).toBeChecked();
      
      await user.click(termsCheckbox);
      expect(termsCheckbox).not.toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('shows error when submitting with empty fields', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      await user.click(submitButton);
      
      expect(mockToast.error).toHaveBeenCalledWith('Por favor complete todos los campos');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows error when submitting with only name filled', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.click(submitButton);
      
      expect(mockToast.error).toHaveBeenCalledWith('Por favor complete todos los campos');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows error when submitting with only name and email filled', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.click(submitButton);
      
      expect(mockToast.error).toHaveBeenCalledWith('Por favor complete todos los campos');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('calls register function with correct data when form is valid', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(termsCheckbox);
      await user.click(submitButton);
      
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      });
    });

    it('navigates to dashboard after successful registration', async () => {
      const user = userEvent.setup();
      mockRegister.mockResolvedValueOnce(undefined);
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(termsCheckbox);
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
    });

    it('handles registration error gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRegister.mockRejectedValueOnce(new Error('Registration failed'));
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(termsCheckbox);
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Register error:', expect.any(Error));
      });
      
      consoleErrorSpy.mockRestore();
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      let resolveRegister: () => void;
      const registerPromise = new Promise<void>((resolve) => {
        resolveRegister = resolve;
      });
      mockRegister.mockReturnValueOnce(registerPromise);
      
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(termsCheckbox);
      await user.click(submitButton);
      
      // Check loading state
      expect(submitButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /crear cuenta/i })).toHaveClass('disabled:bg-primary-400');
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
      
      // Resolve the promise
      resolveRegister!();
      
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to login page when login link is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      );
      
      const loginLink = screen.getByRole('link', { name: /iniciar sesión/i });
      expect(loginLink).toHaveAttribute('href', '/login');
    });
  });

  describe('Accessibility', () => {
    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
      
      // Tab through form elements
      await user.tab();
      expect(nameInput).toHaveFocus();
      
      await user.tab();
      expect(emailInput).toHaveFocus();
      
      await user.tab();
      expect(passwordInput).toHaveFocus();
      
      await user.tab();
      expect(termsCheckbox).toHaveFocus();
      
      await user.tab();
      expect(submitButton).toHaveFocus();
    });

    it('submits form when Enter is pressed in input fields', async () => {
      const user = userEvent.setup();
      renderRegister();
      
      const nameInput = screen.getByPlaceholderText('Nombre completo');
      const emailInput = screen.getByPlaceholderText('Correo electrónico');
      const passwordInput = screen.getByPlaceholderText('Contraseña');
      const termsCheckbox = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i });
      
      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(termsCheckbox);
      
      await user.type(passwordInput, '{enter}');
      
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      });
    });
  });
});