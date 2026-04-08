import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProgramOverview from '../ProgramOverview';

// Mock the Card component
jest.mock('../../common/Card', () => {
  return function MockCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div data-testid="card">
        <h2>{title}</h2>
        {children}
      </div>
    );
  };
});

// Mock the RiskProgressBars component
jest.mock('../RiskProgressBars', () => {
  return function MockRiskProgressBars({ data }: { data: any[] }) {
    return (
      <div data-testid="risk-progress-bars">
        {data.map((item, index) => (
          <div key={index} data-testid={`risk-item-${index}`}>
            {item.riskLevel}
          </div>
        ))}
      </div>
    );
  };
});

describe('ProgramOverview', () => {
  const mockInherentRiskData = [
    { riskLevel: 'red' },
    { riskLevel: 'yellow' },
    { riskLevel: 'green' },
    { riskLevel: 'unknown' },
  ];

  describe('Rendering', () => {
    it('renders the component with correct title', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('renders RiskProgressBars component', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      expect(screen.getByTestId('risk-progress-bars')).toBeInTheDocument();
    });

    it('renders with empty data', () => {
      render(<ProgramOverview inherentRiskData={[]} />);
      
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
      expect(screen.getByTestId('risk-progress-bars')).toBeInTheDocument();
    });
  });

  describe('Risk Data Transformation', () => {
    it('transforms red risk level to Alto', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: 'red' }]} />);
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
    });

    it('transforms yellow risk level to Bajo', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: 'yellow' }]} />);
      
      expect(screen.getByText('Bajo')).toBeInTheDocument();
    });

    it('transforms green risk level to Sin Riesgo', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: 'green' }]} />);
      
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
    });

    it('transforms unknown risk level to Desconocido', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: 'unknown' }]} />);
      
      expect(screen.getByText('Desconocido')).toBeInTheDocument();
    });

    it('handles case-insensitive risk levels', () => {
      const caseInsensitiveData = [
        { riskLevel: 'RED' },
        { riskLevel: 'Yellow' },
        { riskLevel: 'GREEN' },
      ];
      
      render(<ProgramOverview inherentRiskData={caseInsensitiveData} />);
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
      expect(screen.getByText('Bajo')).toBeInTheDocument();
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
    });

    it('handles empty string risk level', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: '' }]} />);
      
      expect(screen.getByText('Desconocido')).toBeInTheDocument();
    });

    it('handles undefined risk level', () => {
      render(<ProgramOverview inherentRiskData={[{ riskLevel: undefined as any }]} />);
      
      expect(screen.getByText('Desconocido')).toBeInTheDocument();
    });

    it('transforms all risk levels correctly in mixed data', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
      expect(screen.getByText('Bajo')).toBeInTheDocument();
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
      expect(screen.getByText('Desconocido')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes and structure', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      const container = screen.getByTestId('card');
      expect(container).toBeInTheDocument();
      
      // Check that RiskProgressBars is wrapped in a div with mt-6 class
      const riskProgressBars = screen.getByTestId('risk-progress-bars');
      expect(riskProgressBars.parentElement).toHaveClass('mt-6');
    });

    it('passes transformed data to RiskProgressBars', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      // Verify that all transformed risk levels are present
      expect(screen.getByTestId('risk-item-0')).toHaveTextContent('Alto');
      expect(screen.getByTestId('risk-item-1')).toHaveTextContent('Bajo');
      expect(screen.getByTestId('risk-item-2')).toHaveTextContent('Sin Riesgo');
      expect(screen.getByTestId('risk-item-3')).toHaveTextContent('Desconocido');
    });
  });

  describe('Edge Cases', () => {
    it('handles large datasets', () => {
      const largeData = Array.from({ length: 1000 }, (_, index) => ({
        riskLevel: ['red', 'yellow', 'green', 'unknown'][index % 4],
      }));
      
      render(<ProgramOverview inherentRiskData={largeData} />);
      
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
      expect(screen.getByTestId('risk-progress-bars')).toBeInTheDocument();
    });

    it('handles special characters in risk level', () => {
      const specialData = [
        { riskLevel: 'red@#$' },
        { riskLevel: 'yellow-test' },
        { riskLevel: 'green_value' },
      ];
      
      render(<ProgramOverview inherentRiskData={specialData} />);
      
      // Special characters should result in 'Desconocido'
      expect(screen.getAllByText('Desconocido')).toHaveLength(3);
    });

    it('preserves other properties in risk data', () => {
      const dataWithExtraProps = [
        { riskLevel: 'red', id: '1', name: 'Test Item' },
        { riskLevel: 'green', id: '2', description: 'Another item' },
      ];
      
      render(<ProgramOverview inherentRiskData={dataWithExtraProps} />);
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('updates when inherentRiskData prop changes', () => {
      const { rerender } = render(
        <ProgramOverview inherentRiskData={[{ riskLevel: 'red' }]} />
      );
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
      
      rerender(
        <ProgramOverview inherentRiskData={[{ riskLevel: 'green' }]} />
      );
      
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
      expect(screen.queryByText('Alto')).not.toBeInTheDocument();
    });

    it('handles null or undefined inherentRiskData gracefully', () => {
      // This test assumes the component should handle null/undefined gracefully
      // If not, this test might need to be adjusted based on actual requirements
      render(<ProgramOverview inherentRiskData={null as any} />);
      
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Evaluaciones Totales');
    });

    it('maintains semantic structure', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      const card = screen.getByTestId('card');
      const progressBars = screen.getByTestId('risk-progress-bars');
      
      expect(card).toContainElement(progressBars);
    });
  });

  describe('Integration', () => {
    it('integrates properly with Card component', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Evaluaciones Totales');
    });

    it('integrates properly with RiskProgressBars component', () => {
      render(<ProgramOverview inherentRiskData={mockInherentRiskData} />);
      
      const riskProgressBars = screen.getByTestId('risk-progress-bars');
      expect(riskProgressBars).toBeInTheDocument();
      
      // Verify that transformed data is passed correctly
      expect(riskProgressBars).toHaveTextContent('Alto');
      expect(riskProgressBars).toHaveTextContent('Bajo');
      expect(riskProgressBars).toHaveTextContent('Sin Riesgo');
      expect(riskProgressBars).toHaveTextContent('Desconocido');
    });
  });
});