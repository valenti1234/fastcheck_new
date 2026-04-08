import React, { useState, FormEvent } from 'react';
import { changeUserPassword } from '../../services/api';
import logger from '../../utils/logger';

import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';


const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogSeverity, setDialogSeverity] = useState<'success' | 'error'>('success');


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setDialogMessage('Las contraseñas nuevas no coinciden.');
      setDialogSeverity('error');
      setDialogOpen(true);
      return;
    }
    if (newPassword.length < 6) {
      setDialogMessage('La nueva contraseña debe tener al menos 6 caracteres.');
      setDialogSeverity('error');
      setDialogOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      await changeUserPassword({ currentPassword, newPassword });
      setDialogMessage('¡Contraseña cambiada exitosamente!');
      setDialogSeverity('success');
      setDialogOpen(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      logger.error('Error changing password:', error);
      
      // Detectar si es un error de contraseña incorrecta
      const errorMessage = error.response?.data?.message || error.message || 'Error al cambiar la contraseña.';
      
      if (error.response?.status === 401 || errorMessage.toLowerCase().includes('incorrect') || errorMessage.toLowerCase().includes('incorrecta') || errorMessage.toLowerCase().includes('wrong')) {
        setDialogMessage('La contraseña actual es incorrecta.');
      } else {
        setDialogMessage(errorMessage);
      }
      
      setDialogSeverity('error');
      setDialogOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  return (
    <div className="mt-10 sm:mt-0">
      <div className="md:grid md:grid-cols-3 md:gap-6">
        <div className="md:col-span-1">
          <div className="px-4 sm:px-0">
            <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Change Password</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Update your password. Ensure it's strong and unique.
            </p>
          </div>
        </div>
        <div className="mt-5 md:mt-0 md:col-span-2">
          <form onSubmit={handleSubmit}>
            <div className="shadow overflow-hidden sm:rounded-md bg-gray-100 dark:bg-gray-800">
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Current Password
                    </label>
                    <input
                      type="password"
                      name="current-password"
                      id="current-password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      name="new-password"
                      id="new-password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      name="confirm-new-password"
                      id="confirm-new-password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 bg-gray-100 dark:bg-gray-800 text-right sm:px-6">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save New Password'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <Dialog open={dialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>Cambio de contraseña</DialogTitle>
        <DialogContent>
          <Alert severity={dialogSeverity} sx={{ mt: 2 }}>
            {dialogMessage}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="info" variant="contained">
            Aceptar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};


const TenantSettings = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Tenant Settings</h1>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <p className="text-gray-600 dark:text-gray-400">Configure your organization's settings here.</p>
        {/* Settings configuration will be implemented here */}
      </div>
      <ChangePasswordForm />
    </div>
  );
};

export default TenantSettings;