import React, { ReactNode } from 'react';
import { Download, Filter, Settings, ChevronDown } from 'lucide-react';

interface CardProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showDownload?: boolean;
  showFilters?: boolean;
  showSettings?: boolean;
  timeFilter?: string;
  frameworkFilter?: string;
  onDownload?: () => void;
  onTimeFilterChange?: () => void;
  onFrameworkFilterChange?: () => void;
  className?: string;
}

const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  showDownload = false,
  showFilters = false,
  showSettings = false,
  timeFilter,
  frameworkFilter,
  onDownload,
  onTimeFilterChange,
  onFrameworkFilterChange,
  className = '',
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          {(timeFilter || frameworkFilter || subtitle) && (
            <div className="flex items-center mt-2 space-x-2">
              {timeFilter && (
                <>
                  <button
                    onClick={onTimeFilterChange}
                    className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    {timeFilter} <ChevronDown className="ml-1 h-4 w-4" />
                  </button>
                  {frameworkFilter && <span className="text-gray-400 dark:text-gray-600">|</span>}
                </>
              )}
              {frameworkFilter && (
                <button
                  onClick={onFrameworkFilterChange}
                  className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  {frameworkFilter} <ChevronDown className="ml-1 h-4 w-4" />
                </button>
              )}
              {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {showFilters && (
            <button className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700">
              <Filter className="h-5 w-5" />
            </button>
          )}
          {showSettings && (
            <button className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700">
              <Settings className="h-5 w-5" />
            </button>
          )}
          {showDownload && (
            <button
              onClick={onDownload}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700"
            >
              <Download className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};

export default Card; 