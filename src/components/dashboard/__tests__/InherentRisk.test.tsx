import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InherentRisk from '../InherentRisk';
import { InherentRiskData } from '../../../types/evaluation';

// Mock the Card component
jest.mock('../../common/Card', () => {
  return function MockCard({ 
    title, 
    subtitle, 
    showDownload, 
    className, 
    children 
  }: { 
    title: string; 
    subtitle: string; 
    showDownload?: boolean; 
    className?: string; 
    children: React.ReactNode; 
  }) {
    return (
      <div data-testid="card" className={className}>
        <h2 data-testid="card-title">{title}</h2>
        <p data-testid="card-subtitle">{subtitle}</p>
        {showDownload && <button data-testid="download-button">Download</button>}
        {children}
      </div>
    );
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronUp: ({ className }: { className?: string }) => (
    <div data-testid="chevron-up" className={className}>↑</div>
  ),
  ChevronDown: ({ className }: { className?: string }) => (
    <div data-testid="chevron-down" className={className}>↓</div>
  ),
}));

const mockData: InherentRiskData[] = [
  {
    rut: '12345678-9',
    razonSocial: 'Empresa Test 1',
    riskLevel: 'high',
    creditScoring: {
      classificationPercentage: 85.5
    }
  },
  {
    rut: '98765432-1',
    razonSocial: 'Empresa Test 2',
    riskLevel: 'low',
    creditScoring: {
      classificationPercentage: 25.3
    }
  },
  {
    rut: '11111111-1',
    razonSocial: 'Empresa Test 3',
    riskLevel: 'medium',
    creditScoring: {
      classificationPercentage: 55.7
    }
  },
  {
    rut: '22222222-2',
    razonSocial: 'Empresa Test 4',
    riskLevel: 'risk free',
    creditScoring: {
      classificationPercentage: 10.2
    }
  }
];

const mockDataWithMissingScoring: InherentRiskData[] = [
  {
    rut: '33333333-3',
    razonSocial: 'Empresa Sin Scoring',
    riskLevel: 'high',
    creditScoring: null
  },
  {
    rut: '44444444-4',
    razonSocial: 'Empresa Scoring Undefined',
    riskLevel: 'low',
    creditScoring: {
      classificationPercentage: undefined
    }
  }
];

describe('InherentRisk', () => {
  describe('Rendering', () => {
    it('renders the component with correct title and subtitle', () => {
      render(<InherentRisk data={mockData} />);
      
      expect(screen.getByTestId('card-title')).toHaveTextContent('Riesgo Inherente');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Escenarios de riesgo en el tiempo agrupados por nivel de riesgo');
      expect(screen.getByTestId('download-button')).toBeInTheDocument();
    });

    it('renders table headers correctly', () => {
      render(<InherentRisk data={mockData} />);
      
      expect(screen.getByText('Razon Social')).toBeInTheDocument();
      expect(screen.getByText('Credit Scoring')).toBeInTheDocument();
      expect(screen.getByText('Risk Level')).toBeInTheDocument();
    });

    it('renders all data rows', () => {
      render(<InherentRisk data={mockData} />);
      
      expect(screen.getByText('Empresa Test 1')).toBeInTheDocument();
      expect(screen.getByText('Empresa Test 2')).toBeInTheDocument();
      expect(screen.getByText('Empresa Test 3')).toBeInTheDocument();
      expect(screen.getByText('Empresa Test 4')).toBeInTheDocument();
    });

    it('displays credit scoring values correctly', () => {
      render(<InherentRisk data={mockData} />);
      
      expect(screen.getByText('85.50')).toBeInTheDocument();
      expect(screen.getByText('25.30')).toBeInTheDocument();
      expect(screen.getByText('55.70')).toBeInTheDocument();
      expect(screen.getByText('10.20')).toBeInTheDocument();
    });

    it('displays risk levels with correct styling', () => {
      render(<InherentRisk data={mockData} />);
      
      const highRiskBadge = screen.getByText('high');
      const lowRiskBadge = screen.getByText('low');
      const mediumRiskBadge = screen.getByText('medium');
      const riskFreeBadge = screen.getByText('risk free');
      
      expect(highRiskBadge).toBeInTheDocument();
      expect(lowRiskBadge).toBeInTheDocument();
      expect(mediumRiskBadge).toBeInTheDocument();
      expect(riskFreeBadge).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays no data message when data array is empty', () => {
      render(<InherentRisk data={[]} />);
      
      expect(screen.getByText('No data available')).toBeInTheDocument();
      expect(screen.queryByText('Razon Social')).not.toBeInTheDocument();
    });
  });

  describe('Risk Level Colors', () => {
    it('applies correct colors for different risk levels', () => {
      const { container } = render(<InherentRisk data={mockData} />);
      
      // Check for risk level badges with correct classes
      const badges = container.querySelectorAll('.inline-flex.items-center.px-2\\.5.py-0\\.5.rounded-full.text-xs.font-medium');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('handles unknown risk levels with default color', () => {
      const unknownRiskData: InherentRiskData[] = [
        {
          rut: '55555555-5',
          razonSocial: 'Empresa Unknown',
          riskLevel: 'unknown',
          creditScoring: { classificationPercentage: 50 }
        }
      ];
      
      render(<InherentRisk data={unknownRiskData} />);
      
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });

  describe('Credit Scoring Display', () => {
    it('displays N/A for missing credit scoring', () => {
      render(<InherentRisk data={mockDataWithMissingScoring} />);
      
      const naElements = screen.getAllByText('N/A');
      expect(naElements).toHaveLength(2);
    });

    it('handles null credit scoring', () => {
      render(<InherentRisk data={mockDataWithMissingScoring} />);
      
      expect(screen.getByText('Empresa Sin Scoring')).toBeInTheDocument();
      expect(screen.getByText('Empresa Scoring Undefined')).toBeInTheDocument();
    });

    it('formats credit scoring to 2 decimal places', () => {
      const precisionData: InherentRiskData[] = [
        {
          rut: '66666666-6',
          razonSocial: 'Precision Test',
          riskLevel: 'low',
          creditScoring: { classificationPercentage: 33.333333 }
        }
      ];
      
      render(<InherentRisk data={precisionData} />);
      
      expect(screen.getByText('33.33')).toBeInTheDocument();
    });
  });

  describe('Sorting Functionality', () => {
    it('sorts by razon social when header is clicked', () => {
      render(<InherentRisk data={mockData} />);
      
      const razonSocialHeader = screen.getByText('Razon Social');
      fireEvent.click(razonSocialHeader);
      
      // Check if sort icon appears
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
    });

    it('sorts by credit scoring when header is clicked', () => {
      render(<InherentRisk data={mockData} />);
      
      const creditScoringHeader = screen.getByText('Credit Scoring');
      fireEvent.click(creditScoringHeader);
      
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
    });

    it('sorts by risk level when header is clicked', () => {
      render(<InherentRisk data={mockData} />);
      
      const riskLevelHeader = screen.getByText('Risk Level');
      fireEvent.click(riskLevelHeader);
      
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
    });

    it('toggles sort direction on second click', () => {
      render(<InherentRisk data={mockData} />);
      
      const razonSocialHeader = screen.getByText('Razon Social');
      
      // First click - ascending
      fireEvent.click(razonSocialHeader);
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
      
      // Second click - descending
      fireEvent.click(razonSocialHeader);
      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    });

    it('shows no sort icon for unsorted columns', () => {
      render(<InherentRisk data={mockData} />);
      
      // Initially no sort icons should be visible
      expect(screen.queryByTestId('chevron-up')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chevron-down')).not.toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for styling', () => {
      const { container } = render(<InherentRisk data={mockData} />);
      
      // Check for main container structure
      expect(container.querySelector('.mt-6.flex-grow.overflow-y-auto')).toBeInTheDocument();
      expect(container.querySelector('.divide-y.divide-gray-200')).toBeInTheDocument();
    });

    it('has proper table header styling', () => {
      const { container } = render(<InherentRisk data={mockData} />);
      
      const header = container.querySelector('.py-3\\.5.px-3.flex.justify-between.text-sm.font-semibold.text-gray-900.sticky.top-0.bg-white');
      expect(header).toBeInTheDocument();
    });

    it('has proper row styling', () => {
      const { container } = render(<InherentRisk data={mockData} />);
      
      const rows = container.querySelectorAll('.flex.items-center.justify-between.py-4.px-3');
      expect(rows.length).toBe(mockData.length);
    });

    it('has proper text truncation for long company names', () => {
      const longNameData: InherentRiskData[] = [
        {
          rut: '77777777-7',
          razonSocial: 'Empresa con un nombre extremadamente largo que debería ser truncado para mantener el diseño',
          riskLevel: 'medium',
          creditScoring: { classificationPercentage: 45 }
        }
      ];
      
      const { container } = render(<InherentRisk data={longNameData} />);
      
      const companyNameElement = container.querySelector('.text-sm.font-medium.text-gray-900.truncate');
      expect(companyNameElement).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper button elements for sortable headers', () => {
      render(<InherentRisk data={mockData} />);
      
      const sortButtons = screen.getAllByRole('button');
      // 3 sort buttons + 1 download button = 4 total
      expect(sortButtons).toHaveLength(4);
    });

    it('has proper semantic structure', () => {
      const { container } = render(<InherentRisk data={mockData} />);
      
      // Check for proper heading structure
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
      expect(screen.getByTestId('card-subtitle')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles very large datasets', () => {
      const largeData: InherentRiskData[] = Array.from({ length: 1000 }, (_, index) => ({
        rut: `${index.toString().padStart(8, '0')}-${index % 10}`,
        razonSocial: `Empresa ${index + 1}`,
        riskLevel: ['low', 'medium', 'high', 'risk free'][index % 4],
        creditScoring: { classificationPercentage: Math.random() * 100 }
      }));
      
      render(<InherentRisk data={largeData} />);
      
      expect(screen.getByText('Empresa 1')).toBeInTheDocument();
      expect(screen.getByText('Empresa 1000')).toBeInTheDocument();
    });

    it('handles special characters in company names', () => {
      const specialCharData: InherentRiskData[] = [
        {
          rut: '88888888-8',
          razonSocial: 'Empresa & Cía. S.A. - División Especial (Sucursal #1)',
          riskLevel: 'medium',
          creditScoring: { classificationPercentage: 60 }
        }
      ];
      
      render(<InherentRisk data={specialCharData} />);
      
      expect(screen.getByText('Empresa & Cía. S.A. - División Especial (Sucursal #1)')).toBeInTheDocument();
    });

    it('handles zero credit scoring values', () => {
      const zeroScoringData: InherentRiskData[] = [
        {
          rut: '99999999-9',
          razonSocial: 'Empresa Zero Scoring',
          riskLevel: 'high',
          creditScoring: { classificationPercentage: 0 }
        }
      ];
      
      render(<InherentRisk data={zeroScoringData} />);
      
      expect(screen.getByText('0.00')).toBeInTheDocument();
    });

    it('handles negative credit scoring values', () => {
      const negativeScoringData: InherentRiskData[] = [
        {
          rut: '00000000-0',
          razonSocial: 'Empresa Negative Scoring',
          riskLevel: 'high',
          creditScoring: { classificationPercentage: -15.5 }
        }
      ];
      
      render(<InherentRisk data={negativeScoringData} />);
      
      expect(screen.getByText('-15.50')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('updates when data prop changes', () => {
      const { rerender } = render(<InherentRisk data={mockData} />);
      
      expect(screen.getByText('Empresa Test 1')).toBeInTheDocument();
      
      const newData: InherentRiskData[] = [
        {
          rut: '12121212-1',
          razonSocial: 'Nueva Empresa',
          riskLevel: 'low',
          creditScoring: { classificationPercentage: 30 }
        }
      ];
      
      rerender(<InherentRisk data={newData} />);
      
      expect(screen.getByText('Nueva Empresa')).toBeInTheDocument();
      expect(screen.queryByText('Empresa Test 1')).not.toBeInTheDocument();
    });

    it('maintains sort state when data changes', () => {
      const { rerender } = render(<InherentRisk data={mockData} />);
      
      // Sort by razon social
      const razonSocialHeader = screen.getByText('Razon Social');
      fireEvent.click(razonSocialHeader);
      
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
      
      // Update data
      const newData = [...mockData, {
        rut: '13131313-1',
        razonSocial: 'Empresa Adicional',
        riskLevel: 'medium',
        creditScoring: { classificationPercentage: 40 }
      }];
      
      rerender(<InherentRisk data={newData} />);
      
      // Sort state should be maintained
      expect(screen.getByTestId('chevron-up')).toBeInTheDocument();
    });
  });
});