import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyJobsSummary from '../DailyJobsSummary';

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

const defaultProps = {
  daily: 25
};

describe('DailyJobsSummary', () => {
  describe('Rendering', () => {
    it('renders with correct title and subtitle', () => {
      render(<DailyJobsSummary {...defaultProps} />);
      
      expect(screen.getByTestId('card-title')).toHaveTextContent('Trabajos Diarios');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Evaluaciones creadas hoy');
      expect(screen.getByTestId('card-download')).toBeInTheDocument();
    });

    it('displays daily count correctly', () => {
      render(<DailyJobsSummary {...defaultProps} />);
      
      expect(screen.getByText('Diario')).toBeInTheDocument();
      expect(screen.getByText('25 elementos')).toBeInTheDocument();
    });

    it('renders progress bar at 100% width', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      const progressBar = container.querySelector('.h-4.bg-green-500');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar?.getAttribute('style')).toContain('width: 100%');
    });
  });

  describe('Different Daily Values', () => {
    it('handles zero daily jobs', () => {
      render(<DailyJobsSummary daily={0} />);
      
      expect(screen.getByText('0 elementos')).toBeInTheDocument();
    });

    it('handles single daily job', () => {
      render(<DailyJobsSummary daily={1} />);
      
      expect(screen.getByText('1 elementos')).toBeInTheDocument();
    });

    it('handles large numbers', () => {
      render(<DailyJobsSummary daily={9999} />);
      
      expect(screen.getByText('9999 elementos')).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      render(<DailyJobsSummary daily={1000000} />);
      
      expect(screen.getByText('1000000 elementos')).toBeInTheDocument();
    });

    it('handles negative numbers', () => {
      render(<DailyJobsSummary daily={-5} />);
      
      expect(screen.getByText('-5 elementos')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for styling', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Check for main container
      expect(container.querySelector('.space-y-6')).toBeInTheDocument();
      
      // Check for progress bar container
      expect(container.querySelector('.h-4.flex-grow.bg-gray-200')).toBeInTheDocument();
      expect(container.querySelector('.h-4.bg-green-500')).toBeInTheDocument();
      
      // Check for text styling
      expect(container.querySelector('.text-base.font-medium.text-gray-700')).toBeInTheDocument();
      expect(container.querySelector('.text-base.font-semibold.text-gray-800')).toBeInTheDocument();
    });

    it('has proper dark mode classes', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Check for dark mode classes
      expect(container.querySelector('.dark\\:text-gray-300')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:text-white')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:bg-gray-700')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:bg-green-400')).toBeInTheDocument();
    });

    it('has proper layout structure', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Check for flex layout
      expect(container.querySelector('.flex.justify-between.items-center')).toBeInTheDocument();
      expect(container.querySelector('.flex.items-center.space-x-4')).toBeInTheDocument();
      
      // Check for rounded corners
      expect(container.querySelector('.rounded-full')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('always shows 100% width regardless of daily value', () => {
      const testValues = [0, 1, 10, 100, 1000];
      
      testValues.forEach(value => {
        const { container } = render(<DailyJobsSummary daily={value} />);
        const progressBar = container.querySelector('.h-4.bg-green-500');
        
        expect(progressBar?.getAttribute('style')).toContain('width: 100%');
      });
    });

    it('has correct green color styling', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      const progressBar = container.querySelector('.h-4.bg-green-500');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveClass('dark:bg-green-400');
    });

    it('has correct height and styling', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      const progressBarContainer = container.querySelector('.h-4.flex-grow.bg-gray-200');
      const progressBar = container.querySelector('.h-4.bg-green-500');
      
      expect(progressBarContainer).toHaveClass('rounded-full');
      expect(progressBar).toHaveClass('rounded-full');
      expect(progressBarContainer).toHaveClass('h-4');
      expect(progressBar).toHaveClass('h-4');
    });
  });

  describe('Accessibility', () => {
    it('has proper text hierarchy', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Check for proper text sizes and weights
      expect(container.querySelector('.text-base.font-medium')).toBeInTheDocument();
      expect(container.querySelector('.text-base.font-semibold')).toBeInTheDocument();
    });

    it('has semantic color usage', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Green color indicates positive/completed status
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
    });

    it('has proper contrast classes', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      // Check for proper contrast in light and dark modes
      expect(container.querySelector('.text-gray-700')).toBeInTheDocument();
      expect(container.querySelector('.text-gray-800')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:text-gray-300')).toBeInTheDocument();
      expect(container.querySelector('.dark\\:text-white')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('updates when daily prop changes', () => {
      const { rerender } = render(<DailyJobsSummary daily={10} />);
      
      expect(screen.getByText('10 elementos')).toBeInTheDocument();
      
      rerender(<DailyJobsSummary daily={50} />);
      expect(screen.getByText('50 elementos')).toBeInTheDocument();
      
      rerender(<DailyJobsSummary daily={0} />);
      expect(screen.getByText('0 elementos')).toBeInTheDocument();
    });

    it('handles decimal numbers', () => {
      render(<DailyJobsSummary daily={25.5} />);
      
      expect(screen.getByText('25.5 elementos')).toBeInTheDocument();
    });

    it('handles string numbers', () => {
      // TypeScript would prevent this, but testing runtime behavior
      render(<DailyJobsSummary daily={Number('42')} />);
      
      expect(screen.getByText('42 elementos')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('integrates properly with Card component', () => {
      render(<DailyJobsSummary {...defaultProps} />);
      
      // Verify Card component receives correct props
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toHaveTextContent('Trabajos Diarios');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Evaluaciones creadas hoy');
      expect(screen.getByTestId('card-download')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    it('renders content within Card component', () => {
      render(<DailyJobsSummary {...defaultProps} />);
      
      const cardContent = screen.getByTestId('card-content');
      expect(cardContent).toContainElement(screen.getByText('Diario'));
      expect(cardContent).toContainElement(screen.getByText('25 elementos'));
    });
  });

  describe('Visual Consistency', () => {
    it('maintains consistent spacing', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      expect(container.querySelector('.space-y-6')).toBeInTheDocument();
      expect(container.querySelector('.space-x-4')).toBeInTheDocument();
      expect(container.querySelector('.mb-2')).toBeInTheDocument();
    });

    it('has consistent border radius', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      const roundedElements = container.querySelectorAll('.rounded-full');
      expect(roundedElements).toHaveLength(2); // Container and progress bar
    });

    it('maintains consistent height for progress elements', () => {
      const { container } = render(<DailyJobsSummary {...defaultProps} />);
      
      const heightElements = container.querySelectorAll('.h-4');
      expect(heightElements).toHaveLength(2); // Container and progress bar
    });
  });
});