# MongoDB Collections (Duxiter Server)

Questo documento elenca le collection MongoDB usate dal server (via modelli Mongoose) e le TTL applicate dove presenti.

## Collections con nome esplicito

| Collection | Model | File | TTL (seconds) |
| --- | --- | --- | --- |
| `equifax-responses` | `EquifaxResponse` | [EquifaxResponse.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/EquifaxResponse.ts) | `EQUIFAX_RESPONSE_TTL_SECONDS` (default: `604800`) |
| `consulta_history` | `ConsultaHistory` | [ConsultaHistory.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/ConsultaHistory.ts) | `CONSULTA_HISTORY_TTL_SECONDS` (default: `63072000`) |
| `summaries` | `Summary` | [Summary.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Summary.ts) | (none) |
| `snifasancionatorios` | `SnifaSancionatorio` | [SnifaSancionatorio.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/SnifaSancionatorio.ts) | (none) |

## Collections con nome “default” (Mongoose pluralizza il nome del model)

| Collection (attesa) | Model | File | TTL (seconds) |
| --- | --- | --- | --- |
| `users` | `User` | [user.model.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/user.model.ts) | (none) |
| `tenants` | `Tenant` | [tenant.model.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/tenant.model.ts) | (none) |
| `results` | `Result` | [Result.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Result.ts) | (none) |
| `sheriffdatalogs` | `SheriffDataLog` | [SheriffDataLog.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/SheriffDataLog.ts) | `SHERIFF_DATA_LOG_TTL_SECONDS` (default: `86400`) |
| `sheriffapicalllogs` | `SheriffApiCallLog` | [SheriffApiCallLog.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/SheriffApiCallLog.ts) | `SHERIFF_API_CALL_LOG_TTL_SECONDS` (default: `86400`) |
| `monitoringschedules` | `MonitoringSchedule` | [MonitoringSchedule.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/MonitoringSchedule.ts) | (none) |
| `monitoringexecutions` | `MonitoringExecution` | [MonitoringExecution.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/MonitoringExecution.ts) | (none) |
| `riskchangenotifications` | `RiskChangeNotification` | [RiskChangeNotification.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/RiskChangeNotification.ts) | (none) |
| `companydetails` | `CompanyDetails` | [CompanyDetails.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/CompanyDetails.ts) | (none) |
| `companyrisks` | `CompanyRisks` | [CompanyRisks.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/CompanyRisks.ts) | (none) |
| `duxcompanyinfos` | `DuxCompanyInfo` | [DuxCompanyInfo.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/DuxCompanyInfo.ts) | (none) |
| `creditoperations` | `CreditOperation` | [creditOperation.model.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/creditOperation.model.ts) | (none) |
| `tenantbillings` | `TenantBilling` | [tenantBilling.model.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/tenantBilling.model.ts) | (none) |
| `billingsettings` | `BillingSettings` | [billingSettings.model.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/billingSettings.model.ts) | (none) |
| `evaluationjobs` | `EvaluationJob` | [evaluation.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/evaluation.ts) | (none) |
| `evaluationresults` | `EvaluationResult` | [evaluation.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/evaluation.ts) | (none) |
| `evaluationparameters` | `EvaluationParameter` | [EvaluationParameter.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/EvaluationParameter.ts) | (none) |
| `promptconfigurations` | `PromptConfiguration` | [PromptConfiguration.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/PromptConfiguration.ts) | (none) |
| `antiunioncases` | `AntiunionCase` | [AntiunionCase.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/AntiunionCase.ts) | (none) |
| `usernotes` | `UserNote` | [UserNote.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/UserNote.ts) | (none) |
| `snifaimportjobs` | `SnifaImportJob` | [SnifaImportJob.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/SnifaImportJob.ts) | (none) |
| `snifachangelogs` | `SnifaChangeLog` | [SnifaChangeLog.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/SnifaChangeLog.ts) | (none) |
| `ley20393s` | `Ley20393` | [Ley20393.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Ley20393.ts) | (none) |
| `ley21121s` | `Ley21121` | [Ley21121.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Ley21121.ts) | (none) |
| `lpaltos` | `Lpalto` | [Lpalto.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Lpalto.ts) | (none) |
| `lpmedios` | `Lpmedio` | [Lpmedio.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/Lpmedio.ts) | (none) |
| `logsherifdatas` | `logSherifData` | [LogSherifData.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/LogSherifData.ts) | `LOG_SHERIFF_DATA_TTL_SECONDS` (default: `86400`) |
| `aioperationlogs` | `AIOperationLog` | [AIOperationLog.ts](file:///home/duxiter/duxiter_intermediate/server/src/models/AIOperationLog.ts) | `AI_OPERATION_LOG_TTL_SECONDS` (default: `86400`) |

## Note

- Alcuni modelli risultano duplicati nel codebase (es. `AIOperationLog.ts` e `aiOperationLog.model.ts`): la collection usata resta comunque la stessa se il `modelName` coincide.
- Il nome “atteso” delle collection in questa sezione dipende dalla pluralizzazione di Mongoose; per vedere i nomi reali in DB usare `db.listCollections()` oppure l’endpoint/admin di database management se presente.
