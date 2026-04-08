# Comparación de Versiones: DuxIter Anterior vs Actual (v1.5.1)

Este documento describe las diferencias entre la versión anterior (ubicada en `_previous/duxiter`) y la versión actual 1.5.1 del proyecto DuxIter.

## Resumen de Cambios

Las mejoras principales en la versión actual incluyen:
1. **Implementación completa del sistema de notificaciones por email de SendGrid** para alertas de cambios de riesgo
2. **Corrección del sistema de reportes de tráfico** para usar datos reales de operaciones de crédito en lugar de logs de operaciones AI

## Nuevos Archivos Agregados

### Servicios
- **`/server/src/services/notificationService.ts`** - Servicio de notificaciones por email de SendGrid
- **`/server/src/services/monitoringService.ts`** - Servicio de monitoreo de riesgo y programación
- **`/server/src/services/rabbitmqService.ts`** - Servicio de cola de mensajes

### Controladores
- **`/server/src/controllers/notification.controller.ts`** - Endpoints de gestión de notificaciones
- **`/server/src/controllers/evaluationController.ts`** - Gestión de evaluaciones (nuevo controlador)

### Rutas
- **`/server/src/routes/notification.routes.ts`** - Rutas API de notificaciones
- **`/server/src/routes/monitoring.ts`** - Rutas API de monitoreo

### Modelos
- **`/server/src/models/MonitoringSchedule.ts`** - Modelo de datos de programación de monitoreo
- **`/server/src/models/RiskChangeNotification.ts`** - Modelo de datos de notificación de cambio de riesgo

### Scripts
- **`/server/src/scripts/test-sendgrid.ts`** - Script de prueba de integración con SendGrid

### Documentación
- **`/server/SENDGRID_SETUP.md`** - Guía completa de configuración de SendGrid
- **`/CHANGELOG.md`** - Registro detallado de cambios de la implementación de SendGrid

## Archivos Modificados

### Configuración de Paquetes
- **`/server/package.json`**
  - Agregada dependencia `@sendgrid/mail: ^8.1.3`
  - Agregados nuevos scripts: `test:sendgrid` y `notifications:test`

### Configuración de Entorno
- **`/server/.env`**
  - Agregadas variables de configuración de SendGrid:
    - `SENDGRID_API_KEY`
    - `SENDGRID_FROM_EMAIL`
    - `SENDGRID_FROM_NAME`

### Integración de Rutas
- **`/server/src/routes/index.ts`**
  - Agregada integración de rutas de notificaciones
  - Montado endpoint `/notifications` con autenticación y filtrado por tenant

### Sistema de Reportes de Tráfico
- **`/server/src/controllers/billingController.ts`**
  - Modificada función `getTrafficReports` para usar colección `CreditOperation` en lugar de `AIOperationLog`
  - Actualizado filtro de fecha para usar campo `createdAt` de `CreditOperation`
  - Corregido tipo de `tenantId` para usar `mongoose.Types.ObjectId`
  - Implementada nueva lógica de agregación para calcular:
    - **Evaluaciones**: Operaciones con `operationType: 'evaluation'`
    - **API Calls**: Operaciones con `operationType: 'rut_lookup'` u `operationType: 'other'`
    - **Créditos Usados**: Suma de valores absolutos de `creditsChanged` para operaciones con valores negativos

## Características Clave Implementadas

### 1. Sistema de Notificaciones por Email
- **Notificaciones Automáticas de Cambio de Riesgo**: Envía emails cuando cambian los niveles de riesgo de las empresas
- **Plantillas de Email HTML Profesionales**: Formato enriquecido con detalles de empresa y comparaciones de riesgo
- **Aislamiento por Tenant**: Las notificaciones se envían solo a usuarios dentro del mismo tenant
- **Soporte de Email Masivo**: Envío eficiente a múltiples destinatarios

### 2. Servicio de Monitoreo
- **Monitoreo Programado de Riesgo**: Monitoreo automatizado de cambios de riesgo de empresas
- **Gestión de Trabajos Cron**: Frecuencias de monitoreo configurables (minuto, diario, semanal, mensual)
- **Detección de Cambios de Riesgo**: Compara niveles de riesgo anteriores y actuales
- **Activación de Notificaciones**: Activa automáticamente notificaciones por email en cambios de riesgo

### 3. API de Gestión de Notificaciones
- **Prueba de Configuración**: `/api/notifications/test` - Probar configuración de SendGrid
- **Notificaciones Pendientes**: `/api/notifications/pending` - Ver notificaciones no procesadas
- **Datos Históricos**: `/api/notifications/history` - Ver historial de notificaciones enviadas
- **Procesamiento Manual**: `/api/notifications/process` - Activar manualmente notificaciones pendientes
- **Estadísticas**: `/api/notifications/stats` - Obtener estadísticas de notificaciones

### 4. Manejo de Errores y Monitoreo
- **Registro Completo de Errores**: Seguimiento detallado de errores para entrega de emails
- **Mecanismos de Reintento**: Las notificaciones fallidas se marcan para reintento
- **Seguimiento de Estado**: Rastrear estado de entrega de notificaciones (pendiente, enviado, fallido)
- **Validación de Configuración**: Verificar configuración de SendGrid antes de enviar

### 5. Características de Seguridad
- **Protección de Clave API**: Manejo seguro de claves API de SendGrid
- **Aislamiento por Tenant**: Los usuarios solo ven notificaciones de su tenant
- **Autenticación Requerida**: Todos los endpoints de notificaciones requieren autenticación válida
- **Acceso Basado en Roles**: Acceso solo para administradores a ciertas características de gestión de notificaciones

### 6. Sistema de Reportes de Tráfico Mejorado
- **Fuente de Datos Corregida**: Cambio de `AIOperationLog` a `CreditOperation` para datos más precisos
- **Cálculos Precisos de Uso**: Métricas basadas en operaciones reales de crédito
- **Filtrado por Período**: Filtrado correcto por mes y año usando `createdAt`
- **Agregación Optimizada**: Pipeline de agregación MongoDB mejorado para mejor rendimiento
- **Compatibilidad de Tipos**: Corrección de tipos de datos para `tenantId` y otros campos
- **Métricas Detalladas**: Separación clara entre evaluaciones, llamadas API y uso de créditos

## Detalles de Implementación Técnica

### Cambios en Esquema de Base de Datos
- **Colección MonitoringSchedule**: Almacena configuraciones de monitoreo por empresa
- **Colección RiskChangeNotification**: Rastrea todas las notificaciones de cambio de riesgo y su estado
- **Colección CreditOperation**: Ahora utilizada como fuente principal para reportes de tráfico (reemplaza AIOperationLog)
  - Campos clave: `tenantId`, `userId`, `operationType`, `creditsChanged`, `balanceAfter`, `createdAt`
  - Tipos de operación: `'evaluation'`, `'rut_lookup'`, `'other'`

### Puntos de Integración
- **MonitoringService ↔ NotificationService**: El monitoreo activa notificaciones
- **NotificationService ↔ SendGrid**: Integración de entrega de email
- **Rutas API ↔ Controladores**: Gestión RESTful de notificaciones
- **Middleware de Autenticación**: Acceso seguro a características de notificaciones
- **BillingController ↔ CreditOperation**: Reportes de tráfico basados en operaciones de crédito reales
- **Frontend ↔ API de Reportes**: Filtrado por período (mes/año) y paginación de resultados

### Sistema de Plantillas de Email
- **Generación de Contenido Dinámico**: Contenido de email específico por empresa
- **Formatos HTML + Texto**: Versiones tanto en HTML enriquecido como texto plano
- **Formato de Nivel de Riesgo**: Indicadores de nivel de riesgo codificados por color
- **Formato de Marca de Tiempo**: Formato de fecha y hora localizado

## Requisitos de Configuración

### Configuración de SendGrid
1. **Cuenta de SendGrid**: Crear cuenta en sendgrid.com
2. **Generación de Clave API**: Crear clave API con permisos de Mail Send
3. **Autenticación de Dominio**: Configurar autenticación de dominio para mejor entregabilidad
4. **Variables de Entorno**: Configurar archivo `.env` con credenciales de SendGrid

### Variables de Entorno Agregadas
```env
# Configuración de SendGrid
SENDGRID_API_KEY=tu_clave_api_sendgrid_aqui
SENDGRID_FROM_EMAIL=noreply@tudominio.com
SENDGRID_FROM_NAME=DuxIter Monitoreo de Riesgo
```

## Pruebas y Validación

### Uso del Script de Prueba
```bash
# Probar configuración de SendGrid
npm run test:sendgrid tu-email@ejemplo.com

# Comando alternativo
npm run notifications:test tu-email@ejemplo.com
```

### Pruebas de API
- Usar endpoint `/api/notifications/test` para verificar configuración
- Monitorear logs para estado de entrega de email
- Verificar historial de notificaciones vía endpoints de API

## Consideraciones de Despliegue

### Configuración de Producción
1. **Cuenta de SendGrid**: Actualizar a plan apropiado de SendGrid
2. **Autenticación de Dominio**: Completar verificación de dominio
3. **Variables de Entorno**: Establecer credenciales de SendGrid de producción
4. **Monitoreo**: Configurar monitoreo para tasas de entrega de email
5. **Límites de Tasa**: Configurar límites de envío apropiados

### Optimizaciones de Rendimiento
- **Procesamiento de Email Masivo**: Envío por lotes eficiente para múltiples destinatarios
- **Procesamiento Asíncrono**: Envío de email no bloqueante
- **Recuperación de Errores**: Reintento automático para notificaciones fallidas
- **Indexación de Base de Datos**: Consultas optimizadas para recuperación de notificaciones

## Notas de Migración

Al actualizar desde la versión anterior:

1. **Instalar Dependencias**: Ejecutar `npm install` para instalar paquete de SendGrid
2. **Configuración de Entorno**: Agregar configuración de SendGrid al archivo `.env`
3. **Migración de Base de Datos**: Las nuevas colecciones se crearán automáticamente
4. **Pruebas**: Ejecutar script de prueba para verificar integración con SendGrid
5. **Configuración de Monitoreo**: Configurar programaciones de monitoreo para empresas existentes
6. **Reportes de Tráfico**: Los reportes ahora usan datos de `CreditOperation` automáticamente
   - No se requiere migración de datos
   - Los reportes mostrarán datos más precisos basados en operaciones reales de crédito
   - Verificar que existan datos en la colección `creditoperations` para el período deseado

## Compatibilidad Hacia Atrás

La versión actual mantiene compatibilidad completa hacia atrás con la versión anterior:
- Todas las APIs existentes continúan funcionando sin cambios
- No hay cambios que rompan la funcionalidad existente
- Las nuevas características son aditivas y opcionales
- Los modelos de datos existentes permanecen intactos

El sistema de notificaciones está diseñado para mejorar las capacidades de monitoreo de riesgo existentes sin interrumpir los flujos de trabajo actuales.