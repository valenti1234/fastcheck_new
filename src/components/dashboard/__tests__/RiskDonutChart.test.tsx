import React from 'react';
import { render, screen } from '@testing-library/react';
import RiskDonutChart from '../RiskDonutChart';

// Mock dependencies
jest.mock('../common/Card', () => {
  return function MockCard({ title, subtitle, showDownload, children }: any) {
    return (
      <div data-testid="card">
        <div data-testid="card-title">{title}</div>
        <div data-testid="card-subtitle">{subtitle}</div>
        {showDownload && <div data-testid="card-download">Download</div>}
        {children}
      </div>
    );
  };
});

jest.mock('react-chartjs-2', () => ({
  Doughnut: ({ data, options }: any) => (
    <div data-testid="doughnut-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  )
}));

jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn()
  },
  ArcElement: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn()
}));

const mockResults = [
  {
    id: '1',
    riskAssessment: {
      riskSummary: {
        semaphore: 'green'
      }
    }
  },
  {
    id: '2',
    riskAssessment: {
      riskSummary: {
        semaphore: 'yellow'
      }
    }
  },
  {
    id: '3',
    riskAssessment: {
      riskSummary: {
        semaphore: 'orange'
      }
    }
  },
  {
    id: '4',
    riskAssessment: {
      riskSummary: {
        semaphore: 'red'
      }
    }
  },
  {
    id: '5',
    riskAssessment: {
      riskSummary: {
        semaphore: 'green'
      }
    }
  }
];

describe('RiskDonutChart Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderRiskDonutChart = (results = mockResults) => {
    return render(<RiskDonutChart results={results} />);
  };

  describe('Rendering', () => {
    it('renders the component with correct title and subtitle', () => {
      renderRiskDonutChart();

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toHaveTextContent('Resumen de Riesgos');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Distribución por nivel de riesgo');
      expect(screen.getByTestId('card-download')).toBeInTheDocument();
    });

    it('renders the doughnut chart', () => {
      renderRiskDonutChart();

      expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument();
      expect(screen.getByTestId('chart-data')).toBeInTheDocument();
      expect(screen.getByTestId('chart-options')).toBeInTheDocument();
    });

    it('displays total evaluations count in center', () => {
      renderRiskDonutChart();

      expect(screen.getByText('5')).toBeInTheDocument(); // Total of mockResults
      expect(screen.getByText('Evaluaciones')).toBeInTheDocument();
    });

    it('displays risk distribution summary', () => {
      renderRiskDonutChart();

      expect(screen.getByText('2 BAJO')).toBeInTheDocument();
      expect(screen.getByText('1 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('1 ALTO')).toBeInTheDocument();
      expect(screen.getByText('1 CRÍTICO')).toBeInTheDocument();
    });

    it('displays risk descriptions', () => {
      renderRiskDonutChart();

      expect(screen.getByText('Sin riesgos significativos')).toBeInTheDocument();
      expect(screen.getByText('Algunos riesgos significativos')).toBeInTheDocument();
      expect(screen.getByText('Múltiples riesgos significativos')).toBeInTheDocument();
      expect(screen.getByText('Riesgos severos detectados')).toBeInTheDocument();
    });
  });

  describe('Risk Distribution Calculation', () => {
    it('correctly calculates risk distribution from results', () => {
      renderRiskDonutChart();

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');
      expect(chartData.datasets[0].data).toEqual([2, 1, 1, 1]); // green, yellow, orange, red
    });

    it('handles empty results array', () => {
      renderRiskDonutChart([]);

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('0 BAJO')).toBeInTheDocument();
      expect(screen.getByText('0 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('0 ALTO')).toBeInTheDocument();
      expect(screen.getByText('0 CRÍTICO')).toBeInTheDocument();

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');
      expect(chartData.datasets[0].data).toEqual([0, 0, 0, 0]);
    });

    it('handles results with missing riskAssessment', () => {
      const resultsWithMissingData: any[] = [
        { id: '1' }, // No riskAssessment
        { id: '2', riskAssessment: {} }, // No riskSummary
        { id: '3', riskAssessment: { riskSummary: {} } }, // No semaphore
        { id: '4', riskAssessment: { riskSummary: { semaphore: 'green' } } }
      ];

      renderRiskDonutChart(resultsWithMissingData);

      expect(screen.getByText('1')).toBeInTheDocument(); // Only one valid result
      expect(screen.getByText('1 BAJO')).toBeInTheDocument();
      expect(screen.getByText('0 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('0 ALTO')).toBeInTheDocument();
      expect(screen.getByText('0 CRÍTICO')).toBeInTheDocument();
    });

    it('handles results with invalid semaphore values', () => {
      const resultsWithInvalidSemaphore: any[] = [
        { id: '1', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '2', riskAssessment: { riskSummary: { semaphore: 'invalid' } } },
        { id: '3', riskAssessment: { riskSummary: { semaphore: 'blue' } } },
        { id: '4', riskAssessment: { riskSummary: { semaphore: 'red' } } }
      ];

      renderRiskDonutChart(resultsWithInvalidSemaphore);

      expect(screen.getByText('2')).toBeInTheDocument(); // Only valid semaphores counted
      expect(screen.getByText('1 BAJO')).toBeInTheDocument();
      expect(screen.getByText('0 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('0 ALTO')).toBeInTheDocument();
      expect(screen.getByText('1 CRÍTICO')).toBeInTheDocument();
    });

    it('handles all same risk level', () => {
      const allGreenResults = [
        { id: '1', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '2', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '3', riskAssessment: { riskSummary: { semaphore: 'green' } } }
      ];

      renderRiskDonutChart(allGreenResults);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('3 BAJO')).toBeInTheDocument();
      expect(screen.getByText('0 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('0 ALTO')).toBeInTheDocument();
      expect(screen.getByText('0 CRÍTICO')).toBeInTheDocument();

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');
      expect(chartData.datasets[0].data).toEqual([3, 0, 0, 0]);
    });
  });

  describe('Chart Configuration', () => {
    it('configures chart with correct labels', () => {
      renderRiskDonutChart();

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');
      expect(chartData.labels).toEqual(['Bajo Riesgo', 'Riesgo Medio', 'Riesgo Alto', 'Riesgo Crítico']);
    });

    it('configures chart with correct colors', () => {
      renderRiskDonutChart();

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');
      expect(chartData.datasets[0].backgroundColor).toEqual(['#22C55E', '#FBBF24', '#F97316', '#EF4444']);
      expect(chartData.datasets[0].borderColor).toEqual(['#22C55E', '#FBBF24', '#F97316', '#EF4444']);
      expect(chartData.datasets[0].borderWidth).toBe(1);
    });

    it('configures chart options correctly', () => {
      renderRiskDonutChart();

      const chartOptions = JSON.parse(screen.getByTestId('chart-options').textContent || '{}');
      expect(chartOptions.responsive).toBe(true);
      expect(chartOptions.maintainAspectRatio).toBe(false);
      expect(chartOptions.cutout).toBe('70%');
      expect(chartOptions.plugins.legend.position).toBe('bottom');
      expect(chartOptions.plugins.legend.labels.padding).toBe(20);
      expect(chartOptions.plugins.legend.labels.usePointStyle).toBe(true);
      expect(chartOptions.plugins.legend.labels.pointStyle).toBe('circle');
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for chart container', () => {
      renderRiskDonutChart();

      const chartContainer = screen.getByTestId('doughnut-chart').parentElement;
      expect(chartContainer).toHaveClass('h-80', 'relative');
    });

    it('has correct CSS classes for center text container', () => {
      renderRiskDonutChart();

      const centerContainer = screen.getByText('5').parentElement;
      expect(centerContainer).toHaveClass('text-center');
      expect(centerContainer?.parentElement).toHaveClass('absolute', 'inset-0', 'flex', 'items-center', 'justify-center');
    });

    it('has correct CSS classes for risk summary grid', () => {
      renderRiskDonutChart();

      const gridContainer = screen.getByText('2 BAJO').parentElement?.parentElement;
      expect(gridContainer).toHaveClass('grid', 'grid-cols-2', 'gap-4', 'mt-6');
    });

    it('applies correct styling to risk level text', () => {
      renderRiskDonutChart();

      expect(screen.getByText('2 BAJO')).toHaveClass('font-bold', 'text-green-500');
      expect(screen.getByText('1 MEDIO')).toHaveClass('font-bold', 'text-yellow-500');
      expect(screen.getByText('1 ALTO')).toHaveClass('font-bold', 'text-orange-500');
      expect(screen.getByText('1 CRÍTICO')).toHaveClass('font-bold', 'text-red-500');
    });

    it('applies correct styling to risk descriptions', () => {
      renderRiskDonutChart();

      expect(screen.getByText('Sin riesgos significativos')).toHaveClass('text-xs', 'text-gray-500');
      expect(screen.getByText('Algunos riesgos significativos')).toHaveClass('text-xs', 'text-gray-500');
      expect(screen.getByText('Múltiples riesgos significativos')).toHaveClass('text-xs', 'text-gray-500');
      expect(screen.getByText('Riesgos severos detectados')).toHaveClass('text-xs', 'text-gray-500');
    });
  });

  describe('Center Display', () => {
    it('displays correct total count styling', () => {
      renderRiskDonutChart();

      const totalCount = screen.getByText('5');
      expect(totalCount).toHaveClass('text-4xl', 'font-bold');
    });

    it('displays correct label styling', () => {
      renderRiskDonutChart();

      const label = screen.getByText('Evaluaciones');
      expect(label).toHaveClass('text-sm', 'text-gray-500');
    });

    it('updates total count when results change', () => {
      const { rerender } = renderRiskDonutChart();
      expect(screen.getByText('5')).toBeInTheDocument();

      const newResults = [
        { id: '1', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '2', riskAssessment: { riskSummary: { semaphore: 'red' } } }
      ];

      rerender(<RiskDonutChart results={newResults} />);
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('handles large datasets correctly', () => {
      const largeResults: any[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i.toString(),
        riskAssessment: {
          riskSummary: {
            semaphore: ['green', 'yellow', 'orange', 'red'][i % 4]
          }
        }
      }));

      renderRiskDonutChart(largeResults);

      expect(screen.getByText('1000')).toBeInTheDocument();
      expect(screen.getByText('250 BAJO')).toBeInTheDocument();
      expect(screen.getByText('250 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('250 ALTO')).toBeInTheDocument();
      expect(screen.getByText('250 CRÍTICO')).toBeInTheDocument();
    });

    it('updates when results prop changes', () => {
      const { rerender } = renderRiskDonutChart();
      expect(screen.getByText('2 BAJO')).toBeInTheDocument();

      const newResults = [
        { id: '1', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '2', riskAssessment: { riskSummary: { semaphore: 'green' } } },
        { id: '3', riskAssessment: { riskSummary: { semaphore: 'green' } } }
      ];

      rerender(<RiskDonutChart results={newResults} />);
      expect(screen.getByText('3 BAJO')).toBeInTheDocument();
      expect(screen.queryByText('2 BAJO')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides meaningful text content for screen readers', () => {
      renderRiskDonutChart();

      // Check that all important information is accessible as text
      expect(screen.getByText('Resumen de Riesgos')).toBeInTheDocument();
      expect(screen.getByText('Distribución por nivel de riesgo')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones')).toBeInTheDocument();
      expect(screen.getByText('2 BAJO')).toBeInTheDocument();
      expect(screen.getByText('1 MEDIO')).toBeInTheDocument();
      expect(screen.getByText('1 ALTO')).toBeInTheDocument();
      expect(screen.getByText('1 CRÍTICO')).toBeInTheDocument();
    });
  });
});