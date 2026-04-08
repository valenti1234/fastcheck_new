import React, { useState, useCallback } from 'react';
import { getCompanyByRut } from '../services/companyService';
import { SheriffDataLogResponse } from '../types/sheriff';
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import CompanyInfo from '../components/CompanyInfo';
import logger from '../utils/logger';



const CompanyLookup: React.FC = () => {
  const [rut, setRut] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [companyData, setCompanyData] = useState<SheriffDataLogResponse | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Create a debounced version of the API call
  const debouncedFetchCompany = useCallback(
    debounce(async (rut: string) => {
      logger.log('Fetching company data for RUT:', rut);
      setIsLoading(true);
      try {
        const response = await getCompanyByRut(rut);
        logger.log('Company data received:', response);
        setCompanyData(response);
        toast.success('Información de empresa encontrada');
      } catch (error) {
        logger.error('Error fetching company:', error);
        setError(error instanceof Error ? error.message : 'Error desconocido');
        toast.error(error instanceof Error ? error.message : 'Error al buscar la empresa');
      } finally {
        setIsLoading(false);
      }
    }, 500),
    []
  );

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRut = e.target.value;
    setRut(newRut);
    setCompanyData(null);
    setError(undefined);

    // Clean the RUT format (remove dots only)
    const cleanRut = newRut.replace(/\./g, '');
    logger.log('Cleaned RUT:', cleanRut);

    // Only fetch if RUT has the minimum length
    if (cleanRut.length >= 8) {
      debouncedFetchCompany(cleanRut);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Consulta de Empresa</h1>
          <p className="mt-2 text-md text-gray-600">
            Ingrese el RUT de una empresa para obtener su información pública.
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="max-w-xl mx-auto">
            <label htmlFor="rut" className="block text-sm font-medium text-gray-700 mb-1">
              RUT de la Empresa
            </label>
            <div className="relative">
              <input
                type="text"
                id="rut"
                value={rut}
                onChange={handleRutChange}
                placeholder="12.345.678-9"
                className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                {isLoading && (
                  <svg className="animate-spin h-5 w-5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              La búsqueda se iniciará automáticamente al ingresar un RUT válido.
            </p>
          </div>
        </div>

        {/* Results Card */}
        <div className="mt-8">
          <CompanyInfo
            company={companyData}
            loading={isLoading}
            error={error}
          />
        </div>
      </div>
    </div>
  );
};

export default CompanyLookup; 