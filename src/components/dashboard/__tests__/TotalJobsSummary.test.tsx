import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TotalJobsSummary from '../TotalJobsSummary';

// Mock the Card component
jest.mock('../../common/Card', () => {
  return function MockCard({ title, subtitle, showDownload, children }: any) {
    return (
      <div data-testid="card">
        <div data-testid="card-title">{title}</div>
        <div data-testid="card-subtitle">{subtitle}</div>
        {showDownload && <div data-testid="card-download">Download</div>}
        <div data-testid="card-content">{children}</div>
      </div>
    );
  };
});

const defaultRiskSummaryTotals = {
  totalSevero: 10,
  totalSignificativo: 15,
  totalDetected: 20,
  totalParameters: 100
};

const defaultProps = {
  total: 50,
  riskSummaryTotals: defaultRiskSummaryTotals
};

describe('TotalJobsSummary', () => {
  describe('Rendering', () => {
    it('renders with correct title and subtitle', () => {
      render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByTestId('card-title')).toHaveTextContent('Trabajos Totales');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Evaluaciones totales');
      expect(screen.getByTestId('card-download')).toBeInTheDocument();
    });

    it('displays total evaluations correctly', () => {
      render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
      expect(screen.getByText('50 elementos')).toBeInTheDocument();
    });

    it('displays risk summary section', () => {
      render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('Resumen Total de Riesgos')).toBeInTheDocument();
    });

    it('displays all risk categories', () => {
      render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('Riesgos Severos')).toBeInTheDocument();
      expect(screen.getByText('Riesgos Significativos')).toBeInTheDocument();
      expect(screen.getByText('Riesgos Detectados')).toBeInTheDocument();
      expect(screen.getByText('Riesgos Bajos')).toBeInTheDocument();
    });

    it('displays risk counts correctly', () => {
      render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('10')).toBeInTheDocument(); // totalSevero
      expect(screen.getByText('15')).toBeInTheDocument(); // totalSignificativo
      expect(screen.getByText('20')).toBeInTheDocument(); // totalDetected
      expect(screen.getByText('55')).toBeInTheDocument(); // calculated low risks (100 - 10 - 15 - 20)
    });
  });

  describe('Risk Calculations', () => {
    it('calculates low risks correctly', () => {
      const riskSummaryTotals = {
        totalSevero: 5,
        totalSignificativo: 10,
        totalDetected: 15,
        totalParameters: 50
      };
      
      render(<TotalJobsSummary total={25} riskSummaryTotals={riskSummaryTotals} />);
      
      // Low risks = 50 - (5 + 10 + 15) = 20
      expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('handles zero total parameters', () => {
      const riskSummaryTotals = {
        totalSevero: 0,
        totalSignificativo: 0,
        totalDetected: 0,
        totalParameters: 0
      };
      
      render(<TotalJobsSummary total={0} riskSummaryTotals={riskSummaryTotals} />);
      
      expect(screen.getByText('0 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('0')).toHaveLength(4); // All risk counts should be 0
    });

    it('handles negative calculated low risks', () => {
      const riskSummaryTotals = {
        totalSevero: 30,
        totalSignificativo: 40,
        totalDetected: 50,
        totalParameters: 100
      };
      
      render(<TotalJobsSummary total={150} riskSummaryTotals={riskSummaryTotals} />);
      
      // Low risks = 100 - (30 + 40 + 50) = -20
      expect(screen.getByText('-20')).toBeInTheDocument();
    });
  });

  describe('Progress Bars', () => {
    it('renders progress bars with correct widths', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      const progressBars = container.querySelectorAll('.h-3.bg-red-600, .h-3.bg-orange-500, .h-3.bg-yellow-500, .h-3.bg-green-500');
      expect(progressBars).toHaveLength(4);
      
      // Check if progress bars have style attributes
      progressBars.forEach(bar => {
        expect(bar).toHaveAttribute('style');
        expect(bar.getAttribute('style')).toContain('width:');
      });
    });

    it('calculates correct percentages for progress bars', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      const redBar = container.querySelector('.h-3.bg-red-600');
      const orangeBar = container.querySelector('.h-3.bg-orange-500');
      const yellowBar = container.querySelector('.h-3.bg-yellow-500');
      const greenBar = container.querySelector('.h-3.bg-green-500');
      
      // totalSevero: 10/100 = 10%
      expect(redBar?.getAttribute('style')).toContain('width: 10%');
      // totalSignificativo: 15/100 = 15%
      expect(orangeBar?.getAttribute('style')).toContain('width: 15%');
      // totalDetected: 20/100 = 20%
      expect(yellowBar?.getAttribute('style')).toContain('width: 20%');
      // low risks: 55/100 = 55%
      expect(greenBar?.getAttribute('style')).toContain('width: 55%');
    });

    it('handles zero total parameters for progress bars', () => {
      const riskSummaryTotals = {
        totalSevero: 5,
        totalSignificativo: 10,
        totalDetected: 15,
        totalParameters: 0
      };
      
      const { container } = render(<TotalJobsSummary total={30} riskSummaryTotals={riskSummaryTotals} />);
      
      const progressBars = container.querySelectorAll('.h-3.bg-red-600, .h-3.bg-orange-500, .h-3.bg-yellow-500, .h-3.bg-green-500');
      
      // All progress bars should have 0% width
      progressBars.forEach(bar => {
        expect(bar.getAttribute('style')).toContain('width: 0%');
      });
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for styling', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      // Check for main container
      expect(container.querySelector('.space-y-6')).toBeInTheDocument();
      
      // Check for progress bar containers
      expect(container.querySelectorAll('.h-4.flex-grow.bg-gray-200')).toHaveLength(1);
      expect(container.querySelectorAll('.h-3.w-full.bg-gray-200')).toHaveLength(4);
      
      // Check for text styling
      expect(container.querySelector('.text-base.font-medium.text-gray-700')).toBeInTheDocument();
      expect(container.querySelector('.text-base.font-semibold.text-gray-800')).toBeInTheDocument();
    });

    it('has proper dark mode classes', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      // Check for dark mode classes
      expect(container.querySelector('.dark\\:text-gray-300')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:text-white')).toBeInTheDocument();
      expect(container.querySelectorAll('.dark\\:bg-gray-700')).toHaveLength(5);
    });
  });

  describe('Edge Cases', () => {
    it('handles very large numbers', () => {
      const riskSummaryTotals = {
        totalSevero: 999999,
        totalSignificativo: 888888,
        totalDetected: 777777,
        totalParameters: 5000000
      };
      
      render(<TotalJobsSummary total={10000000} riskSummaryTotals={riskSummaryTotals} />);
      
      expect(screen.getByText('10000000 elementos')).toBeInTheDocument();
      expect(screen.getByText('999999')).toBeInTheDocument();
      expect(screen.getByText('888888')).toBeInTheDocument();
      expect(screen.getByText('777777')).toBeInTheDocument();
    });

    it('handles all zero values', () => {
      const riskSummaryTotals = {
        totalSevero: 0,
        totalSignificativo: 0,
        totalDetected: 0,
        totalParameters: 0
      };
      
      render(<TotalJobsSummary total={0} riskSummaryTotals={riskSummaryTotals} />);
      
      expect(screen.getByText('0 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('0')).toHaveLength(4);
    });

    it('handles maximum risk values equal to total parameters', () => {
      const riskSummaryTotals = {
        totalSevero: 100,
        totalSignificativo: 0,
        totalDetected: 0,
        totalParameters: 100
      };
      
      render(<TotalJobsSummary total={100} riskSummaryTotals={riskSummaryTotals} />);
      
      expect(screen.getByText('100')).toBeInTheDocument(); // totalSevero
      expect(screen.getByText('0')).toBeInTheDocument(); // low risks (100 - 100 = 0)
    });
  });

  describe('Accessibility', () => {
    it('has proper text hierarchy', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      // Check for proper text sizes and weights
      expect(container.querySelector('.text-base.font-medium')).toBeInTheDocument();
      expect(container.querySelector('.text-base.font-semibold')).toBeInTheDocument();
      expect(container.querySelectorAll('.text-sm')).toHaveLength(8); // 4 labels + 4 values
    });

    it('has semantic color coding', () => {
      const { container } = render(<TotalJobsSummary {...defaultProps} />);
      
      // Check for semantic colors
      expect(container.querySelector('.text-red-600')).toBeInTheDocument();
      expect(container.querySelector('.text-orange-500')).toBeInTheDocument();
      expect(container.querySelector('.text-yellow-500')).toBeInTheDocument();
      expect(container.querySelector('.text-green-500')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('handles different total values', () => {
      const { rerender } = render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('50 elementos')).toBeInTheDocument();
      
      rerender(<TotalJobsSummary {...defaultProps} total={1} />);
      expect(screen.getByText('1 elementos')).toBeInTheDocument();
      
      rerender(<TotalJobsSummary {...defaultProps} total={1000} />);
      expect(screen.getByText('1000 elementos')).toBeInTheDocument();
    });

    it('updates when risk summary totals change', () => {
      const { rerender } = render(<TotalJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('10')).toBeInTheDocument(); // initial totalSevero
      
      const newRiskSummaryTotals = {
        ...defaultRiskSummaryTotals,
        totalSevero: 25
      };
      
      rerender(<TotalJobsSummary total={50} riskSummaryTotals={newRiskSummaryTotals} />);
      expect(screen.getByText('25')).toBeInTheDocument(); // updated totalSevero
    });
  });
});