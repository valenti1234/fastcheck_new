import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Terms: React.FC = () => {
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMarkdown = async () => {
      try {
        setLoading(true);
        const res = await fetch('/duxiter_terms_md.md');
        if (!res.ok) {
          throw new Error(`Failed to load markdown: ${res.status}`);
        }
        const text = await res.text();
        setMarkdown(text);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Failed to load terms content');
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-700 dark:text-gray-300">Loading terms...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Terms and Conditions</h1>
        <p className="mt-4 text-red-600 dark:text-red-400">{error}</p>
        <p className="mt-2 text-gray-700 dark:text-gray-300">
          You can try opening the PDF directly: <a href="/terms.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">/terms.pdf</a>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Terms and Conditions</h1>
        <p className="mt-2 text-gray-700 dark:text-gray-300">
          Below are the terms rendered from the markdown file.
        </p>
        <div className="mt-6 prose prose-lg dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {markdown}
          </ReactMarkdown>
        </div>
        <div className="mt-6">
          <a
            href="/terms.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-blue-600 dark:text-blue-400 hover:underline"
          >
            View PDF version
          </a>
        </div>
      </div>
    </div>
  );
};

export default Terms;