import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ResultsTable from '../ResultsTable';
import '@testing-library/jest-dom';

// Mock react-router-dom Link component
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

const mockResults = [
  {
    _id: '1',
    createdAt: '2024-01-15T10:30:00Z',
    rut: '12345678-9',
    tenantId: 'tenant1',
    markdownResume: 'Test resume 1',
    sheriffLogData: {},
    details: {
      rut: '12345678-9',
      razonSocial: 'Test Company 1'
    },
    riskAssessment: {
      riskSummary: {
        semaphore: 'red'
      }
    },
    vistaDuxiter: [],
    duxiterFilter: {},
    duxiterRiskLevel: 'high',
    duxiterRiskData: {},
    duxiterRiskList: {},
    duxiterMD: 'Test MD 1',
    newSummaryData: {}
  },
  {
    _id: '2',
    createdAt: '2024-01-14T15:45:00Z',
    rut: '98765432-1',
    tenantId: 'tenant1',
    markdownResume: 'Test resume 2',
    sheriffLogData: {},
    details: {
      rut: '98765432-1',
      razonSocial: 'Test Company 2'
    },
    riskAssessment: {
      riskSummary: {
        semaphore: 'green'
      }
    },
    vistaDuxiter: [],
    duxiterFilter: {},
    duxiterRiskLevel: 'low',
    duxiterRiskData: {},
    duxiterRiskList: {},
    duxiterMD: 'Test MD 2',
    newSummaryData: {}
  },
  {
    _id: '3',
    createdAt: '2024-01-13T09:15:00Z',
    rut: '11111111-1',
    tenantId: 'tenant1',
    markdownResume: 'Test resume 3',
    sheriffLogData: {},
    details: {
      rut: '11111111-1',
      razonSocial: 'Test Company 3'
    },
    riskAssessment: {
      riskSummary: {
        semaphore: 'yellow'
      }
    },
    vistaDuxiter: [],
    duxiterFilter: {},
    duxiterRiskLevel: 'medium',
    duxiterRiskData: {},
    duxiterRiskList: {},
    duxiterMD: 'Test MD 3',
    newSummaryData: {}
  }
] as any;

const defaultProps = {
  results: mockResults,
  currentPage: 1,
  totalPages: 3,
  onPageChange: jest.fn(),
  sortField: 'createdAt',
  sortDirection: 'desc' as const,
  onSort: jest.fn()
};

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('ResultsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the table with correct title', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      expect(screen.getByText('Consultas Recientes')).toBeInTheDocument();
    });

    it('renders table headers correctly', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      expect(screen.getByText('RUT')).toBeInTheDocument();
      expect(screen.getByText('Razón Social')).toBeInTheDocument();
      expect(screen.getByText('Nivel de Riesgo')).toBeInTheDocument();
      expect(screen.getByText('Fecha')).toBeInTheDocument();
      expect(screen.getByText('Acciones')).toBeInTheDocument();
    });

    it('renders all result rows', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      expect(screen.getByText('12345678-9')).toBeInTheDocument();
      expect(screen.getByText('Test Company 1')).toBeInTheDocument();
      expect(screen.getByText('98765432-1')).toBeInTheDocument();
      expect(screen.getByText('Test Company 2')).toBeInTheDocument();
      expect(screen.getByText('11111111-1')).toBeInTheDocument();
      expect(screen.getByText('Test Company 3')).toBeInTheDocument();
    });

    it('renders "Ver Detalle" links for each result', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      const detailLinks = screen.getAllByText('Ver Detalle');
      expect(detailLinks).toHaveLength(3);
      expect(detailLinks[0]).toHaveAttribute('href', '/consultas/1');
      expect(detailLinks[1]).toHaveAttribute('href', '/consultas/2');
      expect(detailLinks[2]).toHaveAttribute('href', '/consultas/3');
    });
  });

  describe('Risk Level Display', () => {
    it('displays correct risk level names and colors', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      // Red risk level
      const criticalRisk = screen.getByText('Critico');
      expect(criticalRisk).toBeInTheDocument();
      expect(criticalRisk).toHaveClass('bg-red-100', 'text-red-800');
      
      // Green risk level
      const lowRisk = screen.getByText('Bajo');
      expect(lowRisk).toBeInTheDocument();
      expect(lowRisk).toHaveClass('bg-green-100', 'text-green-800');
      
      // Yellow risk level
      const mediumRisk = screen.getByText('Medio');
      expect(mediumRisk).toBeInTheDocument();
      expect(mediumRisk).toHaveClass('bg-yellow-100', 'text-yellow-800');
    });

    it('handles orange risk level correctly', () => {
      const resultsWithOrange = [{
        ...mockResults[0],
        riskAssessment: {
          riskSummary: {
            semaphore: 'orange'
          }
        }
      }];
      
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          results={resultsWithOrange}
        />
      );
      
      expect(screen.getByText('Alto')).toBeInTheDocument();
    });

    it('handles unknown risk levels with default styling', () => {
      const resultsWithUnknown = [{
        ...mockResults[0],
        riskAssessment: {
          riskSummary: {
            semaphore: 'unknown'
          }
        }
      }];
      
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          results={resultsWithUnknown}
        />
      );
      
      const unknownRisk = screen.getByText('unknown');
      expect(unknownRisk).toBeInTheDocument();
      expect(unknownRisk).toHaveClass('bg-gray-100', 'text-gray-800');
    });
  });

  describe('Date Formatting', () => {
    it('formats dates correctly', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      // Check if dates are formatted as locale date strings
      const expectedDate1 = new Date('2024-01-15T10:30:00Z').toLocaleDateString();
      const expectedDate2 = new Date('2024-01-14T15:45:00Z').toLocaleDateString();
      const expectedDate3 = new Date('2024-01-13T09:15:00Z').toLocaleDateString();
      
      expect(screen.getByText(expectedDate1)).toBeInTheDocument();
      expect(screen.getByText(expectedDate2)).toBeInTheDocument();
      expect(screen.getByText(expectedDate3)).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('calls onSort when sortable headers are clicked', () => {
      const mockOnSort = jest.fn();
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          onSort={mockOnSort}
        />
      );
      
      fireEvent.click(screen.getByText('RUT'));
      expect(mockOnSort).toHaveBeenCalledWith('rut');
      
      fireEvent.click(screen.getByText('Razón Social'));
      expect(mockOnSort).toHaveBeenCalledWith('razonSocial');
      
      fireEvent.click(screen.getByText('Fecha'));
      expect(mockOnSort).toHaveBeenCalledWith('createdAt');
    });

    it('displays sort indicators correctly', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          sortField="rut"
          sortDirection="asc"
        />
      );
      
      const rutHeader = screen.getByText('RUT');
      expect(rutHeader.parentElement).toHaveTextContent('RUT↑');
    });

    it('displays descending sort indicator', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          sortField="createdAt"
          sortDirection="desc"
        />
      );
      
      const fechaHeader = screen.getByText('Fecha');
      expect(fechaHeader.parentElement).toHaveTextContent('Fecha↓');
    });

    it('does not call onSort when onSort is not provided', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          onSort={undefined}
        />
      );
      
      const rutHeader = screen.getByText('RUT');
      expect(rutHeader.parentElement).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Pagination', () => {
    it('displays pagination information correctly', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      expect(screen.getByText(/Showing page/)).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('calls onPageChange when pagination buttons are clicked', () => {
      const mockOnPageChange = jest.fn();
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          onPageChange={mockOnPageChange}
          currentPage={2}
        />
      );
      
      // Click previous button
      const prevButtons = screen.getAllByText('<');
      fireEvent.click(prevButtons[0]);
      expect(mockOnPageChange).toHaveBeenCalledWith(1);
      
      // Click next button
      const nextButtons = screen.getAllByText('>');
      fireEvent.click(nextButtons[0]);
      expect(mockOnPageChange).toHaveBeenCalledWith(3);
    });

    it('disables previous button on first page', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          currentPage={1}
        />
      );
      
      const prevButtons = screen.getAllByText('<');
      expect(prevButtons[0]).toBeDisabled();
    });

    it('disables next button on last page', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          currentPage={3}
          totalPages={3}
        />
      );
      
      const nextButtons = screen.getAllByText('>');
      expect(nextButtons[0]).toBeDisabled();
    });

    it('renders page number buttons correctly', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          currentPage={2}
          totalPages={5}
        />
      );
      
      // Should render buttons for pages 1-5
      for (let i = 1; i <= 5; i++) {
        const pageButtons = screen.getAllByText(i.toString());
        expect(pageButtons.length).toBeGreaterThan(0);
      }
    });

    it('highlights current page button', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          currentPage={2}
          totalPages={3}
        />
      );
      
      const pageButtons = screen.getAllByText('2');
      const currentPageButton = pageButtons.find(button => 
        button.getAttribute('aria-current') === 'page'
      );
      expect(currentPageButton).toBeInTheDocument();
      expect(currentPageButton).toHaveClass('bg-primary-600', 'text-white');
    });
  });

  describe('Empty State', () => {
    it('displays no data message when results array is empty', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          results={[]}
        />
      );
      
      expect(screen.getByText('No data available')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('applies correct CSS classes for styling', () => {
      const { container } = renderWithRouter(<ResultsTable {...defaultProps} />);
      
      const mainDiv = container.firstChild;
      expect(mainDiv).toHaveClass('bg-white', 'dark:bg-gray-800', 'shadow-sm', 'rounded-lg', 'p-6');
    });

    it('applies dark mode classes correctly', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      const title = screen.getByText('Consultas Recientes');
      expect(title).toHaveClass('text-gray-900', 'dark:text-white');
    });
  });

  describe('Accessibility', () => {
    it('has proper table structure with headers', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(5);
    });

    it('has proper pagination navigation', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      const pagination = screen.getByRole('navigation', { name: 'Pagination' });
      expect(pagination).toBeInTheDocument();
    });

    it('has screen reader text for pagination buttons', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      expect(screen.getByText('Previous')).toHaveClass('sr-only');
      expect(screen.getByText('Next')).toHaveClass('sr-only');
    });
  });

  describe('Edge Cases', () => {
    it('handles missing details gracefully', () => {
      const resultsWithMissingDetails = [{
        _id: '1',
        createdAt: '2024-01-15T10:30:00Z',
        details: {},
        riskAssessment: {
          riskSummary: {
            semaphore: 'green'
          }
        }
      }];
      
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          results={resultsWithMissingDetails as any[]}
        />
      );
      
      // Should not crash and should render the row
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('handles single page correctly', () => {
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          currentPage={1}
          totalPages={1}
        />
      );
      
      const prevButtons = screen.getAllByText('<');
      const nextButtons = screen.getAllByText('>');
      
      expect(prevButtons[0]).toBeDisabled();
      expect(nextButtons[0]).toBeDisabled();
    });

    it('handles very long company names', () => {
      const resultsWithLongName = [{
        ...mockResults[0],
        details: {
          rut: '12345678-9',
          razonSocial: 'Very Long Company Name That Might Cause Layout Issues In The Table'
        }
      }];
      
      renderWithRouter(
        <ResultsTable 
          {...defaultProps} 
          results={resultsWithLongName}
        />
      );
      
      expect(screen.getByText('Very Long Company Name That Might Cause Layout Issues In The Table')).toBeInTheDocument();
    });
  });

  describe('Mobile Responsiveness', () => {
    it('shows mobile pagination controls', () => {
      renderWithRouter(<ResultsTable {...defaultProps} />);
      
      // Mobile pagination should have Previous/Next buttons
      const mobileButtons = screen.getAllByText(/Previous|Next/);
      expect(mobileButtons.length).toBeGreaterThan(0);
    });
  });
});