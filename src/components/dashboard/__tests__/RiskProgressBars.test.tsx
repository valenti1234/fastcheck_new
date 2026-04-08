import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RiskProgressBars from '../RiskProgressBars';

interface RiskData {
  riskLevel: string;
}

describe('RiskProgressBars', () => {
  const mockData: RiskData[] = [
    { riskLevel: 'sin riesgo' },
    { riskLevel: 'bajo' },
    { riskLevel: 'alto' },
    { riskLevel: 'sin riesgo' },
    { riskLevel: 'bajo' },
    { riskLevel: 'alto' },
    { riskLevel: 'sin riesgo' },
    { riskLevel: 'bajo' },
    { riskLevel: 'alto' },
    { riskLevel: 'sin riesgo' }, // 4 sin riesgo, 3 bajo, 3 alto = 10 total
  ];

  const mockDataEnglish: RiskData[] = [
    { riskLevel: 'risk free' },
    { riskLevel: 'low' },
    { riskLevel: 'high' },
    { riskLevel: 'risk free' },
    { riskLevel: 'low' },
    { riskLevel: 'high' },
  ];

  const mockDataMixed: RiskData[] = [
    { riskLevel: 'sin riesgo' },
    { riskLevel: 'risk free' },
    { riskLevel: 'bajo' },
    { riskLevel: 'low' },
    { riskLevel: 'alto' },
    { riskLevel: 'high' },
  ];

  describe('Rendering', () => {
    it('renders all three risk categories', () => {
      render(<RiskProgressBars data={mockData} />);
      
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
      expect(screen.getByText('Riesgo Bajo')).toBeInTheDocument();
      expect(screen.getByText('Riesgo Alto')).toBeInTheDocument();
    });

    it('displays correct percentages for each risk level', () => {
      render(<RiskProgressBars data={mockData} />);
      
      // 4 sin riesgo out of 10 = 40%
      expect(screen.getByText('40%')).toBeInTheDocument();
      // 3 bajo out of 10 = 30%
      expect(screen.getByText('30%')).toBeInTheDocument();
      // 3 alto out of 10 = 30%
      expect(screen.getAllByText('30%')).toHaveLength(2); // Both bajo and alto are 30%
    });

    it('displays correct count information', () => {
      render(<RiskProgressBars data={mockData} />);
      
      expect(screen.getByText('4 de 10 elementos')).toBeInTheDocument(); // Sin riesgo
      expect(screen.getByText('3 de 10 elementos')).toBeInTheDocument(); // Bajo (first occurrence)
      expect(screen.getAllByText('3 de 10 elementos')).toHaveLength(2); // Both bajo and alto
    });
  });

  describe('Empty Data', () => {
    it('handles empty data array', () => {
      render(<RiskProgressBars data={[]} />);
      
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getAllByText('0%')).toHaveLength(3); // All three categories should show 0%
      expect(screen.getAllByText('0 de 0 elementos')).toHaveLength(3);
    });
  });

  describe('Language Support', () => {
    it('handles English risk levels', () => {
      render(<RiskProgressBars data={mockDataEnglish} />);
      
      // 2 risk free out of 6 = 33%
      expect(screen.getByText('33%')).toBeInTheDocument();
      // 2 low out of 6 = 33%
      expect(screen.getAllByText('33%')).toHaveLength(3); // All three categories are 33%
      // 2 high out of 6 = 33%
      
      expect(screen.getByText('2 de 6 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('2 de 6 elementos')).toHaveLength(3);
    });

    it('handles mixed Spanish and English risk levels', () => {
      render(<RiskProgressBars data={mockDataMixed} />);
      
      // 2 sin riesgo/risk free out of 6 = 33%
      expect(screen.getByText('33%')).toBeInTheDocument();
      expect(screen.getAllByText('33%')).toHaveLength(3);
      
      expect(screen.getByText('2 de 6 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('2 de 6 elementos')).toHaveLength(3);
    });
  });

  describe('Case Insensitivity', () => {
    it('handles different cases correctly', () => {
      const mixedCaseData: RiskData[] = [
        { riskLevel: 'SIN RIESGO' },
        { riskLevel: 'Sin Riesgo' },
        { riskLevel: 'BAJO' },
        { riskLevel: 'Bajo' },
        { riskLevel: 'ALTO' },
        { riskLevel: 'Alto' },
        { riskLevel: 'RISK FREE' },
        { riskLevel: 'Risk Free' },
        { riskLevel: 'LOW' },
        { riskLevel: 'Low' },
        { riskLevel: 'HIGH' },
        { riskLevel: 'High' },
      ];
      
      render(<RiskProgressBars data={mixedCaseData} />);
      
      // 4 sin riesgo/risk free out of 12 = 33%
      expect(screen.getByText('33%')).toBeInTheDocument();
      expect(screen.getAllByText('33%')).toHaveLength(3);
      
      expect(screen.getByText('4 de 12 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('4 de 12 elementos')).toHaveLength(3);
    });
  });

  describe('Progress Bar Styling', () => {
    it('applies correct progress bar widths', () => {
      const { container } = render(<RiskProgressBars data={mockData} />);
      
      const progressBars = container.querySelectorAll('.h-4.rounded-full:not(.bg-gray-200)');
      
      // Sin riesgo (green) - 40%
      expect(progressBars[0]).toHaveStyle('width: 40%');
      expect(progressBars[0]).toHaveClass('bg-green-500');
      
      // Riesgo bajo (orange) - 30%
      expect(progressBars[1]).toHaveStyle('width: 30%');
      expect(progressBars[1]).toHaveClass('bg-orange-400');
      
      // Riesgo alto (red) - 30%
      expect(progressBars[2]).toHaveStyle('width: 30%');
      expect(progressBars[2]).toHaveClass('bg-red-500');
    });

    it('has correct background colors for each risk level', () => {
      const { container } = render(<RiskProgressBars data={mockData} />);
      
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
      expect(container.querySelector('.bg-orange-400')).toBeInTheDocument();
      expect(container.querySelector('.bg-red-500')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for layout', () => {
      const { container } = render(<RiskProgressBars data={mockData} />);
      
      // Main grid container
      expect(container.querySelector('.grid.grid-cols-1.md\\:grid-cols-3.gap-6')).toBeInTheDocument();
      
      // Individual risk sections
      const sections = container.querySelectorAll('.px-4.py-5.sm\\:p-6');
      expect(sections).toHaveLength(3);
    });

    it('has proper text styling', () => {
      const { container } = render(<RiskProgressBars data={mockData} />);
      
      // Category labels
      expect(container.querySelectorAll('.text-base.font-medium.text-gray-400')).toHaveLength(3);
      
      // Percentage values
      expect(container.querySelectorAll('.text-4xl.font-bold.tracking-tight.text-white')).toHaveLength(3);
      
      // Count information
      expect(container.querySelectorAll('.text-base.text-gray-400')).toHaveLength(6); // 3 labels + 3 counts
    });

    it('has proper progress bar structure', () => {
      const { container } = render(<RiskProgressBars data={mockData} />);
      
      // Progress bar containers
      expect(container.querySelectorAll('.mt-4.h-4.rounded-full.bg-gray-200')).toHaveLength(3);
      
      // Progress bar fills
      expect(container.querySelectorAll('.h-4.rounded-full')).toHaveLength(6); // 3 containers + 3 fills
    });
  });

  describe('Percentage Calculations', () => {
    it('calculates percentages correctly for equal distribution', () => {
      const equalData: RiskData[] = [
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'bajo' },
        { riskLevel: 'alto' },
      ];
      
      render(<RiskProgressBars data={equalData} />);
      
      expect(screen.getAllByText('33%')).toHaveLength(3);
      expect(screen.getAllByText('1 de 3 elementos')).toHaveLength(3);
    });

    it('handles 100% single category', () => {
      const singleCategoryData: RiskData[] = [
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'sin riesgo' },
      ];
      
      render(<RiskProgressBars data={singleCategoryData} />);
      
      expect(screen.getByText('100%')).toBeInTheDocument(); // Sin riesgo
      expect(screen.getAllByText('0%')).toHaveLength(2); // Bajo and Alto
      
      expect(screen.getByText('3 de 3 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('0 de 3 elementos')).toHaveLength(2);
    });

    it('rounds percentages to nearest integer', () => {
      const unevenData: RiskData[] = [
        { riskLevel: 'sin riesgo' }, // 1/7 = 14.28% -> 14%
        { riskLevel: 'bajo' },       // 2/7 = 28.57% -> 29%
        { riskLevel: 'bajo' },
        { riskLevel: 'alto' },       // 4/7 = 57.14% -> 57%
        { riskLevel: 'alto' },
        { riskLevel: 'alto' },
        { riskLevel: 'alto' },
      ];
      
      render(<RiskProgressBars data={unevenData} />);
      
      expect(screen.getByText('14%')).toBeInTheDocument(); // Sin riesgo
      expect(screen.getByText('29%')).toBeInTheDocument(); // Bajo
      expect(screen.getByText('57%')).toBeInTheDocument(); // Alto
    });
  });

  describe('Edge Cases', () => {
    it('handles null and undefined risk levels', () => {
      const nullData: RiskData[] = [
        { riskLevel: null as any },
        { riskLevel: undefined as any },
        { riskLevel: '' },
        { riskLevel: 'sin riesgo' },
      ];
      
      render(<RiskProgressBars data={nullData} />);
      
      // Only 1 valid 'sin riesgo' out of 4 = 25%
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getAllByText('0%')).toHaveLength(2); // Bajo and Alto
      
      expect(screen.getByText('1 de 4 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('0 de 4 elementos')).toHaveLength(2);
    });

    it('handles unknown risk levels', () => {
      const unknownData: RiskData[] = [
        { riskLevel: 'unknown' },
        { riskLevel: 'medium' },
        { riskLevel: 'critical' },
        { riskLevel: 'sin riesgo' },
      ];
      
      render(<RiskProgressBars data={unknownData} />);
      
      // Only 1 'sin riesgo' out of 4 = 25%
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getAllByText('0%')).toHaveLength(2);
      
      expect(screen.getByText('1 de 4 elementos')).toBeInTheDocument();
      expect(screen.getAllByText('0 de 4 elementos')).toHaveLength(2);
    });

    it('handles very large datasets', () => {
      const largeData: RiskData[] = Array.from({ length: 10000 }, (_, index) => ({
        riskLevel: ['sin riesgo', 'bajo', 'alto'][index % 3]
      }));
      
      render(<RiskProgressBars data={largeData} />);
      
      // Each category should have ~33%
      expect(screen.getAllByText('33%')).toHaveLength(3);
      
      // Each category should have ~3333-3334 elements
      expect(screen.getByText(/333[34] de 10000 elementos/)).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('updates when data prop changes', () => {
      const { rerender } = render(<RiskProgressBars data={mockData} />);
      
      expect(screen.getByText('40%')).toBeInTheDocument(); // Sin riesgo
      
      const newData: RiskData[] = [
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'sin riesgo' },
      ];
      
      rerender(<RiskProgressBars data={newData} />);
      
      expect(screen.getByText('100%')).toBeInTheDocument(); // Sin riesgo now 100%
      expect(screen.getAllByText('0%')).toHaveLength(2); // Bajo and Alto now 0%
      expect(screen.queryByText('40%')).not.toBeInTheDocument();
    });

    it('recalculates percentages correctly on data change', () => {
      const initialData: RiskData[] = [
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'bajo' },
      ];
      
      const { rerender } = render(<RiskProgressBars data={initialData} />);
      
      expect(screen.getByText('50%')).toBeInTheDocument(); // Both categories 50%
      expect(screen.getAllByText('50%')).toHaveLength(2);
      
      const updatedData: RiskData[] = [
        { riskLevel: 'sin riesgo' },
        { riskLevel: 'bajo' },
        { riskLevel: 'alto' },
        { riskLevel: 'alto' },
      ];
      
      rerender(<RiskProgressBars data={updatedData} />);
      
      expect(screen.getByText('25%')).toBeInTheDocument(); // Sin riesgo and Bajo
      expect(screen.getByText('50%')).toBeInTheDocument(); // Alto
      expect(screen.getAllByText('25%')).toHaveLength(2);
    });
  });

  describe('Accessibility', () => {
    it('has proper semantic structure', () => {
      render(<RiskProgressBars data={mockData} />);
      
      // Check for proper text hierarchy
      const categoryLabels = screen.getAllByText(/Sin Riesgo|Riesgo Bajo|Riesgo Alto/);
      expect(categoryLabels).toHaveLength(3);
      
      // Check for percentage displays
      const percentages = screen.getAllByText(/%$/);
      expect(percentages).toHaveLength(3);
      
      // Check for count information
      const counts = screen.getAllByText(/de \d+ elementos/);
      expect(counts).toHaveLength(3);
    });

    it('provides meaningful text content for screen readers', () => {
      render(<RiskProgressBars data={mockData} />);
      
      // Each section should have descriptive text
      expect(screen.getByText('Sin Riesgo')).toBeInTheDocument();
      expect(screen.getByText('Riesgo Bajo')).toBeInTheDocument();
      expect(screen.getByText('Riesgo Alto')).toBeInTheDocument();
      
      // Percentage and count information should be available
      expect(screen.getByText('4 de 10 elementos')).toBeInTheDocument();
    });
  });
});