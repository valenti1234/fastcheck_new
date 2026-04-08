import React, { useState, useEffect } from 'react';
import { X, Plus, Coins } from 'lucide-react';
import billingService from '../../services/billingService';
import { apiClient } from '../../services/api';

interface Tenant {
  _id: string;
  name: string;
  isActive: boolean;
}

interface AddCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId?: string;
  tenantName?: string;
}

const AddCreditsModal: React.FC<AddCreditsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
  tenantName
}) => {
  const [formData, setFormData] = useState({
    tenantId: tenantId || '',
    credits: '',
    reason: '',
    description: ''
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tenants when modal opens
  useEffect(() => {
    if (isOpen && !tenantId) {
      fetchTenants();
    }
  }, [isOpen, tenantId]);

  const fetchTenants = async () => {
    try {
      setLoadingTenants(true);
      const response = await apiClient.get('/tenant/all');
      setTenants(response.data.filter((tenant: Tenant) => tenant.isActive));
    } catch (err) {
      logger.error('Error fetching tenants:', err);
      setError('Error al cargar la lista de tenants');
    } finally {
      setLoadingTenants(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tenantId || !formData.credits || !formData.reason) {
      setError('Por favor complete todos los campos requeridos');
      return;
    }

    const credits = parseInt(formData.credits);
    if (isNaN(credits) || credits <= 0) {
      setError('El número de créditos debe ser un número positivo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const description = `${formData.reason}${formData.description ? ': ' + formData.description : ''}`;
      await billingService.addCredits(formData.tenantId, credits, description);

      // Reset form
      setFormData({
        tenantId: tenantId || '',
        credits: '',
        reason: '',
        description: ''
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      logger.error('Error adding credits:', err);
      setError(err.response?.data?.message || 'Error al agregar créditos');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        tenantId: tenantId || '',
        credits: '',
        reason: '',
        description: ''
      });
      setError(null);
      setTenants([]);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Coins className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">
              Agregar Créditos
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Tenant Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tenant *
              </label>
              {tenantId ? (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100">
                  <p className="text-gray-700">{tenantName || tenantId}</p>
                  <p className="text-sm text-gray-500">ID: {tenantId}</p>
                </div>
              ) : (
                <select
                  value={formData.tenantId}
                  onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                  disabled={loading || loadingTenants}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                  required
                >
                  <option value="">
                    {loadingTenants ? 'Cargando tenants...' : 'Seleccione un tenant'}
                  </option>
                  {tenants.map((tenant) => (
                    <option key={tenant._id} value={tenant._id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Credits */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad de Créditos *
              </label>
              <input
                type="number"
                value={formData.credits}
                onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                placeholder="Ej: 1000"
                min="1"
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                required
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo *
              </label>
              <select
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                required
              >
                <option value="">Seleccione un motivo</option>
                <option value="credit_purchase">Compra de Créditos</option>
                <option value="credit_bonus">Bonificación</option>
                <option value="credit_refund">Reembolso</option>
                <option value="admin_adjustment">Ajuste Administrativo</option>
                <option value="promotional">Promocional</option>
                <option value="other">Otro</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción (Opcional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción adicional del motivo..."
                rows={3}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Agregando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Créditos
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCreditsModal;