import React, { useEffect } from 'react';
import AuditOverview from '../../components/dashboard/AuditOverview';
import i18n from '../../i18n';
import duxLogo from '../../assets/dux_logo_small.png';

const sampleAudits = [
  { id: '1', name: 'Financial Audit Q1', status: 'upcoming' as const, timeRemaining: '5 days', icon: duxLogo },
  { id: '2', name: 'Security Audit', status: 'in_audit' as const, timeRemaining: '2 days', icon: duxLogo },
  { id: '3', name: 'Compliance Review', status: 'awaiting_report' as const, timeRemaining: '1 day' },
  { id: '4', name: 'Annual Audit', status: 'completed' as const, timeRemaining: 'Completed', icon: duxLogo },
];

const AuditOverviewDebug: React.FC = () => {
  useEffect(() => {
    i18n.changeLanguage('en');
  }, []);
  return (
    <div className="max-w-4xl mx-auto p-6">
      <AuditOverview audits={sampleAudits} />
    </div>
  );
};

export default AuditOverviewDebug;