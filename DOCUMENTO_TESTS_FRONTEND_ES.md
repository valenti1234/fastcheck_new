# Documento de Pruebas Frontend - Duxiter

## Información General del Proyecto

**Aplicación:** Duxiter Fast Check  
**Versión:** 1.5.20  
**Tecnologías:** React 18.3.1 + TypeScript + Vite  
**Framework UI:** Material-UI + Tailwind CSS  
**Responsable:** Control de Calidad / Project Manager  
**Fecha:** Enero 2025  

---

## 1. Arquitectura del Frontend

### 1.1 Estructura Principal
```
src/
├── components/          # Componentes reutilizables
├── pages/              # Páginas principales
├── services/           # Servicios API
├── contexts/           # Contextos React (Auth, Tenant, Theme)
├── types/              # Definiciones TypeScript
├── utils/              # Utilidades
└── assets/             # Recursos estáticos
```

### 1.2 Tecnologías Clave
- **React Router DOM:** Navegación entre páginas
- **Axios:** Cliente HTTP para API
- **React Hot Toast:** Notificaciones
- **Chart.js/Recharts:** Gráficos y visualizaciones
- **React Markdown:** Renderizado de contenido markdown
- **HTML2Canvas + jsPDF:** Generación de reportes PDF
- **Lucide React:** Iconografía moderna
- **React Dropzone:** Carga de archivos
- **QRCode:** Generación de códigos QR
- **Date-fns:** Manipulación de fechas
- **Lodash:** Utilidades JavaScript
- **XLSX:** Procesamiento de archivos Excel

---

## 2. Módulos Principales a Testear

### 2.1 Autenticación y Autorización
**Archivos:** `src/pages/auth/`, `src/contexts/AuthContext.tsx`, `src/components/auth/`

#### Casos de Prueba:
- **TC-AUTH-001:** Login con credenciales válidas
- **TC-AUTH-002:** Login con credenciales inválidas
- **TC-AUTH-003:** Registro de nuevo usuario
- **TC-AUTH-004:** Logout y limpieza de sesión
- **TC-AUTH-005:** Protección de rutas según roles
- **TC-AUTH-006:** Redirección automática según rol de usuario

#### Roles a Verificar:
- `superuser`: Acceso completo
- `tenant_admin`: Administración de tenant
- `evaluator`: Solo evaluaciones
- `read_only`: Solo lectura
- `write_only`: Solo escritura

### 2.2 Dashboard Principal
**Archivos:** `src/pages/dashboard/Dashboard.tsx`, `src/components/dashboard/`

#### Casos de Prueba:
- **TC-DASH-001:** Carga correcta de estadísticas generales
- **TC-DASH-002:** Visualización de gráficos de riesgo
- **TC-DASH-003:** Tabla de resultados con paginación
- **TC-DASH-004:** Filtros de tiempo y framework
- **TC-DASH-005:** Resumen de trabajos diarios
- **TC-DASH-006:** Métricas de uso del tenant

### 2.3 Evaluaciones
**Archivos:** `src/pages/evaluations/`, `src/services/evaluationService.ts`

#### 2.3.1 Evaluación Individual
- **TC-EVAL-001:** Validación de RUT chileno
- **TC-EVAL-002:** Búsqueda de empresa por RUT
- **TC-EVAL-003:** Ejecución de evaluación individual
- **TC-EVAL-004:** Visualización de resultados
- **TC-EVAL-005:** Descarga de reporte PDF

#### 2.3.2 Evaluación Masiva
- **TC-BULK-001:** Carga de archivo Excel/CSV
- **TC-BULK-002:** Validación de formato de datos
- **TC-BULK-003:** Progreso de evaluación masiva
- **TC-BULK-004:** Resultados de evaluación masiva
- **TC-BULK-005:** Descarga de resultados consolidados

### 2.4 Administración
**Archivos:** `src/pages/admin/`

#### Casos de Prueba:
- **TC-ADMIN-001:** Gestión de usuarios del tenant
- **TC-ADMIN-002:** Configuración de parámetros de evaluación
- **TC-ADMIN-003:** Configuración de prompts de IA
- **TC-ADMIN-004:** Variables de entorno
- **TC-ADMIN-005:** Logs de Sheriff API
- **TC-ADMIN-006:** Gestión de sanciones ambientales
- **TC-ADMIN-007:** Casos antisindicales
- **TC-ADMIN-008:** Facturación y monitoreo

### 2.5 Fast Check
**Archivos:** `src/pages/FastCheck.tsx`, `src/pages/FastCheckConsolidado.tsx`

#### Casos de Prueba:
- **TC-FAST-001:** Consulta rápida por RUT
- **TC-FAST-002:** Información del cliente
- **TC-FAST-003:** Resumen de evaluación
- **TC-FAST-004:** Tabla de detalles de riesgo
- **TC-FAST-005:** Últimos 10 resultados
- **TC-FAST-006:** Generación de QR code
- **TC-FAST-007:** Exportación a PDF

---

## 3. Servicios API a Testear

### 3.1 Servicios Principales
- **api.ts:** Cliente HTTP principal
- **evaluationService.ts:** Servicios de evaluación
- **companyService.ts:** Servicios de empresa
- **billingService.ts:** Servicios de facturación
- **antiunionCaseService.ts:** Casos antisindicales
- **environmentalSanctionService.ts:** Sanciones ambientales

### 3.2 Casos de Prueba API
- **TC-API-001:** Interceptores de autenticación
- **TC-API-002:** Manejo de errores HTTP
- **TC-API-003:** Timeout de requests
- **TC-API-004:** Retry automático
- **TC-API-005:** Logging en desarrollo

---

## 4. Componentes UI Críticos

### 4.1 Componentes Comunes
- **Card.tsx:** Tarjetas de información
- **PageLoader.tsx:** Indicador de carga
- **ThemeToggle.tsx:** Cambio de tema
- **FilterTabs.tsx:** Pestañas de filtro

### 4.2 Componentes de Layout
- **DashboardLayout.tsx:** Layout principal
- **AdminLayout.tsx:** Layout administrativo
- **PageLayout.tsx:** Layout de página genérico

### 4.3 Casos de Prueba UI
- **TC-UI-001:** Responsividad en diferentes dispositivos
- **TC-UI-002:** Tema claro/oscuro
- **TC-UI-003:** Navegación entre páginas
- **TC-UI-004:** Estados de carga
- **TC-UI-005:** Manejo de errores en UI
- **TC-UI-006:** Tooltips y ayudas contextuales

---

## 5. Validaciones y Utilidades

### 5.1 Validación de RUT
**Archivo:** `src/services/api.ts` (funciones `validateChileanRut`, `formatChileanRut`)

#### Casos de Prueba:
- **TC-RUT-001:** RUT válido con dígito verificador correcto
- **TC-RUT-002:** RUT inválido con dígito verificador incorrecto
- **TC-RUT-003:** Formato con puntos y guión
- **TC-RUT-004:** Formato sin puntos ni guión
- **TC-RUT-005:** RUT con caracteres inválidos
- **TC-RUT-006:** RUT vacío o null

### 5.2 Formateo de Datos
- **TC-FORMAT-001:** Formateo de fechas
- **TC-FORMAT-002:** Formateo de monedas
- **TC-FORMAT-003:** Formateo de números

---

## 6. Contextos y Estado Global

### 6.1 AuthContext
- **TC-CTX-001:** Inicialización del contexto
- **TC-CTX-002:** Persistencia de token
- **TC-CTX-003:** Renovación automática de token
- **TC-CTX-004:** Limpieza al logout

### 6.2 TenantContext
- **TC-CTX-005:** Cambio de tenant activo
- **TC-CTX-006:** Datos de uso del tenant
- **TC-CTX-007:** Permisos por tenant

### 6.3 ThemeContext
- **TC-CTX-008:** Cambio de tema
- **TC-CTX-009:** Persistencia de preferencia

---

## 7. Casos de Prueba de Integración

### 7.1 Flujo Completo de Evaluación
1. Login de usuario
2. Selección de tenant
3. Navegación a evaluaciones
4. Ingreso de RUT
5. Ejecución de evaluación
6. Visualización de resultados
7. Descarga de reporte

### 7.2 Flujo de Administración
1. Login como admin
2. Acceso a panel administrativo
3. Gestión de usuarios
4. Configuración de parámetros
5. Revisión de logs

---

## 8. Pruebas de Performance

### 8.1 Métricas Clave
- **Tiempo de carga inicial:** < 3 segundos
- **Tiempo de navegación:** < 1 segundo
- **Tiempo de evaluación:** < 30 segundos
- **Tamaño de bundle:** < 2MB

### 8.2 Casos de Prueba
- **TC-PERF-001:** Carga inicial de la aplicación
- **TC-PERF-002:** Navegación entre páginas
- **TC-PERF-003:** Carga de tablas con muchos datos
- **TC-PERF-004:** Generación de reportes PDF
- **TC-PERF-005:** Evaluaciones masivas

---

## 9. Pruebas de Seguridad

### 9.1 Casos de Prueba
- **TC-SEC-001:** Protección de rutas sin autenticación
- **TC-SEC-002:** Validación de permisos por rol
- **TC-SEC-003:** Sanitización de inputs
- **TC-SEC-004:** Protección contra XSS
- **TC-SEC-005:** Manejo seguro de tokens
- **TC-SEC-006:** Timeout de sesión

---

## 10. Pruebas de Compatibilidad

### 10.1 Navegadores
- Chrome (últimas 2 versiones)
- Firefox (últimas 2 versiones)
- Safari (últimas 2 versiones)
- Edge (últimas 2 versiones)

### 10.2 Dispositivos
- Desktop (1920x1080, 1366x768)
- Tablet (768x1024)
- Mobile (375x667, 414x896)

---

## 11. Herramientas de Testing Recomendadas

### 11.1 Testing Unitario
- **Jest:** Framework de testing (ya configurado con jsdom)
- **React Testing Library:** Testing de componentes (v16.3.0)
- **@testing-library/jest-dom:** Matchers adicionales para Jest
- **@testing-library/user-event:** Simulación de eventos de usuario
- **MSW:** Mock Service Worker para APIs (recomendado)
- **identity-obj-proxy:** Mock para archivos CSS
- **jest-transform-stub:** Mock para archivos estáticos

### 11.2 Testing E2E
- **Cypress:** Testing end-to-end
- **Playwright:** Alternativa moderna a Cypress

### 11.3 Testing Visual
- **Storybook:** Documentación de componentes
- **Chromatic:** Testing visual automático

### 11.4 Configuración de Jest

#### Configuración Frontend (`jest.config.js`)
```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts'
  ]
}
```

#### Comandos de Testing Disponibles
```bash
# Frontend
npm test                    # Ejecutar tests una vez
npm run test:watch         # Ejecutar tests en modo watch
npm run test:coverage      # Ejecutar tests con reporte de cobertura
npm run test:ci           # Ejecutar tests para CI/CD

# Backend
cd server && npm test      # Tests del backend

# Ambos
npm run test:all          # Ejecutar todos los tests
npm run test:all:coverage # Todos los tests con cobertura
npm run test:all:ci       # Todos los tests para CI/CD
```

#### Mocks Configurados en setupTests.ts
- **localStorage/sessionStorage:** Simulación de almacenamiento del navegador
- **window.matchMedia:** Para responsive design
- **IntersectionObserver/ResizeObserver:** Para componentes que usan observadores
- **react-router-dom:** Navegación simulada
- **react-hot-toast:** Notificaciones simuladas
- **Chart.js:** Gráficos simulados
- **html2canvas/jsPDF:** Generación de PDFs simulada
- **fetch:** Requests HTTP simulados

---

## 12. Casos de Prueba Específicos por Componente

### 12.1 Componentes de Autenticación

#### ProtectedRoute.test.tsx
- **TC-COMP-001:** Redirección cuando no está autenticado
- **TC-COMP-002:** Renderizado cuando está autenticado
- **TC-COMP-003:** Verificación de roles específicos
- **TC-COMP-004:** Manejo de estados de carga

#### ThemeContext.test.tsx
- **TC-COMP-005:** Inicialización del tema por defecto
- **TC-COMP-006:** Cambio de tema claro/oscuro
- **TC-COMP-007:** Persistencia en localStorage
- **TC-COMP-008:** Error cuando se usa fuera del provider

### 12.2 Servicios y APIs

#### Casos de Prueba para Servicios
- **TC-SERVICE-001:** Interceptores de autenticación
- **TC-SERVICE-002:** Manejo de errores HTTP (401, 403, 500)
- **TC-SERVICE-003:** Retry automático en fallos de red
- **TC-SERVICE-004:** Timeout de requests
- **TC-SERVICE-005:** Transformación de datos de respuesta

---

## 13. Checklist de Testing

### 13.1 Pre-Testing
- [ ] Entorno de testing configurado
- [ ] Datos de prueba preparados
- [ ] Credenciales de testing disponibles
- [ ] Base de datos de testing limpia

### 13.2 Durante Testing
- [ ] Documentar bugs encontrados
- [ ] Capturar screenshots de errores
- [ ] Verificar logs del navegador
- [ ] Probar en diferentes navegadores

### 13.3 Post-Testing
- [ ] Reporte de testing completado
- [ ] Bugs reportados en sistema de tracking
- [ ] Casos de prueba actualizados
- [ ] Documentación actualizada

---

## 14. Criterios de Aceptación

### 14.1 Funcionalidad
- ✅ Todos los casos de prueba críticos pasan
- ✅ No hay errores JavaScript en consola
- ✅ Todas las APIs responden correctamente
- ✅ Validaciones funcionan como esperado

### 14.2 Performance
- ✅ Tiempos de carga dentro de límites
- ✅ No hay memory leaks
- ✅ Aplicación responsive en todos los dispositivos

### 14.3 Seguridad
- ✅ Autenticación y autorización funcionan
- ✅ No hay vulnerabilidades conocidas
- ✅ Datos sensibles protegidos

---

## 15. Funcionalidades Nuevas a Testear

### 15.1 Sistema de Activación de Tenants
**Archivos:** `src/pages/admin/UserManagement.tsx`, `server/src/models/tenant.model.ts`

#### Casos de Prueba:
- **TC-TENANT-001:** Activación manual de tenants por superadmin
- **TC-TENANT-002:** Desactivación de tenants existentes
- **TC-TENANT-003:** Validación de estado activo en login
- **TC-TENANT-004:** Mensaje de activación pendiente en UI
- **TC-TENANT-005:** Botones de activar/desactivar en gestión de usuarios

### 15.2 Página de Monitoreo
**Archivos:** `src/pages/MonitoringPage.tsx`

#### Casos de Prueba:
- **TC-MONITOR-001:** Visualización de logs de Sheriff API
- **TC-MONITOR-002:** Filtros de búsqueda en logs
- **TC-MONITOR-003:** Paginación de resultados
- **TC-MONITOR-004:** Estados de monitoreo (activo, pausado, error)
- **TC-MONITOR-005:** Acciones de control (play, pause, delete)

### 15.3 Configuración de Evaluaciones
**Archivos:** `src/pages/admin/EvaluationSettingsPage.tsx`

#### Casos de Prueba:
- **TC-EVAL-CONFIG-001:** Configuración de parámetros de evaluación
- **TC-EVAL-CONFIG-002:** Selector de claves de Sheriff Log
- **TC-EVAL-CONFIG-003:** Tarjetas de criterios de prueba
- **TC-EVAL-CONFIG-004:** Validación de configuraciones
- **TC-EVAL-CONFIG-005:** Guardado y persistencia de cambios

### 15.4 Fast Check Consolidado
**Archivos:** `src/pages/FastCheckConsolidado.tsx`

#### Casos de Prueba:
- **TC-FASTCON-001:** Información consolidada del cliente
- **TC-FASTCON-002:** Resumen de evaluación mejorado
- **TC-FASTCON-003:** Tabla de detalles de riesgo actualizada
- **TC-FASTCON-004:** Últimos 10 resultados con mejor formato
- **TC-FASTCON-005:** Exportación mejorada a PDF

---

## 16. Mejores Prácticas de Testing

### 16.1 Estructura de Tests

#### Organización de Archivos
```
src/
├── components/
│   ├── auth/
│   │   ├── ProtectedRoute.tsx
│   │   └── __tests__/
│   │       └── ProtectedRoute.test.tsx
│   └── common/
│       ├── PageLoader.tsx
│       └── __tests__/
│           └── PageLoader.test.tsx
├── contexts/
│   ├── AuthContext.tsx
│   └── __tests__/
│       └── AuthContext.test.tsx
└── services/
    ├── api.ts
    └── __tests__/
        └── api.test.ts
```

#### Convenciones de Nomenclatura
- **Archivos de test:** `ComponentName.test.tsx` o `serviceName.test.ts`
- **Casos de prueba:** `should [expected behavior] when [condition]`
- **Test IDs:** `data-testid="component-element-action"`
- **Mocks:** `mock[ServiceName]` o `mock[FunctionName]`

### 16.2 Patrones de Testing

#### Testing de Componentes React
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import ComponentToTest from '../ComponentToTest';

// Helper para renderizar con providers
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('ComponentToTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly with default props', () => {
    renderWithProviders(<ComponentToTest />);
    expect(screen.getByTestId('component-container')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentToTest />);
    
    const button = screen.getByRole('button', { name: /submit/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('Success message')).toBeInTheDocument();
    });
  });
});
```

#### Testing de Servicios API
```typescript
import { apiClient } from '../api';
import { evaluationService } from '../evaluationService';

// Mock del cliente API
jest.mock('../api');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('EvaluationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch evaluation results successfully', async () => {
    const mockData = { id: '123', status: 'completed' };
    mockApiClient.get.mockResolvedValue({ data: mockData });

    const result = await evaluationService.getEvaluation('123');

    expect(mockApiClient.get).toHaveBeenCalledWith('/evaluations/123');
    expect(result).toEqual(mockData);
  });

  it('should handle API errors gracefully', async () => {
    mockApiClient.get.mockRejectedValue(new Error('Network error'));

    await expect(evaluationService.getEvaluation('123'))
      .rejects.toThrow('Network error');
  });
});
```

### 16.3 Testing de Contextos
```typescript
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  it('should provide authentication state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('should handle login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });
    
    expect(result.current.isAuthenticated).toBe(true);
  });
});
```

### 16.4 Métricas de Calidad

#### Cobertura de Código
- **Mínimo aceptable:** 80% de cobertura general
- **Componentes críticos:** 95% de cobertura
- **Servicios API:** 90% de cobertura
- **Utilidades:** 85% de cobertura

#### Comandos para Verificar Cobertura
```bash
# Generar reporte de cobertura
npm run test:coverage

# Ver reporte en navegador
open coverage/lcov-report/index.html

# Verificar umbrales de cobertura
npm run test:ci
```

### 16.5 Debugging de Tests

#### Técnicas Útiles
```typescript
// Debug de elementos renderizados
screen.debug(); // Muestra todo el DOM
screen.debug(screen.getByTestId('specific-element')); // Elemento específico

// Queries útiles para debugging
screen.logTestingPlaygroundURL(); // URL para Testing Playground
console.log(screen.getAllByRole('button')); // Todos los botones

// Esperar elementos asincrónicos
await screen.findByText('Loading...'); // Espera hasta que aparezca
await waitForElementToBeRemoved(() => screen.queryByText('Loading...')); // Espera hasta que desaparezca
```

---

## 17. Contactos y Recursos

### 17.1 Equipo de Desarrollo
- **Frontend Lead:** [Nombre]
- **Backend Lead:** [Nombre]
- **QA Lead:** [Nombre]

### 17.2 Recursos
- **Repositorio:** `/root/duxiter`
- **Documentación API:** Swagger en `/api/docs`
- **Entorno de Testing:** [URL]
- **Entorno de Staging:** [URL]

### 17.3 Documentación Adicional
- **Confluence:** [URL del espacio de documentación]
- **Jira:** [URL del proyecto]
- **GitHub:** [URL del repositorio]
- **Slack:** #duxiter-frontend

---

## 18. Anexos

### 18.1 Ejemplos Específicos del Proyecto

#### Test de Fast Check Consolidado
```typescript
// src/pages/__tests__/FastCheckConsolidado.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import FastCheckConsolidado from '../FastCheckConsolidado';
import { AuthProvider } from '../../contexts/AuthContext';
import { TenantProvider } from '../../contexts/TenantContext';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          {component}
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('FastCheckConsolidado', () => {
  it('should render fast check components', async () => {
    renderWithProviders(<FastCheckConsolidado />);
    
    await waitFor(() => {
      expect(screen.getByTestId('fast-check-container')).toBeInTheDocument();
    });
  });

  it('should handle evaluation submission', async () => {
    // Test implementation
  });
});
```

#### Test de Validación RUT
```typescript
// src/utils/__tests__/rutValidation.test.ts
import { validateRUT, formatRUT } from '../rutValidation';

describe('RUT Validation', () => {
  it('should validate correct RUT', () => {
    expect(validateRUT('12345678-5')).toBe(true);
    expect(validateRUT('12.345.678-5')).toBe(true);
  });

  it('should reject invalid RUT', () => {
    expect(validateRUT('12345678-0')).toBe(false);
    expect(validateRUT('invalid')).toBe(false);
  });

  it('should format RUT correctly', () => {
    expect(formatRUT('123456785')).toBe('12.345.678-5');
  });
});
```

### 18.2 Configuración de CI/CD para Tests

#### GitHub Actions Workflow
```yaml
# .github/workflows/frontend-tests.yml
name: Frontend Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm run test:ci
    
    - name: Generate coverage report
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
```

### 18.3 Scripts de Testing Personalizados

#### Package.json Scripts
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:frontend": "jest --testPathPattern=src",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand"
  }
}
```

### 18.4 Troubleshooting Común

#### Problemas Frecuentes y Soluciones

1. **Error: "Cannot find module 'react-router-dom'"**
   - Solución: Verificar que el mock esté configurado en `setupTests.ts`

2. **Tests fallan por timeouts**
   - Solución: Aumentar timeout en Jest config o usar `waitFor` con timeout personalizado

3. **Problemas con Chart.js en tests**
   - Solución: Mock completo configurado en `setupTests.ts`

4. **Error de Canvas en tests**
   - Solución: Mock de `html2canvas` y `jsPDF` ya configurado

---

**Nota:** Este documento debe actualizarse regularmente conforme evoluciona la aplicación. Se recomienda revisar y actualizar los casos de prueba después de cada release mayor.