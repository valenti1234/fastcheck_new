import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditOverview from '../AuditOverview';

// Mock dependencies
jest.mock('../common/Card', () => {
  return function MockCard({ title, subtitle, children }: any) {
    return (
      <div data-testid="card">
        <div data-testid="card-title">{title}</div>
        <div data-testid="card-subtitle">{subtitle}</div>
        {children}
      </div>
    );
  };
});

jest.mock('../common/FilterTabs', () => {
  return function MockFilterTabs({ tabs, activeTab, onTabChange, className }: any) {
    return (
      <div data-testid="filter-tabs" className={className}>
        {tabs.map((tab: any) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={activeTab === tab.id ? 'active' : ''}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };
});

jest.mock('lucide-react', () => ({
  ChevronRight: () => <div data-testid="chevron-right">ChevronRight</div>
}));

const mockAudits = [
  {
    id: '1',
    name: 'Financial Audit Q1',
    status: 'upcoming' as const,
    timeRemaining: '5 days',
    icon: 'https://example.com/icon1.png'
  },
  {
    id: '2',
    name: 'Security Audit',
    status: 'in_audit' as const,
    timeRemaining: '2 days',
    icon: 'https://example.com/icon2.png'
  },
  {
    id: '3',
    name: 'Compliance Review',
    status: 'awaiting_report' as const,
    timeRemaining: '1 day'
    // No icon provided
  },
  {
    id: '4',
    name: 'Annual Audit',
    status: 'completed' as const,
    timeRemaining: 'Completed',
    icon: 'https://example.com/icon4.png'
  }
];

describe('AuditOverview Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderAuditOverview = (audits = mockAudits) => {
    return render(<AuditOverview audits={audits} />);
  };

  describe('Rendering', () => {
    it('renders the component with correct title and subtitle', () => {
      renderAuditOverview();

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toHaveTextContent('Audit as of today');
      expect(screen.getByTestId('card-subtitle')).toHaveTextContent('Current Audit Summary');
    });

    it('renders filter tabs with correct tabs', () => {
      renderAuditOverview();

      expect(screen.getByTestId('filter-tabs')).toBeInTheDocument();
      expect(screen.getByTestId('tab-all')).toHaveTextContent('All');
      expect(screen.getByTestId('tab-upcoming')).toHaveTextContent('Upcoming');
      expect(screen.getByTestId('tab-in_audit')).toHaveTextContent('In audit');
      expect(screen.getByTestId('tab-awaiting_report')).toHaveTextContent('Awaiting report');
      expect(screen.getByTestId('tab-completed')).toHaveTextContent('Completed');
    });

    it('renders all audit items', () => {
      renderAuditOverview();

      expect(screen.getByText('Financial Audit Q1')).toBeInTheDocument();
      expect(screen.getByText('Security Audit')).toBeInTheDocument();
      expect(screen.getByText('Compliance Review')).toBeInTheDocument();
      expect(screen.getByText('Annual Audit')).toBeInTheDocument();
    });

    it('renders audit items with correct time remaining', () => {
      renderAuditOverview();

      expect(screen.getByText('Upcoming - 5 days')).toBeInTheDocument();
      expect(screen.getByText('Upcoming - 2 days')).toBeInTheDocument();
      expect(screen.getByText('Upcoming - 1 day')).toBeInTheDocument();
      expect(screen.getByText('Upcoming - Completed')).toBeInTheDocument();
    });

    it('renders ChevronRight icons for all audit items', () => {
      renderAuditOverview();

      const chevronIcons = screen.getAllByTestId('chevron-right');
      expect(chevronIcons).toHaveLength(4);
    });
  });

  describe('Audit Item Icons', () => {
    it('renders audit item with icon when provided', () => {
      renderAuditOverview();

      const iconImages = screen.getAllByRole('img');
      expect(iconImages).toHaveLength(3); // 3 audits have icons
      expect(iconImages[0]).toHaveAttribute('src', 'https://example.com/icon1.png');
      expect(iconImages[1]).toHaveAttribute('src', 'https://example.com/icon2.png');
      expect(iconImages[2]).toHaveAttribute('src', 'https://example.com/icon4.png');
    });

    it('renders placeholder when icon is not provided', () => {
      renderAuditOverview();

      // Find the audit item without icon (Compliance Review)
      const complianceReviewItem = screen.getByText('Compliance Review').closest('div');
      expect(complianceReviewItem).toBeInTheDocument();
      
      // Check that it has a placeholder div instead of an image
      const placeholderDivs = screen.getAllByText('', { selector: 'div.w-6.h-6.bg-white.rounded' });
      expect(placeholderDivs.length).toBeGreaterThan(0);
    });
  });

  describe('Filter Tabs Interaction', () => {
    it('starts with "all" tab as active', () => {
      renderAuditOverview();

      const allTab = screen.getByTestId('tab-all');
      expect(allTab).toHaveClass('active');
    });

    it('changes active tab when clicked', () => {
      renderAuditOverview();

      const upcomingTab = screen.getByTestId('tab-upcoming');
      fireEvent.click(upcomingTab);

      expect(upcomingTab).toHaveClass('active');
      expect(screen.getByTestId('tab-all')).not.toHaveClass('active');
    });

    it('can switch between different tabs', () => {
      renderAuditOverview();

      // Click on "in_audit" tab
      const inAuditTab = screen.getByTestId('tab-in_audit');
      fireEvent.click(inAuditTab);
      expect(inAuditTab).toHaveClass('active');

      // Click on "completed" tab
      const completedTab = screen.getByTestId('tab-completed');
      fireEvent.click(completedTab);
      expect(completedTab).toHaveClass('active');
      expect(inAuditTab).not.toHaveClass('active');
    });

    it('applies correct className to FilterTabs', () => {
      renderAuditOverview();

      const filterTabs = screen.getByTestId('filter-tabs');
      expect(filterTabs).toHaveClass('mb-6');
    });
  });

  describe('Empty State', () => {
    it('renders correctly with empty audits array', () => {
      renderAuditOverview([]);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('filter-tabs')).toBeInTheDocument();
      expect(screen.queryByText('Financial Audit Q1')).not.toBeInTheDocument();
    });
  });

  describe('Audit Item Structure', () => {
    it('renders audit items with correct CSS classes', () => {
      renderAuditOverview();

      const auditItems = screen.getAllByText(/Financial Audit Q1|Security Audit|Compliance Review|Annual Audit/);
      auditItems.forEach(item => {
        const auditContainer = item.closest('div.flex.items-center.justify-between');
        expect(auditContainer).toBeInTheDocument();
        expect(auditContainer).toHaveClass('p-3', 'hover:bg-gray-50', 'rounded-lg', 'cursor-pointer');
      });
    });

    it('renders audit names with correct styling', () => {
      renderAuditOverview();

      const auditNames = screen.getAllByText(/Financial Audit Q1|Security Audit|Compliance Review|Annual Audit/);
      auditNames.forEach(name => {
        expect(name).toHaveClass('text-sm', 'font-medium', 'text-gray-900');
      });
    });

    it('renders time remaining with correct styling', () => {
      renderAuditOverview();

      const timeRemainingElements = screen.getAllByText(/Upcoming - \d+ days?|Upcoming - Completed/);
      timeRemainingElements.forEach(element => {
        expect(element).toHaveClass('text-sm', 'text-gray-500');
      });
    });
  });

  describe('Accessibility', () => {
    it('renders images with empty alt text for decorative icons', () => {
      renderAuditOverview();

      const iconImages = screen.getAllByRole('img');
      iconImages.forEach(img => {
        expect(img).toHaveAttribute('alt', '');
      });
    });

    it('maintains proper heading hierarchy', () => {
      renderAuditOverview();

      const auditNames = screen.getAllByRole('heading', { level: 3 });
      expect(auditNames).toHaveLength(4);
      expect(auditNames[0]).toHaveTextContent('Financial Audit Q1');
      expect(auditNames[1]).toHaveTextContent('Security Audit');
      expect(auditNames[2]).toHaveTextContent('Compliance Review');
      expect(auditNames[3]).toHaveTextContent('Annual Audit');
    });
  });

  describe('Props Validation', () => {
    it('handles different audit statuses correctly', () => {
      const auditsWithDifferentStatuses = [
        { id: '1', name: 'Audit 1', status: 'upcoming' as const, timeRemaining: '5 days', icon: 'icon1.png' },
        { id: '2', name: 'Audit 2', status: 'in_audit' as const, timeRemaining: '2 days', icon: 'icon2.png' },
        { id: '3', name: 'Audit 3', status: 'awaiting_report' as const, timeRemaining: '1 day' },
        { id: '4', name: 'Audit 4', status: 'completed' as const, timeRemaining: 'Done', icon: 'icon4.png' }
      ];

      renderAuditOverview(auditsWithDifferentStatuses);

      expect(screen.getByText('Audit 1')).toBeInTheDocument();
      expect(screen.getByText('Audit 2')).toBeInTheDocument();
      expect(screen.getByText('Audit 3')).toBeInTheDocument();
      expect(screen.getByText('Audit 4')).toBeInTheDocument();
    });

    it('handles audits with special characters in names', () => {
      const auditsWithSpecialChars = [
        { id: '1', name: 'Audit & Review #1', status: 'upcoming' as const, timeRemaining: '5 days', icon: 'icon1.png' },
        { id: '2', name: 'Audit (Q1/2024)', status: 'in_audit' as const, timeRemaining: '2 days', icon: 'icon2.png' }
      ];

      renderAuditOverview(auditsWithSpecialChars);

      expect(screen.getByText('Audit & Review #1')).toBeInTheDocument();
      expect(screen.getByText('Audit (Q1/2024)')).toBeInTheDocument();
    });

    it('handles long audit names gracefully', () => {
      const auditsWithLongNames = [
        {
          id: '1',
          name: 'Very Long Audit Name That Might Overflow The Container And Cause Layout Issues',
          status: 'upcoming' as const,
          timeRemaining: '5 days',
          icon: 'icon1.png'
        }
      ];

      renderAuditOverview(auditsWithLongNames);

      expect(screen.getByText('Very Long Audit Name That Might Overflow The Container And Cause Layout Issues')).toBeInTheDocument();
    });
  });
});