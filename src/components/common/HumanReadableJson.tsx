import React from 'react';

interface HumanReadableJsonProps {
  data: any;
}

const formatKey = (key: string) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ');
};

const HumanReadableJson: React.FC<HumanReadableJsonProps> = ({ data }) => {
  if (data === null || data === undefined) {
    return <div className="text-gray-500">No data</div>;
  }

  const renderValue = (value: any) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <span className="text-gray-800">{String(value)}</span>;
    }
    if (value === null) {
      return <span className="text-gray-500">N/A</span>;
    }
    if (Array.isArray(value)) {
      return (
        <div className="pl-4 border-l-2 border-gray-200">
          {value.map((item, index) => (
            <div key={index} className="mb-1">
              {renderValue(item)}
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') {
      return (
        <div className="pl-4 border-l-2 border-gray-200">
          {Object.entries(value).map(([key, val]) => {
            if (key === 'domicilio' || key === 'cve' || key === 'linkPdf' || key === 'numeroAtencion') {
              return null;
            }
            return (
              <div key={key} className="mb-2">
                <strong className="font-semibold text-gray-600">{formatKey(key)}:</strong>
                <div className="pl-2">{renderValue(val)}</div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return <div className="font-sans">{renderValue(data)}</div>;
};

export default HumanReadableJson;