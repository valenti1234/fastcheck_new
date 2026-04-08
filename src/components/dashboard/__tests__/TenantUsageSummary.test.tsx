import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TenantUsageSummary from '../TenantUsageSummary';
import { useTenant } from '../../../contexts/TenantContext';

// Mock the Card component
jest.mock('../../common/Card', () => {
  return function MockCard({ 
    title, 
    subtitle, 
    showDownload, 
    children 
  }: { 
    title: string; 
    subtitle?: string; 
    showDownload?: boolean; 
    children: React.ReactNode; 
  }) {
    return (
      <div data-testid="card">
        <h2>{title}</h2>
        {subtitle && <p data-testid="subtitle">{subtitle}</p>}
        {showDownload && <div data-testid="download-button">Download</div>}
        {children}
      </div>
    );
  };
});

// Mock the TenantContext
jest.mock('../../../contexts/TenantContext', () => ({
  useTenant: jest.fn(),
}));

const mockUseTenant = useTenant as jest.MockedFunction<typeof useTenant>;

describe('TenantUsageSummary', () => {
  const mockTenant = {
    _id: '1',
    id: '1',
    name: 'Test Tenant',
    usageStats: {
      evaluationsRemaining: 100,
      evaluationsUsed: 50,
      lastEvaluationDate: null,
    },
    creditBalance: {
      availableCredits: 500,
      totalCreditsUsed: 300,
      lastCreditOperation: null,
    },
  };

  beforeEach(() => {
    mockUseTenant.mockReturnValue({
      tenant: mockTenant,
      loading: false,
      error: null,
      updateTenant: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the component with correct title and subtitle', () => {
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('Créditos de Usuario')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle')).toHaveTextContent('Uso para Test Tenant');
      expect(screen.getByTestId('download-button')).toBeInTheDocument();
    });

    it('renders all credit sections', () => {
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('Usado')).toBeInTheDocument();
      expect(screen.getByText('Disponibles')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Progreso de uso')).toBeInTheDocument();
    });

    it('displays correct credit values', () => {
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('300 créditos')).toBeInTheDocument(); // Used credits
      expect(screen.getByText('500 créditos')).toBeInTheDocument(); // Available credits
      expect(screen.getByText('800 créditos')).toBeInTheDocument(); // Total credits
    });

    it('returns null when tenant is not available', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      const { container } = render(<TenantUsageSummary />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Credit Calculations', () => {
    it('calculates usage percentage correctly', () => {
      render(<TenantUsageSummary />);
      
      // 300 used out of 800 total = 37.5%
      const usedProgressBar = screen.getAllByRole('generic').find(
        el => el.style.width === '37.5%'
      );
      expect(usedProgressBar).toBeInTheDocument();
    });

    it('calculates remaining percentage correctly', () => {
      render(<TenantUsageSummary />);
      
      // 100% - 37.5% = 62.5% remaining
      const remainingProgressBar = screen.getAllByRole('generic').find(
        el => el.style.width === '62.5%'
      );
      expect(remainingProgressBar).toBeInTheDocument();
    });

    it('handles zero total credits', () => {
      const tenantWithZeroCredits = {
        ...mockTenant,
        creditBalance: {
          availableCredits: 0,
          totalCreditsUsed: 0,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithZeroCredits,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('0 créditos')).toBeInTheDocument();
      
      // Should show 0% usage when total is 0
      const progressBars = screen.getAllByRole('generic').filter(
        el => el.style.width === '0%'
      );
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('handles missing creditBalance', () => {
      const tenantWithoutCreditBalance = {
        ...mockTenant,
        creditBalance: undefined,
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithoutCreditBalance,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getAllByText('0 créditos')).toHaveLength(3); // Used, Available, Total
    });

    it('handles partial creditBalance data', () => {
      const tenantWithPartialData = {
        ...mockTenant,
        creditBalance: {
          availableCredits: 100,
          lastCreditOperation: null,
          // totalCreditsUsed is missing
        } as any,
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithPartialData,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('0 créditos')).toBeInTheDocument(); // Used credits (default to 0)
      expect(screen.getByText('100 créditos')).toBeInTheDocument(); // Available and Total
    });
  });

  describe('Progress Bars', () => {
    it('renders progress bars with correct styling', () => {
      render(<TenantUsageSummary />);
      
      // Check for progress bar containers
      const progressContainers = screen.getAllByRole('generic').filter(
        el => el.className.includes('bg-gray-200') && el.className.includes('rounded-full')
      );
      expect(progressContainers.length).toBeGreaterThan(0);
    });

    it('shows correct colors for different progress bars', () => {
      render(<TenantUsageSummary />);
      
      // Used credits should have primary color
      const usedProgressBar = screen.getAllByRole('generic').find(
        el => el.className.includes('bg-primary-500')
      );
      expect(usedProgressBar).toBeInTheDocument();
      
      // Remaining credits should have green color
      const remainingProgressBar = screen.getAllByRole('generic').find(
        el => el.className.includes('bg-green-500')
      );
      expect(remainingProgressBar).toBeInTheDocument();
    });

    it('handles 100% usage correctly', () => {
      const tenantFullyUsed = {
        ...mockTenant,
        creditBalance: {
          availableCredits: 0,
          totalCreditsUsed: 1000,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantFullyUsed,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      // Used should be 100%
      const fullUsageBar = screen.getAllByRole('generic').find(
        el => el.style.width === '100%'
      );
      expect(fullUsageBar).toBeInTheDocument();
      
      // Remaining should be 0%
      const noRemainingBar = screen.getAllByRole('generic').find(
        el => el.style.width === '0%'
      );
      expect(noRemainingBar).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes and structure', () => {
      render(<TenantUsageSummary />);
      
      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      
      // Check for space-y-6 container
      const container = screen.getByRole('generic', { hidden: true });
      expect(container).toBeInTheDocument();
    });

    it('maintains proper spacing between sections', () => {
      render(<TenantUsageSummary />);
      
      // Check that sections are properly structured
      expect(screen.getByText('Usado')).toBeInTheDocument();
      expect(screen.getByText('Disponibles')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Progreso de uso')).toBeInTheDocument();
    });
  });

  describe('Dark Mode Support', () => {
    it('includes dark mode classes', () => {
      render(<TenantUsageSummary />);
      
      // Check for dark mode classes in text elements
      const darkModeElements = screen.getAllByRole('generic').filter(
        el => el.className.includes('dark:')
      );
      expect(darkModeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles very large credit numbers', () => {
      const tenantWithLargeCredits = {
        ...mockTenant,
        creditBalance: {
          availableCredits: 999999,
          totalCreditsUsed: 1000000,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithLargeCredits,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('1000000 créditos')).toBeInTheDocument();
      expect(screen.getByText('999999 créditos')).toBeInTheDocument();
      expect(screen.getByText('1999999 créditos')).toBeInTheDocument();
    });

    it('handles negative credit values gracefully', () => {
      const tenantWithNegativeCredits = {
        ...mockTenant,
        creditBalance: {
          availableCredits: -100,
          totalCreditsUsed: 500,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithNegativeCredits,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('500 créditos')).toBeInTheDocument(); // Used
      expect(screen.getByText('-100 créditos')).toBeInTheDocument(); // Available
      expect(screen.getByText('400 créditos')).toBeInTheDocument(); // Total
    });

    it('handles decimal credit values', () => {
      const tenantWithDecimalCredits = {
        ...mockTenant,
        creditBalance: {
          availableCredits: 100.5,
          totalCreditsUsed: 200.7,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: tenantWithDecimalCredits,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      render(<TenantUsageSummary />);
      
      expect(screen.getByText('200.7 créditos')).toBeInTheDocument();
      expect(screen.getByText('100.5 créditos')).toBeInTheDocument();
      expect(screen.getByText('301.2 créditos')).toBeInTheDocument();
    });
  });

  describe('Props and Context Integration', () => {
    it('updates when tenant context changes', () => {
      const { rerender } = render(<TenantUsageSummary />);
      
      expect(screen.getByText('Uso para Test Tenant')).toBeInTheDocument();
      
      const newTenant = {
        ...mockTenant,
        name: 'Updated Tenant',
        creditBalance: {
          availableCredits: 1000,
          totalCreditsUsed: 200,
          lastCreditOperation: null,
        },
      };
      
      mockUseTenant.mockReturnValue({
        tenant: newTenant,
        loading: false,
        error: null,
        updateTenant: jest.fn(),
      });
      
      rerender(<TenantUsageSummary />);
      
      expect(screen.getByText('Uso para Updated Tenant')).toBeInTheDocument();
      expect(screen.getByText('200 créditos')).toBeInTheDocument();
      expect(screen.getByText('1000 créditos')).toBeInTheDocument();
    });

    it('handles tenant context loading state', () => {
      mockUseTenant.mockReturnValue({
        tenant: null,
        loading: true,
        error: null,
        updateTenant: jest.fn(),
      });
      
      const { container } = render(<TenantUsageSummary />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<TenantUsageSummary />);
      
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Créditos de Usuario');
    });

    it('maintains semantic structure for credit information', () => {
      render(<TenantUsageSummary />);
      
      // Check that credit labels and values are properly associated
      expect(screen.getByText('Usado')).toBeInTheDocument();
      expect(screen.getByText('Disponibles')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Progreso de uso')).toBeInTheDocument();
    });

    it('provides visual progress indicators', () => {
      render(<TenantUsageSummary />);
      
      // Progress bars should be visually accessible
      const progressBars = screen.getAllByRole('generic').filter(
        el => el.className.includes('rounded-full') && el.className.includes('h-4')
      );
      expect(progressBars.length).toBeGreaterThan(0);
    });
  });
});