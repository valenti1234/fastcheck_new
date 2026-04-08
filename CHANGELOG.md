# Changelog

## [1.5.36] - Monitoring Modal RUT Search Alignment (2025-10-22)

### Added
- Unifica la fuente de datos del modal “Crear Nuevo Monitoreo” combinando `sheriff-logs` y `Consultas` (`getResults`).
- Muestra razón social junto al `rut` en el dropdown del modal y la fecha de la última consulta.
- Añade cabecera fija en el dropdown con contadores: “Total cargados” y “Filtrados”.

### Changed
- `MonitoringPage.tsx`: `fetchExistingRuts()` ahora pagina todos los `sheriff-logs` (límite 100 por página) y agrega las `Consultas`; se deduplica por `rut`.
- Búsqueda del dropdown ampliada: filtra por `rut`, razón social (derivada de `siiData`/`summaryData`) y texto en `duxiterMD`.
- Import actualizado: `import { getSheriffDataLogs, getResults } from '../services/api'`.

### Technical Notes
- Conversión de elementos de `Consultas` a una estructura compatible (tipo `SheriffDataLogResponse`-lite) usando `details.rut`, `details.razonSocial`, `createdAt`, y `duxiterMD`.
- Helper `extractCompanyName()` prioriza `summaryData.data.sii.razonSocial`, `summaryData.data.compliance.name` o `siiData.razonSocial`.
- Deduplicación por `rut` mediante `Map` para evitar entradas repetidas.
- Endpoints utilizados: `/rut/sheriff-logs` (paginado) y `/rut/results`.
- Sin cambios en backend; todo el ajuste es en el frontend.

### Verification
- Ejecutado `npm run dev` (Vite) y verificado en `http://localhost:4032/`:
  - Navegar a “Monitoreo” → “Crear Nuevo Monitoreo”.
  - Buscar por RUT o Razón Social; los resultados coinciden con la lista de “Consultas”.
  - Verificar los contadores en la cabecera del dropdown.

### Impact
- Mejora la experiencia de creación de monitoreos al reflejar exactamente las consultas realizadas previamente.
- Reduce casos donde el usuario “no encuentra” RUTs visibles en “Consultas”.

## [1.5.1] - Automated Versioning and Git Push Scripts

### Added

#### Development Tools
- **Automated Versioning Script** (`git-push-version.sh`)
  - Automatic version increment (patch/minor/major) following semantic versioning
  - Updates both main and server package.json files simultaneously
  - Creates git commits with version-specific messages
  - Automatic git tag creation in format `vX.Y.Z`
  - Complete git push including tags to origin
  - Safety checks for git status and uncommitted changes
  - Colorized output with informative progress messages
  - Error handling with `set -e` for robust execution

- **Quick Push Script** (`quick-push.sh`)
  - Simplified workflow for rapid development cycles
  - Automatic patch version increment
  - Adds all modified files to git staging
  - Single command for commit, version bump, and push
  - Integrates with main versioning script

#### Documentation
- **Versioning Scripts Guide** (`VERSIONING_SCRIPTS.md`)
  - Comprehensive usage instructions and examples
  - Semantic versioning explanation (MAJOR.MINOR.PATCH)
  - Safety features and error handling documentation
  - Troubleshooting guide for common issues
  - Best practices for version management

### Features

#### Automated Version Management
- **Semantic Versioning Support**: Full compliance with semver.org standards
- **Dual Package.json Updates**: Synchronizes versions between frontend and backend
- **Git Integration**: Automatic commit creation with descriptive messages
- **Tag Management**: Creates and pushes version tags for release tracking
- **Safety Checks**: Validates git repository state before proceeding

#### Developer Experience
- **Simple Commands**: Easy-to-remember script names and parameters
- **Flexible Usage**: Support for patch, minor, and major version increments
- **Visual Feedback**: Color-coded output for different message types
- **Error Prevention**: Prevents accidental overwrites and invalid operations

#### Usage Examples
```bash
# Patch increment (1.5.0 → 1.5.1)
./git-push-version.sh patch "Fix minor bug"

# Minor increment (1.5.0 → 1.6.0)
./git-push-version.sh minor "Add new feature"

# Major increment (1.5.0 → 2.0.0)
./git-push-version.sh major "Breaking changes"

# Quick patch increment
./quick-push.sh "Quick fix"
```

### Technical Details

#### Script Architecture
- **Bash-based**: Compatible with Unix/Linux environments
- **Modular Design**: Separate scripts for different use cases
- **Error Handling**: Comprehensive error checking and user feedback
- **Version Parsing**: Intelligent version number manipulation
- **Git Operations**: Safe git operations with status validation

#### Security Features
- **Repository Validation**: Ensures execution within git repository
- **Change Detection**: Warns about uncommitted changes
- **User Confirmation**: Interactive prompts for safety
- **Atomic Operations**: All-or-nothing approach to prevent partial updates

### Benefits

#### Development Workflow
- **Streamlined Releases**: Single command for complete release process
- **Consistent Versioning**: Eliminates manual version management errors
- **Time Savings**: Reduces repetitive git and versioning tasks
- **Standardization**: Enforces consistent commit and tag formats

#### Project Management
- **Release Tracking**: Clear version history with git tags
- **Change Documentation**: Structured commit messages
- **Deployment Ready**: Automated preparation for CI/CD pipelines
- **Team Collaboration**: Standardized versioning across team members

---

## [1.5.0] - SendGrid Email Notifications Implementation

### Added

#### New Services
- **NotificationService** (`/server/src/services/notificationService.ts`)
  - SendGrid-based email notification service
  - Risk change notification templates with professional HTML formatting
  - Bulk notification support for multiple recipients
  - Tenant-specific email retrieval
  - Configuration testing capabilities
  - Error handling and logging

#### New Controllers
- **NotificationController** (`/server/src/controllers/notification.controller.ts`)
  - API endpoints for notification management
  - SendGrid configuration testing
  - Notification history and statistics
  - Pending notification processing

#### New Routes
- **Notification Routes** (`/server/src/routes/notification.routes.ts`)
  - `GET /notifications/test` - Test SendGrid configuration
  - `GET /notifications/pending` - Retrieve pending notifications
  - `GET /notifications/history` - Get notification history
  - `POST /notifications/process-pending` - Process pending notifications
  - `GET /notifications/stats` - Get notification statistics

#### New Scripts
- **SendGrid Test Script** (`/server/src/scripts/test-sendgrid.ts`)
  - Comprehensive testing utility for SendGrid integration
  - Configuration validation
  - Template testing
  - Troubleshooting guidance

#### Documentation
- **SendGrid Setup Guide** (`/server/SENDGRID_SETUP.md`)
  - Complete setup instructions
  - API endpoint documentation
  - Security considerations
  - Production deployment guidelines

### Modified

#### Dependencies
- **package.json**
  - Added `@sendgrid/mail` dependency for email functionality
  - Added npm scripts: `test:sendgrid` and `notifications:test`

#### Environment Configuration
- **.env**
  - Added SendGrid configuration variables:
    - `SENDGRID_API_KEY` - SendGrid API key
    - `SENDGRID_FROM_EMAIL` - Sender email address
    - `SENDGRID_FROM_NAME` - Sender display name

#### Core Services
- **MonitoringService** (`/server/src/services/monitoringService.ts`)
  - Integrated NotificationService for automatic email notifications
  - Added `sendRiskChangeNotifications()` method
  - Added `processPendingNotifications()` method
  - Enhanced risk change detection to trigger email notifications
  - Updated notification records with delivery status

#### Routing
- **Main Router** (`/server/src/routes/index.ts`)
  - Integrated notification routes under `/notifications` endpoint
  - Applied authentication and tenant filtering middleware

### Features

#### Automatic Risk Change Notifications
- Real-time email notifications when risk levels change
- Professional HTML email templates with company branding
- Tenant-specific recipient management
- Notification delivery tracking and status updates

#### Notification Management
- Comprehensive API for notification operations
- Historical notification tracking
- Pending notification processing
- Delivery statistics and monitoring

#### Email Templates
- Professional HTML email design
- Risk level color coding (High: red, Medium: orange, Low: green)
- Company information and risk details
- Responsive design for mobile devices

#### Error Handling
- Robust error handling for SendGrid API failures
- Detailed logging for troubleshooting
- Graceful degradation when email service is unavailable
- Retry mechanisms for failed notifications

#### Security
- Environment variable-based configuration
- Tenant isolation for notifications
- Secure API key management
- Input validation and sanitization

### Technical Details

#### Integration Points
- **Risk Monitoring**: Automatic notification triggers on risk changes
- **Tenant Management**: Tenant-specific email configurations
- **User Management**: Recipient email retrieval from tenant users
- **Database**: Notification status tracking in MongoDB

#### Email Delivery Flow
1. Risk change detected in monitoring service
2. RiskChangeNotification record created in database
3. Tenant notification emails retrieved
4. Professional email template generated
5. Email sent via SendGrid API
6. Notification record updated with delivery status

#### Configuration Requirements
- SendGrid account and API key
- Verified sender email address
- Environment variables properly configured
- Domain authentication (recommended for production)

### Testing
- Comprehensive test script for SendGrid integration
- Configuration validation utilities
- Template testing capabilities
- API endpoint testing support

### Deployment Notes
- Requires SendGrid account setup
- Environment variables must be configured
- Domain authentication recommended for production
- Monitor SendGrid usage and quotas
- Review email deliverability settings

---

**Migration Notes**: This update introduces email notification capabilities without breaking existing functionality. The system will continue to work without SendGrid configuration, but email notifications will not be sent until properly configured.