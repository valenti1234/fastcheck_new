import React, { ReactNode } from 'react';
import { ChevronDown, Filter, Settings } from 'lucide-react';

import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showFilters?: boolean;
  showSettings?: boolean;
  showBackButton?: boolean;
  timeFilter?: string;
  frameworkFilter?: string;
  onTimeFilterChange?: () => void;
  onFrameworkFilterChange?: () => void;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  title,
  subtitle,
  showFilters = false,
  showSettings = false,
  showBackButton = false,
  timeFilter,
  frameworkFilter,
  onTimeFilterChange,
  onFrameworkFilterChange,
}) => {
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            {showBackButton && (
              <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                <ArrowLeft className="h-6 w-6" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            </div>
            {(timeFilter || frameworkFilter || subtitle) && (
              <div className="flex items-center mt-2 space-x-2">
                {timeFilter && (
                  <>
                    <button
                      onClick={onTimeFilterChange}
                      className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
                    >
                      {timeFilter} <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                    {frameworkFilter && <span className="text-gray-300">|</span>}
                  </>
                )}
                {frameworkFilter && (
                  <button
                    onClick={onFrameworkFilterChange}
                    className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
                  >
                    {frameworkFilter} <ChevronDown className="ml-1 h-4 w-4" />
                  </button>
                )}
                {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
              </div>
            )}
          </div>
          {(showFilters || showSettings) && (
            <div className="flex items-center space-x-2">
              {showFilters && (
                <button className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100">
                  <Filter className="h-5 w-5" />
                </button>
              )}
              {showSettings && (
                <button className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100">
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

export default PageLayout; 