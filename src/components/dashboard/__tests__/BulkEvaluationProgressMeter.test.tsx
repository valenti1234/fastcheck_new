import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import BulkEvaluationProgressMeter from '../BulkEvaluationProgressMeter';
import { getBulkEvaluations } from '../../../services/api';
import '@testing-library/jest-dom';

// Mock the API service
jest.mock('../../../services/api', () => ({
  getBulkEvaluations: jest.fn(),
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockGetBulkEvaluations = getBulkEvaluations as jest.MockedFunction<typeof getBulkEvaluations>;

// Mock data
const mockBulkEvaluations = [
  {
    _id: '1',
    status: 'processing' as const,
    totalEvaluations: 100,
    completedEvaluations: 50,
    failedEvaluations: 5,
    createdAt: new Date('2024-01-15T10:30:00Z'),
  },
  {
    _id: '2',
    status: 'completed' as const,
    totalEvaluations: 50,
    completedEvaluations: 50,
    failedEvaluations: 0,
    createdAt: new Date('2024-01-14T09:00:00Z'),
  },
];

const mockCompletedEvaluations = [
  {
    _id: '1',
    status: 'completed' as const,
    totalEvaluations: 100,
    completedEvaluations: 100,
    failedEvaluations: 0,
    createdAt: new Date('2024-01-15T10:30:00Z'),
  },
];

const renderComponent = () => {
  return render(
    <BrowserRouter>
      <BulkEvaluationProgressMeter />
    </BrowserRouter>
  );
};

describe('BulkEvaluationProgressMeter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Loading State', () => {
    it('renders loading skeleton while fetching data', () => {
      mockGetBulkEvaluations.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      renderComponent();
      
      // Check for loading skeleton elements
      expect(document.querySelector('.h-4.bg-gray-200.rounded.w-3\/4')).toBeInTheDocument();
      expect(document.querySelector('.h-8.bg-gray-200.rounded')).toBeInTheDocument();
    });
  });

  describe('Processing State', () => {
    beforeEach(() => {
      mockGetBulkEvaluations.mockResolvedValue(mockBulkEvaluations);
    });

    it('renders progress meter for processing evaluation', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('50 de 100 evaluaciones completadas')).toBeInTheDocument();
      expect(screen.getByText('5 evaluaciones fallidas')).toBeInTheDocument();
    });

    it('calculates progress percentage correctly', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
      
      // Check progress bar width
      const progressBar = document.querySelector('.h-4.rounded-full.bg-blue-500');
      expect(progressBar).toHaveStyle('width: 50%');
    });

    it('shows failed evaluations when present', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('5 evaluaciones fallidas')).toBeInTheDocument();
      });
      
      const failedText = screen.getByText('5 evaluaciones fallidas');
      expect(failedText).toHaveClass('text-red-400');
    });

    it('does not show failed evaluations when zero', async () => {
      const evaluationsWithoutFailures = [
        {
          ...mockBulkEvaluations[0],
          failedEvaluations: 0,
        },
      ];
      
      mockGetBulkEvaluations.mockResolvedValue(evaluationsWithoutFailures);
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      expect(screen.queryByText(/evaluaciones fallidas/)).not.toBeInTheDocument();
    });
  });

  describe('No Processing State', () => {
    beforeEach(() => {
      mockGetBulkEvaluations.mockResolvedValue(mockCompletedEvaluations);
    });

    it('renders default state when no processing evaluations', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('0 de 0 evaluaciones completadas')).toBeInTheDocument();
      
      // Check progress bar is empty
      const progressBar = document.querySelector('.h-4.rounded-full.bg-blue-500');
      expect(progressBar).toHaveStyle('width: 0%');
    });
  });

  describe('Navigation', () => {
    it('navigates to dashboard when no processing evaluations found', async () => {
      mockGetBulkEvaluations.mockResolvedValue(mockCompletedEvaluations);
      
      renderComponent();
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('does not navigate when processing evaluations exist', async () => {
      mockGetBulkEvaluations.mockResolvedValue(mockBulkEvaluations);
      
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Polling', () => {
    it('polls for updates every 60 seconds', async () => {
      mockGetBulkEvaluations.mockResolvedValue(mockBulkEvaluations);
      
      renderComponent();
      
      // Initial call
      await waitFor(() => {
        expect(mockGetBulkEvaluations).toHaveBeenCalledTimes(1);
      });
      
      // Advance timer by 60 seconds
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      
      await waitFor(() => {
        expect(mockGetBulkEvaluations).toHaveBeenCalledTimes(2);
      });
      
      // Advance timer by another 60 seconds
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      
      await waitFor(() => {
        expect(mockGetBulkEvaluations).toHaveBeenCalledTimes(3);
      });
    });

    it('clears interval on component unmount', async () => {
      mockGetBulkEvaluations.mockResolvedValue(mockBulkEvaluations);
      
      const { unmount } = renderComponent();
      
      await waitFor(() => {
        expect(mockGetBulkEvaluations).toHaveBeenCalledTimes(1);
      });
      
      unmount();
      
      // Advance timer - should not trigger additional calls
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      
      // Wait a bit to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockGetBulkEvaluations).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetBulkEvaluations.mockRejectedValue(new Error('API Error'));
      
      renderComponent();
      
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching bulk evaluations:', expect.any(Error));
      });
      
      // Should show default state on error
      expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      expect(screen.getByText('0%')).toBeInTheDocument();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Component Structure', () => {
    beforeEach(() => {
      mockGetBulkEvaluations.mockResolvedValue(mockBulkEvaluations);
    });

    it('has correct CSS classes for styling', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      // Check main container
      expect(container.querySelector('.bg-gray-800.rounded-lg.shadow.p-6')).toBeInTheDocument();
      
      // Check title styling
      expect(container.querySelector('.text-lg.font-semibold.text-gray-100.mb-4')).toBeInTheDocument();
      
      // Check progress bar styling
      expect(container.querySelector('.h-4.rounded-full.bg-gray-700')).toBeInTheDocument();
      expect(container.querySelector('.h-4.rounded-full.bg-blue-500')).toBeInTheDocument();
    });

    it('has proper dark theme styling', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      // Check dark theme classes
      expect(container.querySelector('.bg-gray-800')).toBeInTheDocument();
      expect(container.querySelector('.text-gray-100')).toBeInTheDocument();
      expect(container.querySelector('.text-gray-300')).toBeInTheDocument();
      expect(container.querySelector('.bg-gray-700')).toBeInTheDocument();
    });

    it('has proper progress indicator styling', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Evaluación Masiva en Progreso')).toBeInTheDocument();
      });
      
      // Check progress label
      expect(container.querySelector('.text-xs.font-semibold.inline-block.py-1.px-2.uppercase.rounded-full.text-blue-200.bg-blue-900')).toBeInTheDocument();
      
      // Check percentage display
      expect(container.querySelector('.text-xs.font-semibold.inline-block.text-blue-200')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles 100% completion correctly', async () => {
      const fullCompletionEvaluation = [
        {
          _id: '1',
          status: 'processing' as const,
          totalEvaluations: 100,
          completedEvaluations: 100,
          failedEvaluations: 0,
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];
      
      mockGetBulkEvaluations.mockResolvedValue(fullCompletionEvaluation);
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
      
      expect(screen.getByText('100 de 100 evaluaciones completadas')).toBeInTheDocument();
      
      const progressBar = document.querySelector('.h-4.rounded-full.bg-blue-500');
      expect(progressBar).toHaveStyle('width: 100%');
    });

    it('handles zero total evaluations', async () => {
      const zeroTotalEvaluation = [
        {
          _id: '1',
          status: 'processing' as const,
          totalEvaluations: 0,
          completedEvaluations: 0,
          failedEvaluations: 0,
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];
      
      mockGetBulkEvaluations.mockResolvedValue(zeroTotalEvaluation);
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
      
      expect(screen.getByText('0 de 0 evaluaciones completadas')).toBeInTheDocument();
    });

    it('handles multiple processing evaluations (shows latest)', async () => {
      const multipleProcessingEvaluations = [
        {
          _id: '1',
          status: 'processing' as const,
          totalEvaluations: 100,
          completedEvaluations: 30,
          failedEvaluations: 2,
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
        {
          _id: '2',
          status: 'processing' as const,
          totalEvaluations: 50,
          completedEvaluations: 25,
          failedEvaluations: 1,
          createdAt: new Date('2024-01-16T11:00:00Z'),
        },
      ];
      
      mockGetBulkEvaluations.mockResolvedValue(multipleProcessingEvaluations);
      renderComponent();
      
      await waitFor(() => {
        // Should show the first processing evaluation found
        expect(screen.getByText('30%')).toBeInTheDocument();
      });
      
      expect(screen.getByText('30 de 100 evaluaciones completadas')).toBeInTheDocument();
      expect(screen.getByText('2 evaluaciones fallidas')).toBeInTheDocument();
    });
  });
});