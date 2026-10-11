# DUXITER 2.0 — Especificación Técnica
## Perfilamiento de Usuarios, Roles y Permisos
> Plataforma Fast Check — DUXITER 2.0
> Guía de desarrollo para priorización e implementación

---

### Datos del documento

| Campo | Detalle |
|-------|---------|
| Documento | Especificación técnica derivada del documento funcional *"DUXITER – Definición Funcional de Perfilamiento de Usuarios, Roles y Permisos (V2)"* |
| Versión | 1.0 — Borrador para revisión técnica |
| Fecha | 23 de agosto de 2026 |
| Dirigido a | Equipo de desarrollo / programador responsable de la implementación |
| Enfoque | Diseño agnóstico de tecnología (modelo lógico de datos, motor de permisos y API) |

---

### Control de versiones

| Versión | Fecha | Autor | Descripción del cambio |
|---------|-------|-------|------------------------|
| 1.0 | 23-08-2026 | — | Versión inicial derivada del funcional V2. |

---

## Contenido

1. [Introducción](#1-introducción)
2. [Glosario y convenciones técnicas](#2-glosario-y-convenciones-técnicas)
3. [Visión de arquitectura del modelo](#3-visión-de-arquitectura-del-modelo)
4. [Priorización por fases (roadmap de desarrollo)](#4-priorización-por-fases-roadmap-de-desarrollo)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Motor de permisos (lógica de autorización)](#6-motor-de-permisos-lógica-de-autorización)
7. [Catálogo de permisos y matriz de roles base](#7-catálogo-de-permisos-y-matriz-de-roles-base)
8. [Reglas de negocio transversales](#8-reglas-de-negocio-transversales)
9. [API / servicios (esbozo)](#9-api--servicios-esbozo)
10. Historias de usuario y criterios de aceptación
11. Casos de referencia mapeados a configuración
12. [Requisitos no funcionales](#12-requisitos-no-funcionales)
13. [Decisiones pendientes (a confirmar con negocio)](#13-decisiones-pendientes-a-confirmar-con-negocio)
[Anexo A — Trazabilidad funcional → técnica](#anexo-a--trazabilidad-funcional---técnica)

---

## 1. Introducción

### 1.1 Propósito de este documento

Traduce la definición funcional de perfilamiento de DUXITER 2.0 a una especificación técnica accionable. Objetivo: que el desarrollador pueda dimensionar, priorizar y construir el modelo sin ambigüedades: **qué entidades de datos crear, cómo debe comportarse el motor de permisos, qué acciones exponer, y en qué orden abordar el desarrollo**.

- El funcional describe *"qué"* debe lograr el sistema.
- Esta especificación describe *"cómo"* se estructura técnicamente y *"en qué orden"* conviene construirlo, dejando por escrito las decisiones de diseño y marcando explícitamente los puntos que aún requieren definición de negocio.

### 1.2 Alcance

Cubre:
- Estructura organizacional (multi-tenant)
- Identidad de usuarios
- Catálogo de permisos
- Dimensiones del perfil
- Motor de autorización
- Alcances de visualización y actuación
- Ciclo de decisión sobre terceros
- Trazabilidad
- Gobierno del modelo de riesgo

**Fuera de alcance**: detalle interno de los motores de evaluación (cómo Fast Check calcula el semáforo, cómo Deep Check ejecuta su análisis) ni el catálogo de proveedores de la plataforma DUXITER.

### 1.3 Relación con el documento funcional

Cada sección técnica es trazable a la definición funcional. El **Anexo A** entrega la matriz de trazabilidad. Cuando el funcional usa *"debe evaluarse"* o *"podría considerarse"*, esta especificación toma una decisión de diseño recomendada y la registra en la **Sección 13 (Decisiones pendientes)** para su confirmación.

### 1.4 Audiencia y cómo leer el documento

Lectura recomendada:
1. **Sección 3** → Visión de arquitectura (qué enfoque)
2. **Sección 4** → Priorización por fases (qué construir primero)
3. **Secciones 5 a 9** → Referencia de implementación (datos, motor, reglas, API)
4. **Sección 10** → Backlog HU con criterios de aceptación verificables

> **Regla de oro del diseño**  
> El perfil de un usuario **NO es un rol**. Es el resultado de combinar varias dimensiones independientes. El motor debe resolver el permiso efectivo en runtime combinando: **rol(es) + permisos individuales + tipo de tercero autorizado + nivel de información + alcance de visualización + alcance de actuación**. Dos usuarios con el mismo rol pueden tener experiencias distintas.

---

## 2. Glosario y convenciones técnicas

| Término | Definición técnica |
|---------|--------------------|
| **Tenant / Organización** | Cliente de DUXITER y nivel superior de aislamiento de datos. Todo registro pertenece a exactamente un tenant. Ningún dato cruza entre tenants. |
| **País** | Subdivisión del tenant. Un tenant tiene 1+ países; en clientes mono-país el nivel existe pero es transparente para el usuario. |
| **Unidad Organizacional (UO)** | Nodo jerárquico dentro de un país (sucursal, filial, planta, faena, región…). Puede anidarse en árbol. Un usuario y un registro pueden asociarse a una UO. |
| **Área Funcional** | Función del usuario (Compras, RRHH, Compliance…). Clasifica al usuario pero **NO otorga permisos por sí sola**. |
| **Rol base** | Plantilla de permisos preconfigurada para acelerar la configuración. No sustituye los permisos efectivos. |
| **Permiso (atómico)** | Unidad mínima de autorización asociada a una acción concreta (ej: `third_party.approve`). |
| **Permiso efectivo** | Conjunto real de permisos de un usuario tras combinar roles, concesiones y denegaciones individuales. |
| **Dimensión de perfil** | Eje configurable: producto, tipo de tercero, nivel de información, acciones, alcance de visualización, alcance de actuación, participación en procesos, administración. |
| **Alcance (scope)** | Universo de registros sobre el que aplica un permiso. Se distingue **alcance de VISUALIZACIÓN** y **alcance de ACTUACIÓN**. |
| **Permiso sensible** | Atribución que **nunca** se hereda automáticamente y debe otorgarse explícitamente (ej: consultar personas naturales, modificar la fórmula de riesgo). |
| **Tercero** | Persona jurídica o natural (nacional/extranjera) que es objeto de evaluación. |
| **Resultado de evaluación** | Salida de Fast Check u otro producto (semáforo VERDE / AMARILLO / ROJO). Distinto del estado de decisión. |
| **Estado de decisión** | Determinación de la organización sobre el tercero (Aprobado, Rechazado…). Independiente del semáforo. |

---

## 3. Visión de arquitectura del modelo

### 3.1 Enfoque: RBAC + ABAC + Alcances

Combina 3 mecanismos complementarios (ninguno por sí solo cubre los requisitos):

1. **RBAC (control por roles)** — los roles base agrupan permisos para facilitar la configuración. Un usuario puede tener **más de un rol**.
2. **ABAC (control por atributos)** — atributos del usuario (área, tipo de tercero autorizado, nivel de información, permisos sensibles) y atributos del recurso (tipo de tercero, sensibilidad, UO/país del registro) refinan la decisión más allá del rol.
3. **Scoping (alcance por universo)** — cada permiso se limita a un universo de registros (propio / UO / conjunto UO / área / país / organización), evaluado **por separado** para VER y para ACTUAR.

> En términos prácticos: el rol propone, los permisos individuales disponen, los atributos condicionan y el alcance delimita el universo.

### 3.2 Principio de permiso efectivo

Precedencia **obligatoria**:

- Una **denegación explícita individual** siempre gana sobre cualquier concesión (`deny-overrides`).
- Una **concesión individual** se suma a las concesiones heredadas de los roles.
- En ausencia de concesión, el permiso está **denegado por defecto** (`deny-by-default`).
- Los **permisos sensibles nunca se heredan** de un rol administrativo; requieren concesión explícita marcada como sensible.

### 3.3 Separación de visualización y actuación

El alcance para **VER** y el alcance para **ACTUAR** son dimensiones **distintas y se modelan por separado**.

Ejemplos:
- Usuario Compliance: **VER** todas las evaluaciones de la organización, **NO ACTUAR** (no aprobar proveedores).
- Jefatura: **VER** varias sucursales, **ACTUAR** (aprobar/rechazar) solamente las suyas.

### 3.4 Flujo conceptual de una autorización

```
Solicitud: (usuario, accion, tercero/recurso, contexto)
            │
  1. ¿Mismo tenant que el recurso?               ── no ─▶ DENEGAR
  2. ¿Producto/capacidad requerido habilitado?   ── no ─▶ DENEGAR
  3. ¿Tiene el permiso atómico de la acción?      ── no ─▶ DENEGAR
  4. ¿Autorizado para el TIPO de tercero?         ── no ─▶ DENEGAR
        (si es persona natural ⇒ exige permiso sensible explícito)
  5. ¿El recurso está dentro del ALCANCE?         ── no ─▶ DENEGAR
        (lectura ⇒ alcance de visualización; acción ⇒ alcance de actuación)
  6. Resolver NIVEL de información visible (Tabla 19 de niveles)
  7. Aplicar gate de información SENSIBLE
            │
      PERMITIR ─▶ ejecutar ─▶ registrar en auditoría
                              (quién / qué / sobre qué / cuándo)
```

---

## 4. Priorización por fases (roadmap de desarrollo)

El objetivo es entregar valor temprano con una base sólida y evitar retrabajo. Las fases posteriores dependen de que la **Fase 0** quede bien cimentada.

### 4.1 Resumen de fases

| Fase | Nombre | Objetivo | Depende de |
|------|--------|----------|------------|
| **Fase 0** | **Fundaciones (MVP) — Necesaria** | Perfilamiento: estructura, usuarios, roles, motor núcleo, consulta sensible de PN, alcances y consulta de terceros por RUT. | — |
| **Fase 1** | **Decisión y ciclo de vida — Necesaria** | Estados de decisión, vigencia, origen auto/manual, escalamiento, rol Solicitante y niveles de evaluación requeridos. | Fase 0 |
| **Fase 2** | **Colaboración y gobierno — Necesaria** | Comentarios y etiquetas con privacidad, exportación multinivel, gobierno del modelo de riesgo, consumo/capacidades e historial completo. | Fase 0-1 |
| **Fase 3** | **Evolución — Deseable** | Motor de workflow, decisión automática por reglas, uso de documentos aportados como fuente e integración de estado Deep Check / Smart Flow. | Fase 0-2 |

### 4.2 Detalle de la Fase 0 — Fundaciones (MVP)

Es la fase crítica. Entrega el mínimo para que dos usuarios que ingresan el mismo RUT tengan experiencias distintas. Incluye:

- Multi-tenant y estructura organizacional mínima: **organización, país, UO (árbol) y área funcional**.
- Gestión de usuarios: crear/desactivar, asignar país/UO/área, función de **Administrador General**.
- Catálogo de permisos atómicos, roles base y asignación de roles/permisos (con **concesiones y denegaciones individuales**).
- **Motor de permisos núcleo**: verificación de producto/capacidad, permiso de acción, tipo de tercero, alcances de VER/ACTUAR, resolución de nivel de información.
- Permiso sensible explícito para consulta de personas naturales (**deny-by-default para usuarios nuevos**).
- Registro de terceros y evaluaciones, estado de decisión básico y consulta rápida por RUT/identificación o nombre.
- Auditoría base: **quién hizo qué, sobre qué tercero/evaluación y cuándo**.

### 4.3 Qué contiene cada fase posterior

| Capacidad funcional | Fase |
|---------------------|------|
| Estructura organizacional multinivel + Área Funcional | **0** |
| Administrador General y gestión de usuarios | **0** |
| Roles base + permisos individuales (grant/deny) | **0** |
| Motor de permisos (producto, acción, tipo de tercero, alcances, nivel de info) | **0** |
| Consulta sensible de personas naturales (explícita) | **0** |
| Consulta de tercero por RUT y ficha resumida por perfil | **0** |
| Auditoría base | **0** |
| Estados de decisión completos + vigencia + origen auto/manual | **1** |
| Escalamiento entre niveles | **1** |
| Rol Solicitante e inicio de solicitud de alta/evaluación | **1** |
| Nivel de evaluación requerido (Fast Check, Deep Check, Smart Flow…) | **1** |
| Contexto/motivo de consulta (trazabilidad de PN) | **1** |
| Comentarios (visible/restringido/personal) con reglas de visibilidad | **2** |
| Etiquetas (crear/utilizar/visualizar/administrar) | **2** |
| Exportación multinivel | **2** |
| Gobierno del modelo de riesgo (listas, parámetros, umbrales, fórmula) | **2** |
| Consumo y capacidades por nivel (organización/país/UO/área/usuario) | **2** |
| Historial completo del tercero | **2** |
| Motor de workflow (cuándo interviene cada usuario) | **3** |
| Decisión automática/mixta por reglas del cliente | **3** |
| Documentos aportados como fuente para Fast Check | **3** |
| Integración de estado Deep Check / Smart Flow | **3** |

---

## 5. Modelo de datos

> Nota: modelo agnóstico de tecnología (lógico). Convenciones de tipo: `id` = identificador único; `ref` = referencia a otra entidad; `enum` = valor de conjunto cerrado; `bool`; `ts` = marca de tiempo; `text` = texto. Toda entidad de negocio incluye `organizacion_id` para aislamiento por tenant.

### 5.1 Diagrama entidad-relación (conceptual)

```
organizacion 1───∞ pais 1───∞ unidad_organizacional (árbol: parent_id)
organizacion 1───∞ area_funcional
organizacion 1───∞ usuario

usuario      ∞───∞ rol                 (usuario_rol)
rol          ∞───∞ permiso             (rol_permiso)
usuario      ∞───∞ permiso             (usuario_permiso_override: grant | deny, sensible)
usuario      1───∞ usuario_alcance     (scope: VER | ACTUAR, tipo, refs)
usuario      1───∞ usuario_dimension   (producto, capacidad, tipo_tercero, nivel_info)

tercero      1───∞ evaluacion 1───∞ decision
tercero      1───∞ comentario 1───∞ comentario_visibilidad
tercero      ∞───∞ etiqueta            (tercero_etiqueta)

evaluacion/decision/… 1───∞ auditoria_log
```

---

### 5.2 Dominio: Estructura organizacional

#### 5.2.1 `organizacion` (tenant)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador del tenant. |
| nombre | text | Nombre de la organización (lenguaje cliente). |
| config_decision | enum | Política de decisión por defecto: `AUTOMATICA | MANUAL | MIXTA`. |
| activo | bool | Estado del tenant. |

#### 5.2.2 `pais`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref | Tenant al que pertenece. |
| codigo | text | Código ISO / nombre del país. |

#### 5.2.3 `unidad_organizacional`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref | Tenant. |
| pais_id | ref | País de la UO. |
| parent_id | ref (nullable) | UO superior en el árbol. Nulo si es raíz. Soporta jerarquías de profundidad variable. |
| tipo | enum | `SUCURSAL | FILIAL | PLANTA | FAENA | DIVISION | REGION | CLINICA | TIENDA | UNIDAD_NEGOCIO | OTRO`. |
| nombre | text | Nombre de la unidad. |

#### 5.2.4 `area_funcional`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref | Tenant. |
| nombre | text | Compras, Abastecimiento, Compliance, RRHH, Legal, Ventas, Finanzas, Tesorería, Auditoría, Operaciones u otra. |

---

### 5.3 Dominio: Identidad, roles y permisos

#### 5.3.1 `usuario`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref | Tenant. |
| pais_id | ref (nullable) | País de pertenencia principal. |
| area_funcional_id | ref (nullable) | Área funcional. No otorga permisos por sí sola. |
| nombre / email | text | Datos de identidad. |
| estado | enum | `ACTIVO | INACTIVO` (desactivación en vez de borrado, por trazabilidad). |

#### 5.3.2 `usuario_unidad` (pertenencia a UO — permite multi-pertenencia)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| usuario_id | ref | Usuario. |
| unidad_id | ref | Unidad organizacional (un usuario puede pertenecer a varias; ver Decisión D-06). |

#### 5.3.3 `rol`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref (nullable) | Nulo para roles base del catálogo del sistema; con valor para roles propios del cliente. |
| nombre | text | Nombre del rol. |
| es_base | bool | Marca si es un rol base plantilla. |

#### 5.3.4 `permiso` (catálogo de acciones atómicas)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| codigo | text | Código estable, p. ej. `third_party.approve` (ver catálogo Sección 7). |
| categoria | enum | `CONSULTA | ACCION | DECISION | ADMINISTRACION | GOBIERNO_RIESGO | EXPORTACION | COLABORACION`. |
| es_sensible | bool | Si es verdadero, nunca se hereda de un rol; requiere concesión explícita. |

#### 5.3.5 `usuario_rol / rol_permiso`

Tablas de relación M:N. `usuario_rol` asigna 1+ roles a un usuario. `rol_permiso` lista los permisos que aporta cada rol.

#### 5.3.6 `usuario_permiso_override` (concesiones y denegaciones individuales)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| usuario_id | ref | Usuario. |
| permiso_id | ref | Permiso afectado. |
| tipo | enum | `GRANT (concede) | DENY (deniega)`. **DENY siempre gana**. |
| sensible_confirmado | bool | Verdadero cuando el otorgante confirmó explícitamente un permiso sensible. |
| otorgado_por / ts | ref / ts | Quién y cuándo (para auditoría). |

---

### 5.4 Dominio: Dimensiones del perfil

Las dimensiones configurables por usuario que el motor consulta **en cada autorización**. Pueden implementarse como tablas separadas o como una `usuario_dimension` parametrizada.

#### 5.4.1 `usuario_producto` (productos y capacidades habilitadas)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| usuario_id | ref | Usuario. |
| producto | enum | `FAST_CHECK | DEEP_CHECK | ENROLAMIENTO | SMART_FLOW | CARPETA_TRIBUTARIA`. |
| capacidad | enum (nullable) | Para Fast Check: `FULL | COMPLIANCE | INTERNACIONAL`, combinado con `CONSULTA | MONITOREO`. |
| habilitado | bool | Acceso configurable Sí/No. |

#### 5.4.2 `usuario_tipo_tercero` (tipos de tercero autorizados)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| usuario_id | ref | Usuario. |
| tipo_tercero | enum | `PJ_NACIONAL | PN_NACIONAL | PJ_EXTRANJERA | PN_EXTRANJERA`. |
| permitido | bool | Autorización. Para `PN_*` exige además el **permiso sensible** de consulta de personas naturales. |

#### 5.4.3 `usuario_nivel_info` (nivel de información visible)

Escala **acumulativa**: cada nivel superior incluye los inferiores. Se registra por separado para **Fast Check** y para **Deep Check**.

| Nivel | Valor enum | Qué muestra |
|-------|------------|-------------|
| 1 | `RESULTADO_GENERAL` | Solo resultado / semaforización general. |
| 2 | `RESULTADO_PARAMETROS` | Color de los parámetros, sin los antecedentes que explican las alertas. |
| 3 | `DETALLE_RIESGO` | Información que explica los parámetros en rojo/naranjo. |
| 4 | `INFO_NO_SENSIBLE` | Antecedentes generales no clasificados como sensibles. |
| 5 | `INFO_COMPLETA` | Información completa, incluida la sensible autorizada (requiere gate sensible). |

#### 5.4.4 `usuario_alcance` (scope de visualización y actuación)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| usuario_id | ref | Usuario. |
| proposito | enum | `VER | ACTUAR`. Un usuario tiene entradas independientes para cada propósito. |
| tipo_alcance | enum | `PROPIO | UNIDAD | CONJUNTO_UNIDADES | AREA | PAIS | ORGANIZACION`. |
| refs | lista ref | Para `CONJUNTO_UNIDADES`: las UO específicas. Para `UNIDAD`: la UO. Para `PAIS/AREA`: la referencia correspondiente. |
| incluye_descendientes | bool | Si un alcance de UNIDAD abarca las sub-UO del árbol (ver Decisión D-04). |

---

### 5.5 Dominio: Terceros, evaluaciones y decisiones

#### 5.5.1 `tercero`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id | ref | Tenant. |
| identificacion | text | RUT o identificador. Clave de consulta rápida (**indexada**). |
| nombre | text | Nombre o razón social. |
| tipo | enum | `PJ_NACIONAL | PN_NACIONAL | PJ_EXTRANJERA | PN_EXTRANJERA`. |

#### 5.5.2 `evaluacion`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| tercero_id | ref | Tercero evaluado. |
| producto | enum | Producto que generó el resultado (`FAST_CHECK, DEEP_CHECK…`). |
| resultado | enum | `VERDE | AMARILLO | ROJO` (semáforo). **NO** es el estado de decisión. |
| nivel_requerido | enum | Nivel de evaluación requerido para el tercero (Sección 8). |
| unidad_id | ref | UO de contexto donde se originó la consulta (para alcances). |
| motivo_consulta | enum (nullable) | Contexto/motivo, especialmente para PN (Fase 1). |
| creado_por / ts | ref / ts | Autor y momento de la consulta. |

#### 5.5.3 `decision`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| tercero_id | ref | Tercero. |
| evaluacion_id | ref (nullable) | Evaluación que la origina, si aplica. |
| estado | enum | `PENDIENTE | EN_REVISION | SOLICITUD_ANTECEDENTES | ESCALADO | APROBADO | APROBADO_OBS | RECHAZADO`. |
| origen | enum | `AUTOMATICA | MANUAL`. |
| responsable_id | ref (nullable) | Usuario responsable cuando corresponde. |
| comentario | text | Fundamento de la decisión. |
| vigencia_tipo | enum | `PERMANENTE | HASTA_FECHA | POR_MESES | HASTA_NUEVA_EVAL`. |
| valido_hasta | ts (nullable) | Fecha de vencimiento cuando aplica. |
| creado_ts | ts | Fecha de la decisión. |

#### 5.5.4 `escalamiento`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| evaluacion_id | ref | Evaluación escalada. |
| desde_usuario / hacia_nivel | ref / enum | Origen y nivel destino (`OPERATIVO | JEFATURA | CENTRAL` u otro). |
| ts | ts | Momento del escalamiento (queda en historial). |

---

### 5.6 Dominio: Colaboración (comentarios y etiquetas)

#### 5.6.1 `comentario`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id / tercero_id / autor_id | id / ref / ref | Identidad, tercero y autor. |
| cuerpo | text | Contenido del comentario. |
| visibilidad | enum | `VISIBLE | RESTRINGIDO | PERSONAL`. |

#### 5.6.2 `comentario_visibilidad` (solo para RESTRINGIDO)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| comentario_id | ref | Comentario. |
| audiencia_tipo | enum | `ROL | AREA | UNIDAD | NIVEL | USUARIO`. |
| audiencia_ref | ref | Destinatario concreto según el tipo. |

#### 5.6.3 `etiqueta / tercero_etiqueta`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id / organizacion_id / nombre | id / ref / text | Identidad de la etiqueta. |
| restringida | bool | Etiqueta general (falso) o restringida (verdadero). |
| permisos | enum×4 | Control de `CREAR | UTILIZAR | VISUALIZAR | ADMINISTRAR` (ver Decisión D-03). |

---

### 5.7 Dominio: Consumo y capacidades

| Entidad | Descripción |
|---------|-------------|
| `capacidad_pool` | Bolsa/límite de capacidades contratadas a nivel de: `ORGANIZACION (pool general), PAIS, UNIDAD o AREA`. Campos: nivel, referencia, producto/capacidad, límite, consumido. |
| `usuario_limite_consumo` | Tope individual opcional por usuario como mecanismo de control. Un tope **no implica necesariamente** una bolsa de créditos separada (ver Decisión D-05). |

---

### 5.8 Dominio: Auditoría

#### 5.8.1 `auditoria_log`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | id | Identificador. |
| organizacion_id / usuario_id | ref / ref | Tenant y actor. |
| accion | enum | `CONSULTA | ACCESO_EVAL | EXPORTACION | INCORP_DOC | MODIFICACION | COMENTARIO | ETIQUETA | ESCALAMIENTO | APROBACION | RECHAZO | CAMBIO_DECISION | CONFIG_SENSIBLE`. |
| entidad_tipo / entidad_id | enum / ref | Sobre qué tercero/evaluación/configuración recae. |
| valor_anterior / valor_nuevo | text (nullable) | Cuando corresponde (ej: cambio de umbral o de decisión). |
| origen | enum | `AUTOMATICO | MANUAL`. |
| ts | ts | Momento del evento. |

> **Regla de auditoría**: se registran acciones relevantes **aunque NO consuman créditos**: generación de consulta, acceso posterior a una evaluación existente, exportación, incorporación de documentos, modificación, comentarios, etiquetas, escalamiento, aprobación, rechazo, cambio de decisión y modificación de configuraciones sensibles. El log debe responder siempre: **quién + qué hizo + sobre qué tercero/evaluación + cuándo**.

---

## 6. Motor de permisos (lógica de autorización)

> El motor es el **corazón** del sistema: un servicio único y centralizado. Toda operación pasa por él. No debe replicarse la lógica en cada pantalla/endpoint. Recibe una solicitud y devuelve **decisión + nivel de información aplicable + razón** (para auditoría).

### 6.1 Resolución del permiso efectivo

```python
def permisos_efectivos(usuario):
    concedidos = ∪(permisos de cada rol del usuario)
    concedidos = concedidos ∪ (overrides GRANT del usuario)
    denegados  = overrides DENY del usuario
    efectivos  = concedidos − denegados        # DENY siempre gana

    # un permiso sensible sólo cuenta si su GRANT tiene sensible_confirmado = True
    return efectivos
```

### 6.2 Resolución del alcance

Se evalúa con propósito **VER** (lecturas) y **ACTUAR** (acciones/decisiones) **por separado**:

```python
def en_alcance(usuario, recurso, proposito):  # proposito ∈ {VER, ACTUAR}
    for alcance in usuario.alcances[proposito]:
        match alcance.tipo:
            case PROPIO:            ok = recurso.creado_por == usuario.id
            case UNIDAD:            ok = recurso.unidad ∈ {alcance.unidad (+ descendientes?)}
            case CONJUNTO_UNIDADES: ok = recurso.unidad ∈ alcance.refs
            case AREA:              ok = recurso.area == usuario.area
            case PAIS:              ok = recurso.pais == alcance.pais
            case ORGANIZACION:      ok = recurso.organizacion == usuario.organizacion
        if ok: return True
    return False
```

### 6.3 Algoritmo principal de autorización

```python
def autorizar(usuario, accion, recurso, contexto):
    # 1. Aislamiento multi-tenant
    if recurso.organizacion_id != usuario.organizacion_id:
        return DENEGAR("tenant")

    # 2. Producto / capacidad habilitado
    if accion.producto and not usuario.tiene_producto(accion.producto):
        return DENEGAR("producto/capacidad no habilitado")

    # 3. Permiso atómico
    efectivos = permisos_efectivos(usuario)
    if accion.permiso not in efectivos:
        return DENEGAR("sin permiso")

    # 4. Tipo de tercero + gate de persona natural
    if recurso.es_tercero:
        if recurso.tipo not in usuario.tipos_tercero_permitidos:
            return DENEGAR("tipo de tercero no autorizado")
        if recurso.tipo ∈ {PN_*} and not usuario.tiene_permiso_sensible(CONSULTA_PN):
            return DENEGAR("consulta de persona natural no autorizada")

    # 5. Alcance (VER para lectura / ACTUAR para acción)
    proposito = accion.es_lectura ? VER : ACTUAR
    if not en_alcance(usuario, recurso, proposito):
        return DENEGAR("fuera de alcance")

    # 6. Proyección por nivel
    nivel = min(usuario.nivel_info, accion.nivel_solicitado)
    datos = proyectar(recurso, nivel)               # oculta campos por encima del nivel

    # 7. Gate sensible final
    if nivel == INFO_COMPLETA and not usuario.ver_sensible_autorizado:
        datos = datos.sin_campos_sensibles()

    registrar_auditoria(usuario, accion, recurso)
    return PERMITIR(datos, nivel)
```

### 6.4 Proyección por nivel de información (principio funcional final)

> La proyección por nivel es lo que hace que dos usuarios que ingresan el mismo RUT vean cosas distintas. El motor **nunca entrega el objeto completo**: entrega una proyección acotada.

| Perfil | Nivel resuelto | Qué recibe al consultar el mismo RUT |
|--------|----------------|---------------------------------------|
| Usuario operacional | `RESULTADO_GENERAL` | **APROBADO – Vigente** |
| Jefatura | `DETALLE_RIESGO` | Aprobado – Fast Check amarillo – Aprobación con observaciones – Vigente hasta XX/XX/XXXX |
| Compliance autorizado | `INFO_COMPLETA + sensible` | Detalle de antecedentes, historial, comentarios permitidos, estado Deep Check y estado documental |

---

## 7. Catálogo de permisos y matriz de roles base

### 7.1 Catálogo de permisos atómicos

Códigos estables evaluados por el motor. La columna **Sensible** marca los que exigen concesión explícita (nunca se heredan).

| Código | Categoría | Descripción | Sensible |
|--------|-----------|-------------|----------|
| `fastcheck.query` | CONSULTA | Realizar una consulta Fast Check. | ❌ No |
| `party.query.pn` | CONSULTA | Consultar personas naturales. | ✅ Sí |
| `request.create` | ACCION | Iniciar solicitud de evaluación/alta. | ❌ No |
| `doc.attach` | ACCION | Incorporar antecedentes/documentos. | ❌ No |
| `comment.create` | COLABORACION | Guardar comentarios. | ❌ No |
| `tag.use` | COLABORACION | Crear/utilizar etiquetas. | ❌ No |
| `export.certificate` | EXPORTACION | Exportar certificado / nivel general. | ❌ No |
| `export.detail` | EXPORTACION | Exportar informe detallado. | ❌ No |
| `eval.escalate` | ACCION | Escalar evaluación a otro nivel. | ❌ No |
| `exception.review` | DECISION | Revisar excepción. | ❌ No |
| `third_party.approve` | DECISION | Aprobar tercero. | ❌ No |
| `third_party.approve_obs` | DECISION | Aprobar con observaciones. | ❌ No |
| `third_party.reject` | DECISION | Rechazar tercero. | ❌ No |
| `third_party.request_info` | DECISION | Solicitar antecedentes. | ❌ No |
| `exception.authorize` | DECISION | Autorizar excepción pese a riesgo. | ✅ Sí |
| `admin.users` | ADMINISTRACION | Crear/desactivar usuarios y asignar roles/permisos. | ❌ No |
| `admin.structure` | ADMINISTRACION | Administrar países, UO y áreas. | ❌ No |
| `admin.grant_sensitive` | ADMINISTRACION | Otorgar permisos sensibles a otros. | ✅ Sí |
| `risk.lists.manage` | GOBIERNO_RIESGO | Gestionar listas propias. | ✅ Sí |
| `risk.params.define` | GOBIERNO_RIESGO | Definir parámetros incluidos. | ✅ Sí |
| `risk.thresholds.edit` | GOBIERNO_RIESGO | Modificar umbrales de semáforo. | ✅ Sí |
| `risk.formula.edit` | GOBIERNO_RIESGO | Modificar fórmula/criterio de riesgo final. | ✅ Sí |
| `audit.view` | ADMINISTRACION | Consultar trazabilidad/auditoría. | ❌ No |

---

### 7.2 Matriz de roles base × permisos

Los roles base son **plantillas de arranque**. Marcan un punto de partida; el permiso efectivo final siempre lo determinan las concesiones/denegaciones individuales.

- **✓** = incluido por defecto
- **△** = configurable / opcional
- *(vacío)* = no incluido
- Permisos sensibles: se otorgan siempre de forma explícita aunque el rol lo sugiera

| Permiso | Solic. | Oper. | Eval. | Aprob. | Auditor | Admin | G.Listas | G.Riesgo |
|---------|:------:|:-----:|:-----:|:------:|:-------:|:-----:|:--------:|:--------:|
| `fastcheck.query` | | ✓ | ✓ | ✓ | ✓ | △ | | |
| `party.query.pn` (sensible) | | | △ | △ | △ | | | |
| `request.create` | ✓ | △ | △ | △ | | | | |
| `doc.attach` | ✓ | ✓ | ✓ | ✓ | | | | |
| `eval.escalate` | | ✓ | ✓ | △ | | | | |
| `exception.review` | | | ✓ | ✓ | | | | |
| `third_party.approve` | | | | ✓ | | | | |
| `third_party.reject` | | | | ✓ | | | | |
| `third_party.request_info` | | △ | ✓ | ✓ | | | | |
| `export.certificate` | | ✓ | ✓ | ✓ | ✓ | | | |
| `export.detail` | | | △ | ✓ | ✓ | | | |
| `comment.create / tag.use` | △ | ✓ | ✓ | ✓ | △ | | | |
| `admin.users / admin.structure` | | | | | | | ✓ | | |
| `admin.grant_sensitive` (sensible) | | | | | | | △ | |
| `risk.lists.manage` (sensible) | | | | | | | | ✓ |
| `risk.* thresholds/formula` (sensible) | | | | | | | | | ✓ |
| `audit.view` | | | | △ | ✓ | △ | | |

**Leyenda roles base**:
Solic. = **Solicitante** · Oper. = **Usuario Operativo** · Eval. = **Evaluador/Analista** · Aprob. = **Aprobador** · Auditor = **Auditor** · Admin = **Administrador General** · G.Listas = **Gestor de listas** · G.Riesgo = **Gestor del modelo de riesgo**

> **⚠️ Principio no negociable**: `Administrador General ≠ acceso a todo`  
> Ser Administrador General habilita administrar usuarios y estructura, pero **NO concede automáticamente** consulta de personas naturales, acceso a información sensible ni gobierno del modelo de riesgo. Esas atribuciones se otorgan de forma **explícita y separada**.

> **⚠️ Segundo principio**: `Semáforo Fast Check ≠ Estado de aprobación`  
> Un tercero puede tener Fast Check verde y seguir **PENDIENTE** porque el cliente exige Deep Check/documentación antes de aprobar. También puede presentar alerta y luego ser **APROBADO con observaciones** por un usuario autorizado bajo ciertas condiciones.

---

## 8. Reglas de negocio transversales

### 8.1 Consulta de personas naturales (permiso sensible)

- El permiso `party.query.pn` **se otorga explícitamente** y no se deriva del cargo, área, rol ni nivel jerárquico.
- Usuario nuevo → **SIN permiso PN por defecto** hasta otorgamiento expreso (`deny-by-default`). Ver D-01.
- Para consultas de PN se registra además el **motivo/contexto** (Fase 1): proveedor PN, representante legal, colaborador sensible, médico/profesional, conflicto de interés, otro.

### 8.2 Resultado de evaluación vs. estado de decisión

Son dos atributos **independientes**. El sistema **no debe confundirlos**:
- Semáforo de Fast Check = lo que determina el producto
- Estado de decisión = lo que la organización decide

### 8.3 Estados de decisión y vigencia

Estados iniciales (7):
`PENDIENTE → EN_REVISION → SOLICITUD_ANTECEDENTES → ESCALADO → APROBADO / APROBADO_OBS / RECHAZADO`

Cada decisión registra: estado, fecha, origen y —cuando corresponda— responsable, comentario/fundamento y **vigencia** (permanente / hasta fecha / por X meses / hasta nueva evaluación). Al consultar nuevamente un tercero se identifica si existe una decisión vigente anterior y se muestra según permisos.

### 8.4 Escalamiento

Usuarios sin atribución suficiente pueden escalar. Flujo de referencia:
1. Operativo consulta y escala → 2. Jefatura revisa y aprueba/rechaza/solicita antecedentes o escala → 3. Nivel central accede al detalle autorizado y decide.
Todas las intervenciones quedan en historial.

### 8.5 Decisión automática, manual o mixta

Cada organización define su política (`organizacion.config_decision`):
- **Automática**: p. ej. `verde → aprobado`, `rojo → rechazado`, `amarillo → revisión`.
- **Manual**: todo requiere intervención humana incluso si Fast Check es favorable.
- **Mixta**: algunas son automáticas, otras requieren revisión.

El motor de reglas automáticas es **Fase 3**; el registro del **origen** es **Fase 1**.

### 8.6 Comentarios y etiquetas

- **Comentarios**: crear vs. visualizar. 3 niveles de visibilidad: `VISIBLE` (según configuración) · `RESTRINGIDO` (audiencia limitada a roles/áreas/UO/niveles/usuarios) · `PERSONAL` (solo creador). Integran historial permanentemente con sus reglas de visibilidad.
- **Etiquetas**: 4 permisos (`crear / utilizar / visualizar / administrar`); 2 niveles: general o restringida.

### 8.7 Exportación multinivel

3 niveles mínimo: resultado general · reporte general · reporte detallado. Un usuario autorizado al nivel máximo puede optar por exportar un nivel inferior para compartir sin revelar antecedentes innecesarios. Toda exportación queda en auditoría.

### 8.8 Gobierno del modelo de riesgo

Permisos **especialmente sensibles** (**nunca** automáticos para Admin General):
- Ver/gestionar listas propias
- Definir parámetros incluidos
- Modificar umbrales del semáforo
- Modificar fórmula/criterio de riesgo final

Toda modificación registra **valor anterior/nuevo** en auditoría.

### 8.9 Consumo y capacidades

Niveles de administración:
`Pool organización → distribución/limite por país → por UO → por área → tope individual opcional por usuario`.
Un tope individual **no constituye una bolsa de créditos separada** (por defecto; ver D-05).

### 8.10 Frontera funcional con el catálogo DUXITER

- **Fast Check** se enfoca en: **identificar → evaluar riesgo → decidir → consultar estado** (screening, monitoreo, historial, decisión y consulta rápida de un tercero conocido).
- **DUXITER / Deep Check / Smart Flow** mantiene: catálogo, clasificación, categorías, ficha extendida y gestión documental.

---

## 9. API / servicios (esbozo)

> Esbozo agnóstico (estilo REST). Lo esencial: **responsabilidad de cada servicio + contrato entrada/salida**. Todos operan dentro del tenant del usuario autenticado.

### 9.1 Servicio de autorización (núcleo, Fase 0)

| Operación | Entrada | Salida |
|-----------|---------|--------|
| `POST /authz/check` | `{ usuario_id, accion, recurso_tipo, recurso_id, contexto }` | `{ permitido: bool, nivel_info, razon, campos_visibles[] }` |
| `GET /authz/effective-permissions/{usuario_id}` | — | `{ permisos[], sensibles_confirmados[], alcances{ver, actuar}, nivel_info }` |

### 9.2 Administración (Fase 0)

| Operación | Descripción |
|-----------|-------------|
| `POST/PUT/DELETE /org/countries` | Administrar países del tenant. Requiere `admin.structure`. |
| `… /org/units` | Administrar unidades organizacionales (árbol). Requiere `admin.structure`. |
| `… /org/areas` | Administrar áreas funcionales. Requiere `admin.structure`. |
| `POST /users, PATCH /users/{id}` | Crear/desactivar usuarios, asignar país/UO/área. Requiere `admin.users`. |
| `POST /users/{id}/roles` | Asignar 1+ roles. Requiere `admin.users`. |
| `POST /users/{id}/permissions` | Conceder/denegar permisos individuales (GRANT/DENY). Otorgar sensibles requiere `admin.grant_sensitive`. |
| `PUT /users/{id}/scopes` | Definir alcances de VER y ACTUAR por separado. |
| `PUT /users/{id}/dimensions` | Habilitar productos/capacidades, tipos de tercero, nivel de información. |

### 9.3 Terceros, consulta y ficha (Fase 0-1)

| Operación | Descripción |
|-----------|-------------|
| `GET /third-parties?identificacion=RUT|nombre` | Consulta rápida. Respuesta proyectada según nivel del perfil. |
| `GET /third-parties/{id}/summary` | Ficha resumida: estado de decisión, vigencia, último Fast Check, nivel requerido, estado Deep Check/Smart Flow — cada campo sujeto a permiso. |
| `POST /evaluations` | Registrar/ejecutar consulta Fast Check (requiere `fastcheck.query` + tipo de tercero autorizado). |
| `POST /requests` | Iniciar solicitud de alta/evaluación (rol Solicitante, sin acceso al detalle). Fase 1. |

### 9.4 Decisiones, escalamiento e historial (Fase 1-2)

| Operación | Descripción |
|-----------|-------------|
| `POST /third-parties/{id}/decisions` | Registrar decisión (estado, origen, vigencia, fundamento). Requiere permiso de decisión + alcance ACTUAR. |
| `POST /evaluations/{id}/escalate` | Escalar a nivel superior. Requiere `eval.escalate`. |
| `GET /third-parties/{id}/history` | Historial completo proyectado por permisos. |
| `POST /exports` | Exportar en nivel ≤ autorizado. Queda en auditoría. |
| `GET /audit` | Consulta de trazabilidad. Requiere `audit.view`. |

---

## 10. Historias de usuario y criterios de aceptación

*(Sección presente en el DOCX original; trasladada al Anexo Backlog HU del procedimiento de refactoring para no duplicar: ver [REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md](#).)*

---

## 11. Casos de referencia mapeados a configuración

| Caso | Configuración que el modelo debe soportar |
|------|-------------------------------------------|
| **Rheem** | Solo RRHH y Compliance con `party.query.pn` (sensible, explícito). El resto sin acceso a PN. Confirma `deny-by-default` de PN. |
| **Clínica Dávila** | Compras: tipo de tercero = PJ, nivel_info = `RESULTADO_GENERAL`. Compliance: PN + PJ, nivel_info hasta detalle autorizado. Mismos roles base, distinto perfil. |
| **Easy (arriendo)** | Operativo sucursal: nivel=semáforo, adjunta Carpeta Tributaria y escala. Jefatura: reporte general, revisa escalados y aprueba/rechaza en su alcance ACTUAR. Central: detalle autorizado + decisión final. Decisión asociada al RUT, visible desde otra sucursal respetando permisos. |
| **UDLA** | Solicitante inicia solicitud con antecedentes básicos **sin acceso al detalle**. Luego evaluación, revisión de excepciones y aprobación por otros perfiles. Confirma separación **iniciar / evaluar / decidir**. |

---

## 12. Requisitos no funcionales

| Atributo | Requisito |
|----------|-----------|
| **Aislamiento multi-tenant** | Ningún dato cruza entre organizaciones. Toda consulta filtra por `organizacion_id` de forma obligatoria en la capa de datos. |
| **Seguridad de permisos sensibles** | Requieren doble intención: otorgante con `admin.grant_sensitive` + marca `sensible_confirmado`. `Deny-by-default` en todo el sistema. |
| **Auditabilidad** | Registro inmutable de acciones relevantes con **quién / qué / sobre qué / cuándo**, y valor anterior/nuevo en cambios sensibles. |
| **Rendimiento de autorización** | Resolución de permiso efectivo + alcance **cacheable por usuario**; invalidarse al cambiar roles/permisos/alcances. |
| **Trazabilidad de decisiones** | Toda decisión conserva origen (auto/manual), responsable y vigencia; decisiones históricas **no se sobrescriben, se versionan**. |
| **Escalabilidad del modelo** | Estructura organizacional (árbol de UO) y alcances soportan desde clientes mono-país simples hasta multi-país con múltiples niveles. |
| **Extensibilidad** | Nuevos productos, capacidades, tipos de tercero, estados o permisos se agregan **por catálogo**, sin cambiar el motor. |

---

## 13. Decisiones pendientes (a confirmar con negocio)

| ID | Pregunta abierta | Recomendación de diseño |
|----|------------------|-------------------------|
| **D-01** | ¿Usuarios nuevos quedan sin permiso PN hasta otorgamiento explícito? | Sí (deny-by-default). Confirmar. |
| **D-02** | ¿Motivo/contexto de consulta obligatorio para toda consulta de PN? | Obligatorio para PN; opcional para PJ. Definir catálogo de motivos. |
| **D-03** | ¿Etiquetas requieren mismos niveles de privacidad que comentarios? | Reusar modelo de visibilidad (general/restringida). Confirmar alcance. |
| **D-04** | ¿Alcance de UNIDAD incluye automáticamente sub-UO descendientes? | Configurable por entrada (`incluye_descendientes`). Definir valor por defecto. |
| **D-05** | ¿Tope individual de consumo es bolsa separada o solo límite de control? | Solo límite por defecto; bolsa separada como opción futura. |
| **D-06** | ¿Un usuario puede pertenecer a más de una UO o área simultáneamente? | Modelo permite multi-pertenencia; confirmar si se habilita en MVP. |
| **D-07** | ¿Existen denegaciones individuales explícitas (DENY) o solo concesiones? | Sí, DENY explícito con prioridad. Recomendado para casos de excepción. |
| **D-08** | ¿Roles base son plantillas copiables o vínculos vivos que actualizan al usuario? | Plantillas de arranque; permiso efectivo lo fija la configuración individual. |
| **D-09** | ¿Qué formato de identificación se admite para terceros extranjeros? | Definir validación por país. Indexar `identificacion` normalizada. |
| **D-10** | ¿Niveles de escalamiento (operativo/jefatura/central) fijos o configurables por cliente? | Configurables por organización; el workflow es Fase 3. |

---

## Anexo A — Trazabilidad funcional → técnica

| Bloque del documento funcional | Sección técnica |
|--------------------------------|-----------------|
| Estructura organizacional (organización/país/UO/área) | 5.2 |
| Principio de perfilamiento combinado | 3.1 – 3.2 |
| Las ocho preguntas del perfilamiento | 3, 5.4, 7 |
| Productos y capacidades habilitadas | 5.4 (usuario_producto) |
| Tipo de tercero y protección de personas naturales | 5.4, 6.3, 8.1 |
| Nivel de información (Fast Check / Deep Check) | 5.4, 6.4 |
| Acciones permitidas | 7.1 (catálogo) |
| Alcance de visualización vs. actuación | 3.3, 5.4, 6.2 |
| Rol/capacidad de Solicitante | 8.6 (HU-08), 9.3 |
| Participación en procesos / workflow | 4 (Fase 3), 8.5 |
| Resultado de riesgo vs. decisión del cliente | 8.2 |
| Estados de decisión y vigencia | 5.5, 8.3 |
| Decisión automática/manual/mixta | 8.5 |
| Escalamiento | 5.5, 8.4 |
| Registro y consulta de terceros por RUT | 5.5, 9.3 |
| Vista resumida y nivel de evaluación requerido | 6.4, 9.3 |
| Frontera con catálogo DUXITER | 8.10 |
| Exportación multinivel | 8.7 |
| Comentarios y etiquetas | 5.6, 8.6 |
| Historial del tercero | 5.5, 9.4 |
| Administrador General y capacidades | 7.2, 8.9 |
| Gobierno del modelo de riesgo | 7.1, 8.8 |
| Auditoría y trazabilidad | 5.8, 8 (transversal) |
| Roles base | 7.2 |

---

> Fin del documento. Esta especificación es un borrador técnico para revisión; las Decisiones pendientes (Sección 13) deben confirmarse con negocio antes de cerrar el alcance de cada fase.
