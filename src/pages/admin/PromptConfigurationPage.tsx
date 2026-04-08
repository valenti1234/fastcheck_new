import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';



const API_BASE_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

interface PromptConfiguration {
  _id: string;
  name: string;
  description: string;
  promptTemplate: string;
  category: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters';
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptFormData {
  name: string;
  description: string;
  promptTemplate: string;
  category: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters';
  isActive: boolean;
}

const CATEGORIES = [
  { value: 'seekData', labelKey: 'promptConfiguration.categories.seekData' },
  { value: 'analyzeSheriffData', labelKey: 'promptConfiguration.categories.analyzeSheriffData' },
  { value: 'analyzeEvaluationParameters', labelKey: 'promptConfiguration.categories.analyzeEvaluationParameters' }
] as const;

const PromptConfigurationPage: React.FC = () => {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<PromptConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptConfiguration | null>(null);
  const [formData, setFormData] = useState<PromptFormData>({
    name: '',
    description: '',
    promptTemplate: '',
    category: 'seekData',
    isActive: false
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/prompt-configurations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPrompts(data.data || []);
      } else {
        toast.error(t('promptConfiguration.toast.loadError'));
      }
    } catch (error) {
      logger.error('Error fetching prompts:', error);
      toast.error(t('promptConfiguration.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const url = editingPrompt 
        ? `${API_BASE_URL}/prompt-configurations/${editingPrompt._id}`
        : `${API_BASE_URL}/prompt-configurations`;
      
      const method = editingPrompt ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(editingPrompt ? t('promptConfiguration.toast.updateSuccess') : t('promptConfiguration.toast.createSuccess'));
        fetchPrompts();
        resetForm();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('promptConfiguration.toast.saveError'));
      }
    } catch (error) {
      logger.error('Error saving prompt:', error);
      toast.error(t('promptConfiguration.toast.saveError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('promptConfiguration.confirm.delete'))){
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/prompt-configurations/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast.success(t('promptConfiguration.toast.deleteSuccess'));
        fetchPrompts();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('promptConfiguration.toast.deleteError'));
      }
    } catch (error) {
      logger.error('Error deleting prompt:', error);
      toast.error(t('promptConfiguration.toast.deleteError'));
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/prompt-configurations/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast.success(t('promptConfiguration.toast.toggleSuccess'));
        fetchPrompts();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('promptConfiguration.toast.toggleError'));
      }
    } catch (error) {
      logger.error('Error toggling prompt:', error);
      toast.error(t('promptConfiguration.toast.toggleError'));
    }
  };

  const handleEdit = (prompt: PromptConfiguration) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      description: prompt.description,
      promptTemplate: prompt.promptTemplate,
      category: prompt.category,
      isActive: prompt.isActive
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      promptTemplate: '',
      category: 'seekData',
      isActive: false
    });
    setEditingPrompt(null);
    setShowForm(false);
  };

  const getCategoryLabel = (category: string) => {
    const key = CATEGORIES.find(cat => cat.value === category)?.labelKey;
    return key ? t(key) : category;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('promptConfiguration.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('promptConfiguration.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {t('promptConfiguration.actions.newPrompt')}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              {editingPrompt ? t('promptConfiguration.form.editTitle') : t('promptConfiguration.form.newTitle')}
            </h2>
            <button
              onClick={resetForm}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('promptConfiguration.form.name')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('promptConfiguration.form.category')}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {CATEGORIES.map(category => (
                    <option key={category.value} value={category.value}>
                      {t(category.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('promptConfiguration.form.description')}
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('promptConfiguration.form.template')}
              </label>
              <textarea
                value={formData.promptTemplate}
                onChange={(e) => setFormData({ ...formData, promptTemplate: e.target.value })}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('promptConfiguration.form.templatePlaceholder')}
                required
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                {t('promptConfiguration.form.activate')}
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {editingPrompt ? t('promptConfiguration.actions.update') : t('promptConfiguration.actions.create')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
              >
                {t('promptConfiguration.actions.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de prompts */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.category')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.description')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.lastUpdate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('promptConfiguration.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {prompts.map((prompt) => (
                <tr key={prompt._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{prompt.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {getCategoryLabel(prompt.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">{prompt.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      prompt.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {prompt.isActive ? t('promptConfiguration.status.active') : t('promptConfiguration.status.inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(prompt.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(prompt)}
                        className="text-blue-600 hover:text-blue-900"
                        title={t('promptConfiguration.actions.edit')}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(prompt._id)}
                        className={`${prompt.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        title={prompt.isActive ? t('promptConfiguration.actions.deactivate') : t('promptConfiguration.actions.activate')}
                      >
                        {prompt.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(prompt._id)}
                        className="text-red-600 hover:text-red-900"
                        title={t('promptConfiguration.actions.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {prompts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('promptConfiguration.empty.noPrompts')}</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {t('promptConfiguration.actions.createFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptConfigurationPage;
