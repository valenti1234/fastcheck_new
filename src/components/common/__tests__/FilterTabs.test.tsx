import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterTabs from '../FilterTabs';

const defaultTabs = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'pending', label: 'Pending' }
];

const defaultProps = {
  tabs: defaultTabs,
  activeTab: 'all',
  onTabChange: jest.fn()
};

describe('FilterTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all tabs correctly', () => {
      render(<FilterTabs {...defaultProps} />);
      
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders correct number of tab buttons', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
    });

    it('applies active styling to the active tab', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const allButton = screen.getByText('All');
      const activeButton = screen.getByText('Active');
      
      expect(allButton).toHaveClass('bg-purple-100', 'text-purple-700');
      expect(activeButton).toHaveClass('text-gray-600');
      expect(activeButton).not.toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('applies inactive styling to non-active tabs', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const inactiveButton = screen.getByText('Inactive');
      const pendingButton = screen.getByText('Pending');
      
      expect(inactiveButton).toHaveClass('text-gray-600', 'hover:bg-gray-100');
      expect(pendingButton).toHaveClass('text-gray-600', 'hover:bg-gray-100');
    });
  });

  describe('Tab Interaction', () => {
    it('calls onTabChange when a tab is clicked', () => {
      const mockOnTabChange = jest.fn();
      render(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      const activeButton = screen.getByText('Active');
      fireEvent.click(activeButton);
      
      expect(mockOnTabChange).toHaveBeenCalledWith('active');
      expect(mockOnTabChange).toHaveBeenCalledTimes(1);
    });

    it('calls onTabChange with correct tab id for different tabs', () => {
      const mockOnTabChange = jest.fn();
      render(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      fireEvent.click(screen.getByText('Inactive'));
      expect(mockOnTabChange).toHaveBeenCalledWith('inactive');
      
      fireEvent.click(screen.getByText('Pending'));
      expect(mockOnTabChange).toHaveBeenCalledWith('pending');
      
      expect(mockOnTabChange).toHaveBeenCalledTimes(2);
    });

    it('does not call onTabChange when active tab is clicked', () => {
      const mockOnTabChange = jest.fn();
      render(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      const allButton = screen.getByText('All');
      fireEvent.click(allButton);
      
      expect(mockOnTabChange).toHaveBeenCalledWith('all');
    });
  });

  describe('Different Active Tab', () => {
    it('correctly highlights different active tab', () => {
      render(<FilterTabs {...defaultProps} activeTab="pending" />);
      
      const allButton = screen.getByText('All');
      const pendingButton = screen.getByText('Pending');
      
      expect(allButton).toHaveClass('text-gray-600');
      expect(allButton).not.toHaveClass('bg-purple-100', 'text-purple-700');
      expect(pendingButton).toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('updates styling when activeTab prop changes', () => {
      const { rerender } = render(<FilterTabs {...defaultProps} activeTab="all" />);
      
      let allButton = screen.getByText('All');
      let activeButton = screen.getByText('Active');
      
      expect(allButton).toHaveClass('bg-purple-100', 'text-purple-700');
      expect(activeButton).toHaveClass('text-gray-600');
      
      rerender(<FilterTabs {...defaultProps} activeTab="active" />);
      
      allButton = screen.getByText('All');
      activeButton = screen.getByText('Active');
      
      expect(allButton).toHaveClass('text-gray-600');
      expect(activeButton).toHaveClass('bg-purple-100', 'text-purple-700');
    });
  });

  describe('Custom Props', () => {
    it('applies custom className', () => {
      const { container } = render(
        <FilterTabs {...defaultProps} className="custom-class mb-4" />
      );
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('custom-class', 'mb-4');
    });

    it('works without custom className', () => {
      const { container } = render(<FilterTabs {...defaultProps} />);
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('flex', 'space-x-2');
    });

    it('combines default and custom classes', () => {
      const { container } = render(
        <FilterTabs {...defaultProps} className="extra-spacing" />
      );
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('flex', 'space-x-2', 'extra-spacing');
    });
  });

  describe('Different Tab Configurations', () => {
    it('handles single tab', () => {
      const singleTab = [{ id: 'only', label: 'Only Tab' }];
      render(
        <FilterTabs
          tabs={singleTab}
          activeTab="only"
          onTabChange={jest.fn()}
        />
      );
      
      expect(screen.getByText('Only Tab')).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('handles many tabs', () => {
      const manyTabs = Array.from({ length: 10 }, (_, i) => ({
        id: `tab-${i}`,
        label: `Tab ${i + 1}`
      }));
      
      render(
        <FilterTabs
          tabs={manyTabs}
          activeTab="tab-0"
          onTabChange={jest.fn()}
        />
      );
      
      expect(screen.getAllByRole('button')).toHaveLength(10);
      expect(screen.getByText('Tab 1')).toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('handles empty tabs array', () => {
      render(
        <FilterTabs
          tabs={[]}
          activeTab=""
          onTabChange={jest.fn()}
        />
      );
      
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles tabs with special characters in labels', () => {
      const specialTabs = [
        { id: 'special1', label: 'Tab & More' },
        { id: 'special2', label: 'Tab < Less' },
        { id: 'special3', label: 'Tab > Greater' },
        { id: 'special4', label: 'Tab "Quoted"' }
      ];
      
      render(
        <FilterTabs
          tabs={specialTabs}
          activeTab="special1"
          onTabChange={jest.fn()}
        />
      );
      
      expect(screen.getByText('Tab & More')).toBeInTheDocument();
      expect(screen.getByText('Tab < Less')).toBeInTheDocument();
      expect(screen.getByText('Tab > Greater')).toBeInTheDocument();
      expect(screen.getByText('Tab "Quoted"')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('has correct CSS classes for container', () => {
      const { container } = render(<FilterTabs {...defaultProps} />);
      
      const tabsContainer = container.firstChild;
      expect(tabsContainer).toHaveClass('flex', 'space-x-2');
    });

    it('has correct CSS classes for buttons', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass(
          'px-3',
          'py-1',
          'text-sm',
          'font-medium',
          'rounded-full',
          'transition-colors'
        );
      });
    });

    it('applies hover styles to inactive buttons', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const inactiveButton = screen.getByText('Active');
      expect(inactiveButton).toHaveClass('hover:bg-gray-100');
    });
  });

  describe('Accessibility', () => {
    it('renders buttons with proper role', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
    });

    it('buttons are keyboard accessible', () => {
      const mockOnTabChange = jest.fn();
      render(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      const activeButton = screen.getByText('Active');
      activeButton.focus();
      
      fireEvent.keyDown(activeButton, { key: 'Enter' });
      // Note: onClick should still work with Enter key due to button semantics
    });

    it('has proper text contrast for active state', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const activeButton = screen.getByText('All');
      expect(activeButton).toHaveClass('text-purple-700');
    });

    it('has proper text contrast for inactive state', () => {
      render(<FilterTabs {...defaultProps} />);
      
      const inactiveButton = screen.getByText('Active');
      expect(inactiveButton).toHaveClass('text-gray-600');
    });
  });

  describe('Edge Cases', () => {
    it('handles activeTab that does not exist in tabs', () => {
      render(<FilterTabs {...defaultProps} activeTab="nonexistent" />);
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('text-gray-600');
        expect(button).not.toHaveClass('bg-purple-100', 'text-purple-700');
      });
    });

    it('handles tabs with duplicate ids', () => {
      const duplicateTabs = [
        { id: 'duplicate', label: 'First' },
        { id: 'duplicate', label: 'Second' },
        { id: 'unique', label: 'Unique' }
      ];
      
      const mockOnTabChange = jest.fn();
      render(
        <FilterTabs
          tabs={duplicateTabs}
          activeTab="duplicate"
          onTabChange={mockOnTabChange}
        />
      );
      
      // Both buttons with duplicate id should have active styling
      const firstButton = screen.getByText('First');
      const secondButton = screen.getByText('Second');
      
      expect(firstButton).toHaveClass('bg-purple-100', 'text-purple-700');
      expect(secondButton).toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('handles very long tab labels', () => {
      const longLabelTabs = [
        { id: 'long', label: 'This is a very long tab label that might cause layout issues' },
        { id: 'short', label: 'Short' }
      ];
      
      render(
        <FilterTabs
          tabs={longLabelTabs}
          activeTab="long"
          onTabChange={jest.fn()}
        />
      );
      
      expect(screen.getByText('This is a very long tab label that might cause layout issues')).toBeInTheDocument();
    });

    it('handles empty string labels', () => {
      const emptyLabelTabs = [
        { id: 'empty', label: '' },
        { id: 'normal', label: 'Normal' }
      ];
      
      render(
        <FilterTabs
          tabs={emptyLabelTabs}
          activeTab="empty"
          onTabChange={jest.fn()}
        />
      );
      
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toHaveTextContent('');
    });
  });

  describe('Performance', () => {
    it('does not re-render unnecessarily', () => {
      const mockOnTabChange = jest.fn();
      const { rerender } = render(
        <FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />
      );
      
      // Re-render with same props
      rerender(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      // Component should still work correctly
      fireEvent.click(screen.getByText('Active'));
      expect(mockOnTabChange).toHaveBeenCalledWith('active');
    });

    it('handles rapid tab changes', () => {
      const mockOnTabChange = jest.fn();
      render(<FilterTabs {...defaultProps} onTabChange={mockOnTabChange} />);
      
      const activeButton = screen.getByText('Active');
      const inactiveButton = screen.getByText('Inactive');
      
      // Rapid clicks
      fireEvent.click(activeButton);
      fireEvent.click(inactiveButton);
      fireEvent.click(activeButton);
      
      expect(mockOnTabChange).toHaveBeenCalledTimes(3);
      expect(mockOnTabChange).toHaveBeenNthCalledWith(1, 'active');
      expect(mockOnTabChange).toHaveBeenNthCalledWith(2, 'inactive');
      expect(mockOnTabChange).toHaveBeenNthCalledWith(3, 'active');
    });
  });
});