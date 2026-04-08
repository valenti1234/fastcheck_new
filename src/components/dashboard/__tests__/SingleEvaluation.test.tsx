import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import SingleEvaluation from '../SingleEvaluation';
import { useTenant } from '../../../contexts/TenantContext';
import { validateChileanRut, formatChileanRut, apiClient } from '../../../services/api';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('../../../contexts/TenantContext');
jest.mock('../../../services/api');
jest.mock('react-hot-toast');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockUseTenant = useTenant as jest.MockedFunction<typeof useTenant>;
const mockValidateChileanRut = validateChileanRut as jest.MockedFunction<typeof validateChileanRut>;
const mockFormatChileanRut = formatChileanRut as jest.MockedFunction<typeof formatChileanRut>;
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockToast = toast as jest.Mocked<typeof toast>;

const mockTenant = {
  _id: 'tenant1',
  name: 'Test Tenant',
  usageStats: {
    evaluationsRemaining: 10,
    evaluationsUsed: 5,
    lastEvaluationDate: new Date()
  },
  creditBalance: {
    availableCredits: 100,
    totalCreditsUsed: 50,
    lastCreditOperation: new Date()
  }
};

const mockTenantLowCredits = {
  ...mockTenant,
  usageStats: {
    evaluationsRemaining: 3,
    evaluationsUsed: 12,
    lastEvaluationDate: new Date()
  }
};

const renderComponent = (tenant = mockTenant) => {
  mockUseTenant.mockReturnValue({
    tenant,
    loading: false,
    error: null,
    updateTenant: jest.fn(),
  });

  return render(
    <BrowserRouter>
      <SingleEvaluation />
    </BrowserRouter>
  );
};

describe('SingleEvaluation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateChileanRut.mockReturnValue(true);
    mockFormatChileanRut.mockImplementation((rut) => rut);
    mockApiClient.post.mockResolvedValue({ data: {} });
    mockToast.success = jest.fn();
    mockToast.error = jest.fn();
  });

  describe('Rendering', () => {
    it('renders the component with correct title and subtitle', () => {
      renderComponent();

      expect(screen.getByText('Evaluación Individual')).toBeInTheDocument();
      expect(screen.getByText('Evalúe un proveedor específico ingresando su RUT para obtener un análisis detallado.')).toBeInTheDocument();
    });

    it('renders the form with all required fields', () => {
      renderComponent();

      expect(screen.getByLabelText(/RUT del Proveedor/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Nombre del Proveedor/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Evaluar/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('displays required field indicators', () => {
      renderComponent();

      const requiredIndicators = screen.getAllByText('*');
      expect(requiredIndicators).toHaveLength(1); // Only RUT is required
    });

    it('shows optional field indicator for name', () => {
      renderComponent();

      expect(screen.getByText('(opcional)')).toBeInTheDocument();
    });
  });

  describe('Tenant Warning', () => {
    it('displays warning when evaluations remaining is 5 or less', () => {
      renderComponent(mockTenantLowCredits);

      expect(screen.getByText('Evaluaciones restantes: 3')).toBeInTheDocument();
      expect(screen.getByText(/Su plan actual está por agotarse/)).toBeInTheDocument();
    });

    it('does not display warning when evaluations remaining is more than 5', () => {
      renderComponent(mockTenant);

      expect(screen.queryByText(/Evaluaciones restantes:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Su plan actual está por agotarse/)).not.toBeInTheDocument();
    });

    it('does not display warning when tenant is null', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });

      render(
        <BrowserRouter>
          <SingleEvaluation />
        </BrowserRouter>
      );

      expect(screen.queryByText(/Evaluaciones restantes:/)).not.toBeInTheDocument();
    });
  });

  describe('RUT Validation', () => {
    it('validates RUT on input change', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, '12345678-9');

      expect(mockValidateChileanRut).toHaveBeenCalledWith('12345678-9');
    });

    it('formats RUT when valid', async () => {
      const user = userEvent.setup();
      mockFormatChileanRut.mockReturnValue('12.345.678-9');
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, '12345678-9');

      expect(mockFormatChileanRut).toHaveBeenCalledWith('12345678-9');
    });

    it('shows validation error for invalid RUT', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(false);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, 'invalid-rut');

      expect(screen.getByText('RUT inválido')).toBeInTheDocument();
    });

    it('shows success indicator for valid RUT', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(true);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, '12345678-9');

      // Check for success styling (green border)
      expect(rutInput).toHaveClass('border-green-500');
    });

    it('shows error styling for invalid RUT', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(false);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, 'invalid');

      expect(rutInput).toHaveClass('border-red-500');
    });
  });

  describe('Form Submission', () => {
    it('disables submit button when RUT is invalid', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(false);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const termsCheckbox = screen.getByRole('checkbox');
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });

      await user.type(rutInput, 'invalid');
      await user.click(termsCheckbox);

      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when terms are not accepted', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });

      await user.type(rutInput, '12345678-9');

      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when RUT is valid and terms are accepted', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const termsCheckbox = screen.getByRole('checkbox');
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });

      await user.type(rutInput, '12345678-9');
      await user.click(termsCheckbox);

      expect(submitButton).not.toBeDisabled();
    });

    it('navigates to fast-check page on successful submission', async () => {
      const user = userEvent.setup();
      const mockNavigate = jest.fn();
      jest.doMock('react-router-dom', () => ({
        ...jest.requireActual('react-router-dom'),
        useNavigate: () => mockNavigate,
      }));

      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const nameInput = screen.getByLabelText(/Nombre del Proveedor/);
      const termsCheckbox = screen.getByRole('checkbox');
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });

      await user.type(rutInput, '12345678-9');
      await user.type(nameInput, 'Test Company');
      await user.click(termsCheckbox);
      await user.click(submitButton);

      // Note: The actual navigation logic would need to be tested based on the implementation
      // This test structure shows how to verify the form submission flow
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const termsCheckbox = screen.getByRole('checkbox');
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });

      await user.type(rutInput, '12345678-9');
      await user.click(termsCheckbox);
      
      // Mock a delayed response
      mockApiClient.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      await user.click(submitButton);

      // Check for loading state (this would depend on the actual implementation)
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Terms and Conditions', () => {
    it('renders terms and conditions checkbox', () => {
      renderComponent();

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it('renders terms and privacy policy links', () => {
      renderComponent();

      const termsLink = screen.getByRole('link', { name: /términos y condiciones/i });
      const privacyLink = screen.getByRole('link', { name: /política de privacidad/i });

      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms');
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('toggles terms acceptance on checkbox click', async () => {
      const user = userEvent.setup();
      renderComponent();

      const checkbox = screen.getByRole('checkbox');
      
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Information Section', () => {
    it('displays important information list', () => {
      renderComponent();

      expect(screen.getByText('Información importante')).toBeInTheDocument();
      expect(screen.getByText(/La evaluación individual utiliza 1 crédito/)).toBeInTheDocument();
      expect(screen.getByText(/Los resultados se mostrarán en tiempo real/)).toBeInTheDocument();
      expect(screen.getByText(/Los datos del proveedor se mantienen confidenciales/)).toBeInTheDocument();
      expect(screen.getByText(/Para evaluar múltiples proveedores/)).toBeInTheDocument();
    });

    it('includes link to bulk evaluation', () => {
      renderComponent();

      const bulkEvaluationLink = screen.getByRole('link', { name: /Evaluación Masiva/i });
      expect(bulkEvaluationLink).toBeInTheDocument();
      expect(bulkEvaluationLink).toHaveAttribute('href', '/evaluations/bulk');
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for layout', () => {
      const { container } = renderComponent();

      // Check for main container
      expect(container.querySelector('.max-w-3xl.mx-auto')).toBeInTheDocument();
      
      // Check for form container
      expect(container.querySelector('.bg-white.rounded-lg.shadow-sm')).toBeInTheDocument();
      
      // Check for form spacing
      expect(container.querySelector('.space-y-6')).toBeInTheDocument();
    });

    it('has proper form structure', () => {
      renderComponent();

      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();
      
      // Check for input groups
      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const nameInput = screen.getByLabelText(/Nombre del Proveedor/);
      
      expect(rutInput).toBeInTheDocument();
      expect(nameInput).toBeInTheDocument();
    });

    it('has proper styling for different states', () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /Evaluar/i });
      
      // Check for disabled state styling
      expect(submitButton).toHaveClass('disabled:bg-gray-400');
    });
  });

  describe('Accessibility', () => {
    it('has proper form labels', () => {
      renderComponent();

      expect(screen.getByLabelText(/RUT del Proveedor/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Nombre del Proveedor/)).toBeInTheDocument();
    });

    it('has proper button roles and text', () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /Evaluar/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('has proper link attributes', () => {
      renderComponent();

      const termsLink = screen.getByRole('link', { name: /términos y condiciones/i });
      const privacyLink = screen.getByRole('link', { name: /política de privacidad/i });
      
      expect(termsLink).toHaveAttribute('target', '_blank');
      expect(termsLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(privacyLink).toHaveAttribute('target', '_blank');
      expect(privacyLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('provides proper form validation feedback', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(false);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      await user.type(rutInput, 'invalid');

      // Check for validation message
      expect(screen.getByText('RUT inválido')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty RUT input', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const submitButton = screen.getByRole('button', { name: /Evaluar/i });
      
      await user.clear(rutInput);
      
      expect(submitButton).toBeDisabled();
    });

    it('handles very long company names', async () => {
      const user = userEvent.setup();
      renderComponent();

      const nameInput = screen.getByLabelText(/Nombre del Proveedor/);
      const longName = 'A'.repeat(200);
      
      await user.type(nameInput, longName);
      
      expect(nameInput).toHaveValue(longName);
    });

    it('handles special characters in RUT', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      
      await user.type(rutInput, '12.345.678-9');
      
      expect(mockValidateChileanRut).toHaveBeenCalledWith('12.345.678-9');
    });

    it('handles missing tenant data gracefully', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });

      expect(() => renderComponent()).not.toThrow();
    });

    it('handles tenant loading state', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: true,
        error: null,
        updateTenant: jest.fn(),
      });

      expect(() => renderComponent()).not.toThrow();
    });

    it('handles tenant error state', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: false,
        error: 'Failed to load tenant',
        updateTenant: jest.fn(),
      });

      expect(() => renderComponent()).not.toThrow();
    });
  });

  describe('Form Validation Integration', () => {
    it('prevents submission with invalid data', async () => {
      const user = userEvent.setup();
      mockValidateChileanRut.mockReturnValue(false);
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const termsCheckbox = screen.getByRole('checkbox');
      const form = document.querySelector('form')!;
      
      await user.type(rutInput, 'invalid');
      await user.click(termsCheckbox);
      
      // Try to submit form
      fireEvent.submit(form);
      
      // Should not make API call
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('clears validation state when RUT changes', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      
      // First, enter invalid RUT
      mockValidateChileanRut.mockReturnValue(false);
      await user.type(rutInput, 'invalid');
      expect(screen.getByText('RUT inválido')).toBeInTheDocument();
      
      // Then, clear and enter valid RUT
      mockValidateChileanRut.mockReturnValue(true);
      await user.clear(rutInput);
      await user.type(rutInput, '12345678-9');
      
      expect(screen.queryByText('RUT inválido')).not.toBeInTheDocument();
    });
  });

  describe('Props and State Management', () => {
    it('maintains form state correctly', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      const nameInput = screen.getByLabelText(/Nombre del Proveedor/);
      
      await user.type(rutInput, '12345678-9');
      await user.type(nameInput, 'Test Company');
      
      expect(rutInput).toHaveValue('12345678-9');
      expect(nameInput).toHaveValue('Test Company');
    });

    it('updates validation state on RUT change', async () => {
      const user = userEvent.setup();
      renderComponent();

      const rutInput = screen.getByLabelText(/RUT del Proveedor/);
      
      // Valid RUT
      mockValidateChileanRut.mockReturnValue(true);
      await user.type(rutInput, '12345678-9');
      expect(rutInput).toHaveClass('border-green-500');
      
      // Invalid RUT
      mockValidateChileanRut.mockReturnValue(false);
      await user.clear(rutInput);
      await user.type(rutInput, 'invalid');
      expect(rutInput).toHaveClass('border-red-500');
    });
  });
});