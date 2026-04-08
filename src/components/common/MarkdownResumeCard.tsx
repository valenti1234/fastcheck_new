import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownResumeCardProps {
  mdResume: string;
}

const MarkdownResumeCard: React.FC<MarkdownResumeCardProps> = ({ mdResume }) => {
  if (!mdResume) {
    return null;
  }

  return (
    <div className="bg-white shadow-xl rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Resumen de Evaluación</h2>
      </div>

      <div className="markdown-content text-base leading-relaxed text-gray-900">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-xl font-semibold text-gray-900 mt-6 mb-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2" {...props} />,
            p: ({node, ...props}) => <p className="text-gray-900 mb-4" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 text-gray-900" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 text-gray-900" {...props} />,
            li: ({node, ...props}) => <li className="mb-1 text-gray-900" {...props} />,
            table: ({node, ...props}) => <table className="w-full border-collapse mb-4" {...props} />,
            thead: ({node, ...props}) => <thead className="bg-gray-100" {...props} />,
            th: ({node, children, ...props}) => {
              // Special handling for "Tipo de Riesgo" header
              const isRiskTypeHeader = children &&
                typeof children === 'string' &&
                children.includes("Tipo de Riesgo");
              
              return (
                <th
                  className={`border border-gray-300 p-2 text-left font-semibold ${
                    isRiskTypeHeader ? "text-left" : ""
                  }`}
                  {...props}
                >
                  {children}
                </th>
              );
            },
            td: ({node, ...props}) => <td className="border border-gray-300 p-2 text-left" {...props} />,
            tr: ({node, ...props}) => <tr className="even:bg-gray-50" {...props} />,
            a: ({node, ...props}) => <a className="text-blue-600 underline" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4" {...props} />,
            code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-sm" {...props} />,
            pre: ({node, ...props}) => <pre className="bg-gray-800 text-gray-100 p-4 rounded overflow-x-auto my-4 font-mono text-sm" {...props} />
          }}
        >
          {mdResume}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownResumeCard;