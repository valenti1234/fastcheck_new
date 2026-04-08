import React from 'react';
import { render, screen } from '@testing-library/react';
import EvaluationSummary from '../EvaluationSummary';

// Mock dependencies
jest.mock('../common/Card', () => {
  return function MockCard({ title, children }: any) {
    return (
      <div data-testid="card">
        <div data-testid="card-title">{title}</div>
        {children}
      </div>
    );
  };
});

describe('EvaluationSummary Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderEvaluationSummary = (totalEvaluations: number) => {
    return render(<EvaluationSummary totalEvaluations={totalEvaluations} />);
  };

  describe('Rendering', () => {
    it('renders the component with correct title', () => {
      renderEvaluationSummary(42);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toHaveTextContent('Resumen de Trabajos de Evaluación');
    });

    it('displays the total evaluations count', () => {
      renderEvaluationSummary(42);

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('renders with correct CSS classes for layout', () => {
      renderEvaluationSummary(100);

      const container = screen.getByText('100').parentElement;
      expect(container).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-full', 'p-6');
    });

    it('renders the count with correct styling', () => {
      renderEvaluationSummary(123);

      const countElement = screen.getByText('123');
      expect(countElement).toHaveClass('text-6xl', 'font-extrabold', 'text-gray-900');
    });

    it('renders the label with correct styling', () => {
      renderEvaluationSummary(456);

      const labelElement = screen.getByText('Evaluaciones Totales');
      expect(labelElement).toHaveClass('mt-2', 'text-xl', 'font-medium', 'text-gray-600');
    });
  });

  describe('Different Values', () => {
    it('displays zero evaluations correctly', () => {
      renderEvaluationSummary(0);

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('displays single evaluation correctly', () => {
      renderEvaluationSummary(1);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('displays large numbers correctly', () => {
      renderEvaluationSummary(999999);

      expect(screen.getByText('999999')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('displays very large numbers correctly', () => {
      renderEvaluationSummary(1234567890);

      expect(screen.getByText('1234567890')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles negative numbers (though not expected in real usage)', () => {
      renderEvaluationSummary(-5);

      expect(screen.getByText('-5')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('handles decimal numbers (though not expected in real usage)', () => {
      renderEvaluationSummary(42.5);

      expect(screen.getByText('42.5')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has the correct component hierarchy', () => {
      renderEvaluationSummary(100);

      const card = screen.getByTestId('card');
      const container = screen.getByText('100').parentElement;
      const countElement = screen.getByText('100');
      const labelElement = screen.getByText('Evaluaciones Totales');

      expect(card).toContainElement(container);
      expect(container).toContainElement(countElement);
      expect(container).toContainElement(labelElement);
    });

    it('renders count and label as siblings', () => {
      renderEvaluationSummary(200);

      const countElement = screen.getByText('200');
      const labelElement = screen.getByText('Evaluaciones Totales');
      const container = countElement.parentElement;

      expect(container).toContainElement(countElement);
      expect(container).toContainElement(labelElement);
      expect(countElement.nextElementSibling).toBe(labelElement);
    });
  });

  describe('Accessibility', () => {
    it('provides meaningful text content for screen readers', () => {
      renderEvaluationSummary(150);

      // The component should have accessible text
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });

    it('uses semantic HTML structure', () => {
      renderEvaluationSummary(75);

      // Check that the structure is semantic
      const countElement = screen.getByText('75');
      const labelElement = screen.getByText('Evaluaciones Totales');

      expect(countElement.tagName).toBe('DIV');
      expect(labelElement.tagName).toBe('DIV');
    });
  });

  describe('Props Validation', () => {
    it('correctly handles different prop types', () => {
      // Test with number
      const { rerender } = renderEvaluationSummary(42);
      expect(screen.getByText('42')).toBeInTheDocument();

      // Test with different number
      rerender(<EvaluationSummary totalEvaluations={100} />);
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.queryByText('42')).not.toBeInTheDocument();
    });

    it('updates when totalEvaluations prop changes', () => {
      const { rerender } = renderEvaluationSummary(10);
      expect(screen.getByText('10')).toBeInTheDocument();

      rerender(<EvaluationSummary totalEvaluations={20} />);
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.queryByText('10')).not.toBeInTheDocument();

      rerender(<EvaluationSummary totalEvaluations={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.queryByText('20')).not.toBeInTheDocument();
    });
  });

  describe('Visual Consistency', () => {
    it('maintains consistent layout regardless of number size', () => {
      const testCases = [0, 1, 10, 100, 1000, 10000, 100000];

      testCases.forEach(count => {
        const { rerender } = renderEvaluationSummary(count);
        
        const container = screen.getByText(count.toString()).parentElement;
        expect(container).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-full', 'p-6');
        
        const countElement = screen.getByText(count.toString());
        expect(countElement).toHaveClass('text-6xl', 'font-extrabold', 'text-gray-900');
        
        const labelElement = screen.getByText('Evaluaciones Totales');
        expect(labelElement).toHaveClass('mt-2', 'text-xl', 'font-medium', 'text-gray-600');
        
        if (count < testCases[testCases.length - 1]) {
          rerender(<EvaluationSummary totalEvaluations={testCases[testCases.indexOf(count) + 1]} />);
        }
      });
    });
  });

  describe('Integration', () => {
    it('works correctly when wrapped in different containers', () => {
      const { container } = renderEvaluationSummary(500);
      
      expect(container.firstChild).toBe(screen.getByTestId('card'));
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('Evaluaciones Totales')).toBeInTheDocument();
    });
  });
});