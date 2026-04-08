import { FileText } from "lucide-react";
import { Tooltip } from "@mui/material";

interface ProcessedRule {
    label: string;
    impacto: string;
    detected: boolean | null;
    risk: string;
    details: any;
    showDetails: boolean;
}

interface TableAssessmentProps {
    title: string;
    titleTooltip?: string;
    data: ProcessedRule[];
    dataTitle?: string[];
    getImpactColor?: (impacto: string) => string;
    getTooltip?: (label: string) => string;
    onShowDetails?: (title: string, details: any) => void;
}

const TableAssessment = ({
    title,
    titleTooltip,
    data = [],
    dataTitle = ["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"],
    getImpactColor = () => "",
    getTooltip,
    onShowDetails
}: TableAssessmentProps) => {

    const renderRow = (rule: ProcessedRule, index: number) => {
        const detectedDisplay = rule.detected === null
            ? 'No'
            : (rule.detected ? 'Sí' : 'No');

        return (
            <tr
                key={`row-${index}`}
                className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}
            >
                <td className="border dark:border-gray-600 p-2 dark:text-gray-300">
                    {getTooltip ? (
                        <Tooltip
                            title={getTooltip(rule.label)}
                            arrow
                            placement="right"
                            slotProps={{
                                tooltip: {
                                    sx: { fontSize: ".8rem" }
                                }
                            }}
                        >
                            <span className="cursor-help">{rule.label}</span>
                        </Tooltip>
                    ) : (
                        rule.label
                    )}
                </td>
                <td className={`border p-2 ${getImpactColor(rule.impacto)}`}>
                    {rule.impacto ? rule.impacto.charAt(0).toUpperCase() + rule.impacto.slice(1) : rule.impacto}
                </td>
                <td className="border dark:border-gray-600 p-2 dark:text-gray-300">
                    {detectedDisplay}
                </td>
                <td className="border dark:border-gray-600 p-2 ">
                    <div className={`w-6 h-6 rounded-full mx-auto ${rule.risk === 'critico' ? 'bg-red-500' :
                        rule.risk === 'alto' ? 'bg-orange-500' :
                            rule.risk === 'no_disponible' ? 'bg-gray-400' :
                                'bg-green-500'
                        }`}></div>
                </td>
                <td className="border dark:border-gray-600 p-2 align-middle">
                    {rule.showDetails && onShowDetails ? (
                        <button
                            onClick={() => onShowDetails(rule.label, rule.details)}
                            className="mx-auto flex items-center px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                            aria-label="Ver detalles del parámetro"
                        >
                            <FileText className="w-4 h-4" />
                        </button>
                    ) : null}
                </td>

            </tr>
        );
    };

    const titleElement = (
        <h3 className="text-lg font-bold text-blue-500 dark:text-blue-400 mb-2">{title}</h3>
    );

    return (
        <div>
            {titleTooltip ? (
                <Tooltip

                    title={titleTooltip} arrow placement="top"
                    slotProps={{
                        tooltip: {
                            sx: { fontSize: ".8rem" }
                        }
                    }}
                >





                    {titleElement}
                </Tooltip>
            ) : (
                titleElement
            )}
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                        {dataTitle.map((t: string, idx: number) => (
                            <th key={idx} className="border dark:border-gray-600 p-2 text-left dark:text-white">
                                {t}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(data || []).map((rule, index) => renderRow(rule, index))}
                </tbody>
            </table>
        </div>
    );
};

export default TableAssessment;