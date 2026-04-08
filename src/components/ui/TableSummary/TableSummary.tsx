import React from 'react';

const getDimension = (rule: any, allRules: any) => {
    if ((allRules?.complianceRules || []).includes(rule)) return 'Compliance';
    if ((allRules?.legalRules || []).includes(rule)) return 'Legal';
    if ((allRules?.capitalHumanoRules || []).includes(rule)) return 'Capital Humano';
    if ((allRules?.financieroTributarioRules || []).includes(rule)) return 'Financiero-Tributario';
    if (rule.label === 'Causas Penales') return 'Integridad, Ética y Riesgo Penal';
    return '';
};

const TableSummary = ({ criticalAndHighParams, riskSummary, calculateTotals }: any) => {
    return (
        <div className="grid grid-cols-[auto_auto] gap-4">
            {criticalAndHighParams.map((rule: any, index: number) => {
                const dimension = getDimension(rule, riskSummary.allRules);
                const totals = calculateTotals(rule);

                return (
                    <div
                        key={`summary-${index}`}
                        className="border border-gray-300  rounded-lg overflow-hidden"
                    >
                        {/* Header */}
                        <div className=" p-2 dark:bg-blue-500">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-bold text-blue-500 dark:text-blue-400 mb-2">
                                            {rule.label}
                                        </h3>
                                    </div>
                                    <div style={{padding:".5rem"}} className="rounded-lg flex items-center justify-center bg-blue-100 flex gap-3 text-sm text-black">
                                        <span className='flex gap-1 text-base'><strong>Dimensión:</strong> <h3>{dimension}</h3></span>
                                        <span className='flex gap-1 text-base'><strong>Impacto:</strong> <h3>{rule.impacto}</h3></span>
                                        <span>
                                            <strong>Riesgo:</strong> {rule.risk === 'critico' ? 'Crítico' : 'Alto'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabla de totales */}
                        <div className="bg-white dark:bg-gray-800">
                            {totals.length > 0 ? (
                                <table className="w-full bg-blue-500 p-2">
                                    <thead />
                                    <tbody className='bg-yellow-500'>
                                        {totals.map((item: any, idx: number) => (
                                            <tr
                                                key={`metric-${idx}`}
                                                className={idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'}
                                            >
                                                <td className="border-b border-gray-200 dark:border-gray-700 p-1 text-gray-700 dark:text-gray-300">
                                                    {item.label}
                                                </td>
                                                <td className=" border-gray-200 dark:border-gray-500 p-1 text-right text-blue-500 dark:text-white">
                                                    {item.value}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-6 text-center">
                                    <span className="text-gray-500 dark:text-gray-400 italic">
                                        Sin detalles disponibles
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TableSummary;
