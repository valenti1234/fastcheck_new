import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import logger from '../../utils/logger';

interface LpmedioEntry {
  _id: string;
  rut: string;
  nombre: string;
  tipoPersona: 'Empresa' | 'Persona';
  tipoLista: string;
  nombreSubLista: string;
  fechaIncorporacion: string;
}

interface LpmedioModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry?: LpmedioEntry;
  onSuccess: () => void;
}

const API_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

const LpmedioModal: React.FC<LpmedioModalProps> = ({ isOpen, onClose, entry, onSuccess }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    rut: '',
    nombre: '',
    tipoPersona: 'Empresa' as 'Empresa' | 'Persona',
    tipoLista: 'Mediano Impacto',
    nombreSubLista: '',
    fechaIncorporacion: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (entry) {
      setFormData({
        rut: entry.rut,
        nombre: entry.nombre,
        tipoPersona: entry.tipoPersona,
        tipoLista: entry.tipoLista,
        nombreSubLista: entry.nombreSubLista,
        fechaIncorporacion: new Date(entry.fechaIncorporacion).toISOString().split('T')[0]
      });
    } else {
      setFormData({
        rut: '',
        nombre: '',
        tipoPersona: 'Empresa',
        tipoLista: 'Mediano Impacto',
        nombreSubLista: '',
        fechaIncorporacion: new Date().toISOString().split('T')[0]
      });
    }
  }, [entry]);

  // Sanitize RUT: remove dots, keep dash
  const sanitizeRut = (rut: string): string => {
    return rut.replace(/\./g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const url = entry 
        ? `${API_URL}/lpmedio/${entry._id}`
        : `${API_URL}/lpmedio`;
      
      // Create a copy of formData with sanitized RUT
      const sanitizedFormData = {
        ...formData,
        rut: sanitizeRut(formData.rut)
      };
      
      const response = await fetch(url, {
        method: entry ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sanitizedFormData)
      });

      if (!response.ok) {
        throw new Error(entry ? t('lpmedioModal.errors.updateError') : t('lpmedioModal.errors.createError'));
      }

      toast.success(entry ? t('lpmedioModal.messages.updateSuccess') : t('lpmedioModal.messages.createSuccess'));
      onSuccess();
      onClose();
    } catch (error) {
      logger.error('Error:', error);
      toast.error(entry ? t('lpmedioModal.errors.updateError') : t('lpmedioModal.errors.createError'));
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-md rounded-lg bg-white dark:bg-gray-800 w-full">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
              {entry ? t('lpmedioModal.title.edit') : t('lpmedioModal.title.add')}
            </Dialog.Title>
            <button
              type="button"
              className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-white"
              onClick={onClose}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="rut" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.rut')}
                </label>
                <input
                  type="text"
                  id="rut"
                  value={formData.rut}
                  onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.nombre')}
                </label>
                <input
                  type="text"
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="tipoPersona" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.tipoPersona')}
                </label>
                <select
                  id="tipoPersona"
                  value={formData.tipoPersona}
                  onChange={(e) => setFormData({ ...formData, tipoPersona: e.target.value as 'Empresa' | 'Persona' })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  <option value="Empresa">{t('lpmedioModal.options.empresa')}</option>
                  <option value="Persona">{t('lpmedioModal.options.persona')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="tipoLista" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.tipoLista')}
                </label>
                <input
                  type="text"
                  id="tipoLista"
                  value={formData.tipoLista}
                  onChange={(e) => setFormData({ ...formData, tipoLista: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="nombreSubLista" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.nombreSubLista')}
                </label>
                <input
                  type="text"
                  id="nombreSubLista"
                  value={formData.nombreSubLista}
                  onChange={(e) => setFormData({ ...formData, nombreSubLista: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="fechaIncorporacion" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('lpmedioModal.fields.fechaIncorporacion')}
                </label>
                <input
                  type="date"
                  id="fechaIncorporacion"
                  value={formData.fechaIncorporacion}
                  onChange={(e) => setFormData({ ...formData, fechaIncorporacion: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                {entry ? t('lpmedioModal.buttons.update') : t('lpmedioModal.buttons.create')}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default LpmedioModal;
