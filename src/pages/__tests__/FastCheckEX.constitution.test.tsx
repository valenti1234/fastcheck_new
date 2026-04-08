import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FastCheckEX from '../FastCheckEX';

jest.mock('../../services/api.ts', () => {
  const original = jest.requireActual('../../services/api.ts');
  return {
    ...original,
    apiClient: {
      get: jest.fn((url: string) => {
        if (url.startsWith('/rut/results/rut/')) {
          return Promise.resolve({
            data: {
              details: {
                rut: '12345678-9',
                razonSocial: 'Empresa Y',
                dequienesLegalEvents: { constitution_date: '2012-03-15' }
              },
              companyGeneralInfo: {
                fechaDeConstitucion: '',
                inicioActividades: '2015-01-01',
                tamanoEmpresa: '',
                rangoVentas: '',
                socios: [],
                administradores: []
              },
              riskAssessment: {
                riskSummary: {
                  semaphore: 'green',
                  riskLevelDescription: 'Bajo Riesgo',
                  totalSevero: 0,
                  totalSignificativo: 0,
                  totalDetected: 0,
                  totalParameters: 0
                },
                allRules: {
                  complianceRules: [],
                  legalRules: [],
                  capitalHumanoRules: [],
                  financieroTributarioRules: []
                }
              },
              createdAt: new Date().toISOString(),
            }
          });
        }
        if (url === '/rut/results/latest') {
          return Promise.resolve({ data: { rut: '12345678-9' } });
        }
        return Promise.resolve({ data: {} });
      })
    }
  };
});

describe('FastCheckEX - Fecha Constitución display', () => {
  it('shows constitution date from Dequienes legal events when backend general info is empty', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/fastcheck', search: '?rut=12345678-9' }] }>
        <Routes>
          <Route path="/fastcheck" element={<FastCheckEX />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Información General')).toBeInTheDocument());
    expect(screen.getByText('Fecha Constitución:')).toBeInTheDocument();
    expect(screen.getByText('15-03-2012')).toBeInTheDocument();
  });
});

