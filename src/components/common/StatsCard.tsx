import React from 'react';

type ColorType = 'emerald' | 'red' | 'orange' | 'gray';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
  };
  subtitle?: string;
  progress?: {
    value: number;
    color?: ColorType;
  };
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  subtitle,
  progress
}) => {
  const getChangeColor = (type: 'increase' | 'decrease') => {
    return type === 'increase' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const getProgressColor = (color: ColorType = 'emerald') => {
    const colors: Record<ColorType, string> = {
      emerald: 'bg-emerald-500',
      red: 'bg-red-500',
      orange: 'bg-orange-400',
      gray: 'bg-gray-500'
    };
    return colors[color];
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm text-gray-600">{title}</h3>
        {change && (
          <span className={`text-xs px-2 py-1 rounded ${getChangeColor(change.type)}`}>
            {change.type === 'increase' ? '+' : '-'}{Math.abs(change.value)}%
          </span>
        )}
      </div>
      <div className="flex items-end space-x-2">
        <span className="text-3xl font-semibold">{value}</span>
        {subtitle && (
          <span className="text-sm text-gray-600 mb-1">{subtitle}</span>
        )}
      </div>
      {progress && (
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getProgressColor(progress.color)} rounded-full`}
            style={{ width: `${progress.value}%` }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default StatsCard; 