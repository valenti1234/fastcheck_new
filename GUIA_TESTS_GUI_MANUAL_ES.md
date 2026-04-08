# Guía de Pruebas GUI Manuales - Frontend Duxiter

## Información General

- **Aplicación:** Duxiter Fast Check
- **Versión:** 1.5.22
- **Tipo de Pruebas:** GUI Manuales
- **Objetivo:** Guía para pruebas manuales de interfaz de usuario
- **Idioma:** Español

---

## 1. Introducción a las Pruebas GUI Manuales

### 1.1 Propósito de esta Guía
Esta guía proporciona instrucciones paso a paso para realizar pruebas manuales de la interfaz de usuario de Duxiter, simulando el comportamiento de usuarios reales.

### 1.2 Tipos de Pruebas Manuales
- **Pruebas Funcionales:** Verificar que las funciones trabajen correctamente
- **Pruebas de Usabilidad:** Evaluar la experiencia del usuario
- **Pruebas de Interfaz:** Comprobar elementos visuales y navegación
- **Pruebas de Compatibilidad:** Verificar funcionamiento en diferentes navegadores
- **Pruebas de Responsividad:** Comprobar adaptación a diferentes dispositivos

### 1.3 Preparación del Entorno
- **URL de Pruebas:** `https://duxiter.azurianlab.com/` (desarrollo) o URL de staging
- **Navegadores a probar:** Chrome, Firefox, Safari, Edge
- **Dispositivos:** Desktop, Tablet, Móvil
- **Resoluciones:** 1920x1080, 1366x768, 768x1024, 375x667

---

## 2. Configuración Inicial

### 2.1 Datos de Prueba



### 2.2 Herramientas Necesarias
- **Navegador web** actualizado
- **Herramientas de desarrollador** (F12)
- **Dispositivos móviles** o emulador
- **Cronómetro** para medir tiempos de carga
- **Capturador de pantalla** para evidencias

---

## 3. Pruebas de Autenticación

### 3.1 Prueba de Login Exitoso

#### Pasos:
1. **Navegar** a la página de login: `[URL]/login`
2. **Verificar** que aparezcan los campos:
   - Campo "Email" con placeholder
   - Campo "Contraseña" con placeholder
   - Botón "Iniciar Sesión"
   - Enlace "¿Olvidaste tu contraseña?"
3. **Ingresar** email válido
4. **Ingresar** contraseña válida
5. **Hacer clic** en "Iniciar Sesión"

#### Resultado Esperado:
- Redirección automática al dashboard
- Aparición del menú de navegación
- Mensaje de bienvenida (opcional)
- URL cambia a `[URL]/dashboard`

#### Criterios de Aceptación:
✅ Login exitoso en menos de 3 segundos
✅ Redirección correcta al dashboard
✅ Menú de usuario visible en la esquina superior derecha
✅ No hay mensajes de error

### 3.2 Prueba de Login con Credenciales Inválidas

#### Pasos:
1. **Navegar** a la página de login
2. **Ingresar** email inválido: `usuario@inexistente.com`
3. **Ingresar** contraseña incorrecta: `contraseñaincorrecta`
4. **Hacer clic** en "Iniciar Sesión"

#### Resultado Esperado:
- Mensaje de error: "Credenciales inválidas"
- Permanencia en la página de login
- Campos se mantienen con los valores ingresados
- No hay redirección

#### Criterios de Aceptación:
✅ Mensaje de error claro y visible
✅ No hay redirección
✅ Campos mantienen valores para corrección
✅ Error desaparece al corregir datos

### 3.3 Prueba de Validación de Campos

#### Pasos:
1. **Navegar** a la página de login
2. **Dejar campos vacíos**
3. **Hacer clic** en "Iniciar Sesión"
4. **Verificar** mensajes de validación
5. **Ingresar email con formato incorrecto**: `emailincorrecto`
6. **Verificar** validación de formato

#### Resultado Esperado:
- Mensaje "El email es requerido"
- Mensaje "La contraseña es requerida"
- Mensaje "Formato de email inválido"
- Campos resaltados en rojo

### 3.4 Prueba de Logout

#### Pasos:
1. **Iniciar sesión** con credenciales válidas
2. **Hacer clic** en el menú de usuario (esquina superior derecha)
3. **Seleccionar** "Cerrar Sesión"
4. **Confirmar** logout si aparece modal de confirmación

#### Resultado Esperado:
- Redirección a página de login
- Sesión terminada completamente
- Intento de acceso directo a dashboard redirige a login

---

## 4. Pruebas de Navegación y Dashboard

### 4.1 Prueba de Navegación Principal

#### Pasos:
1. **Iniciar sesión** como administrador
2. **Verificar** presencia del menú principal con opciones:
   - Dashboard
   - Fast Check
   - Evaluaciones
   - Consultas
   - Administración (solo admin)
3. **Hacer clic** en cada opción del menú
4. **Verificar** navegación correcta

#### Resultado Esperado por Sección:

**Dashboard:**
- URL: `[URL]/dashboard`
- Widgets de estadísticas visibles
- Gráficos cargados correctamente
- Datos actualizados

**Fast Check:**
- URL: `[URL]/fast-check`
- Formulario de evaluación visible
- Campo RUT funcional
- Selector de tipo de evaluación

**Evaluaciones:**
- URL: `[URL]/evaluations`
- Lista de evaluaciones
- Filtros funcionales
- Paginación (si aplica)

**Consultas:**
- URL: `[URL]/consultas`
- Historial de consultas
- Opciones de búsqueda

### 4.2 Prueba de Widgets del Dashboard

#### Pasos:
1. **Acceder** al dashboard
2. **Verificar** carga de cada widget:
   - Widget de estadísticas generales
   - Widget de evaluaciones recientes
   - Widget de gráficos de tendencias
   - Widget de alertas (si aplica)
3. **Hacer clic** en botón de actualizar (si existe)
4. **Verificar** actualización de datos

#### Criterios de Verificación:
✅ Todos los widgets cargan en menos de 5 segundos
✅ Datos numéricos son coherentes
✅ Gráficos se renderizan correctamente
✅ No hay errores en consola del navegador
✅ Actualización manual funciona

### 4.3 Prueba de Breadcrumbs

#### Pasos:
1. **Navegar** a Fast Check
2. **Verificar** breadcrumb: "Dashboard > Fast Check"
3. **Navegar** a Evaluaciones
4. **Verificar** breadcrumb: "Dashboard > Evaluaciones"
5. **Hacer clic** en "Dashboard" del breadcrumb
6. **Verificar** navegación de regreso

---

## 5. Pruebas de Fast Check

### 5.1 Prueba de Evaluación Completa

#### Pasos:
1. **Navegar** a Fast Check
2. **Verificar** elementos del formulario:
   - Campo "RUT de la empresa"
   - Selector "Tipo de evaluación"
   - Botón "Iniciar Evaluación"
3. **Ingresar RUT válido**
4. **Seleccionar** tipo: "Evaluación Completa"
5. **Hacer clic** en "Iniciar Evaluación"
6. **Observar** proceso de carga:
   - Indicador de progreso
   - Mensajes de estado
   - Tiempo estimado
7. **Esperar** finalización del proceso
8. **Verificar** resultados mostrados

#### Resultado Esperado:
- Proceso inicia inmediatamente
- Indicador de progreso funcional
- Resultados se muestran al completar
- Score de riesgo visible
- Opciones de descarga disponibles

#### Criterios de Aceptación:
✅ Evaluación completa en menos de 30 segundos
✅ Progreso se actualiza visualmente
✅ Resultados son legibles y completos
✅ Score de riesgo está en rango válido (0-100)
✅ Botones de acción funcionan

### 5.2 Prueba de Validación de RUT

#### Pasos:
1. **Probar RUTs inválidos:**
   - `12.345.678-0` (dígito verificador incorrecto)
   - `123456789` (sin formato)
   - `ABCD1234-5` (caracteres inválidos)
   - Campo vacío
2. **Verificar** mensajes de error para cada caso
3. **Ingresar RUT válido** y verificar que error desaparece

#### Mensajes Esperados:
- "Formato de RUT inválido"
- "Dígito verificador incorrecto"
- "El RUT es requerido"
- "Solo se permiten números y guión"

### 5.3 Prueba de Descarga de Resultados

#### Pasos:
1. **Completar** una evaluación exitosa
2. **Hacer clic** en "Descargar PDF"
3. **Verificar** descarga del archivo
4. **Abrir** PDF descargado
5. **Verificar** contenido del reporte:
   - Logo de la empresa
   - Datos de la evaluación
   - Score de riesgo
   - Detalles por categoría
   - Fecha y hora de generación

#### Criterios de Verificación:
✅ Descarga inicia inmediatamente
✅ Archivo PDF se genera correctamente
✅ Contenido es legible y completo
✅ Datos coinciden con los mostrados en pantalla
✅ Formato profesional del reporte

---

## 6. Pruebas de Fast Check Consolidado

### 6.1 Prueba de Vista Consolidada

#### Pasos:
1. **Navegar** a Fast Check Consolidado
2. **Verificar** elementos de la interfaz:
   - Tabla de resultados
   - Filtros de fecha
   - Filtros de estado
   - Opciones de exportación
3. **Verificar** datos en la tabla:
   - Columnas apropiadas
   - Datos ordenados por fecha
   - Paginación funcional

#### Criterios de Verificación:
✅ Tabla carga con datos existentes
✅ Columnas están bien alineadas
✅ Datos son consistentes
✅ Paginación funciona correctamente

### 6.2 Prueba de Filtros

#### Pasos:
1. **Aplicar filtro por fecha:**
   - Seleccionar fecha "Desde": último mes
   - Seleccionar fecha "Hasta": hoy
   - Hacer clic en "Aplicar Filtro"
2. **Verificar** resultados filtrados
3. **Aplicar filtro por estado:**
   - Seleccionar "Completadas"
   - Verificar filtrado
4. **Combinar filtros** y verificar funcionamiento
5. **Limpiar filtros** y verificar reset

#### Resultado Esperado:
- Filtros se aplican inmediatamente
- Resultados coinciden con criterios
- Combinación de filtros funciona
- Botón "Limpiar" restaura vista completa

---

## 7. Pruebas de Evaluaciones

### 7.1 Prueba de Creación de Evaluación

#### Pasos:
1. **Navegar** a sección Evaluaciones
2. **Hacer clic** en "Nueva Evaluación"
3. **Completar formulario:**
   - Nombre de empresa: "Empresa Test S.A."
   - RUT: "12.345.678-5"
   - Tipo de evaluación: "Completa"
   - Prioridad: "Alta"
   - Comentarios: "Evaluación de prueba"
4. **Subir documento** (si aplica)
5. **Hacer clic** en "Crear Evaluación"

#### Resultado Esperado:
- Formulario se valida correctamente
- Evaluación se crea exitosamente
- Redirección a vista de evaluación
- Mensaje de confirmación

### 7.2 Prueba de Visualización de Resultados

#### Pasos:
1. **Seleccionar** una evaluación completada
2. **Verificar** secciones del reporte:
   - Información general
   - Score de riesgo principal
   - Análisis financiero
   - Análisis legal
   - Análisis comercial
   - Recomendaciones
3. **Verificar** funcionalidad de cada sección
4. **Probar** opciones de exportación

#### Criterios de Verificación:
✅ Todas las secciones cargan correctamente
✅ Datos son consistentes entre secciones
✅ Gráficos se renderizan apropiadamente
✅ Exportación funciona sin errores

---

## 8. Pruebas de Administración

### 8.1 Prueba de Gestión de Usuarios (Solo Administradores)

#### Pasos:
1. **Iniciar sesión** como administrador
2. **Navegar** a Administración > Usuarios
3. **Verificar** lista de usuarios existentes
4. **Hacer clic** en "Agregar Usuario"
5. **Completar formulario:**
   - Nombre: "Usuario Prueba"
   - Email: "prueba@test.com"
   - Rol: "Operador"
   - Contraseña temporal: "temp123"
6. **Guardar** usuario
7. **Verificar** aparición en lista

#### Resultado Esperado:
- Usuario se crea exitosamente
- Aparece en lista con datos correctos
- Email de bienvenida se envía (si aplica)

### 8.2 Prueba de Configuraciones del Sistema

#### Pasos:
1. **Navegar** a Administración > Configuraciones
2. **Verificar** secciones disponibles:
   - Parámetros de evaluación
   - Umbrales de riesgo
   - Configuraciones de notificaciones
   - Configuraciones de integración
3. **Modificar** un parámetro de prueba
4. **Guardar** cambios
5. **Verificar** que cambio se aplica

#### Criterios de Verificación:
✅ Configuraciones cargan valores actuales
✅ Modificaciones se guardan correctamente
✅ Validaciones funcionan apropiadamente
✅ Cambios se reflejan en el sistema

---

## 9. Pruebas de Responsividad

### 9.1 Prueba en Dispositivos Móviles

#### Pasos:
1. **Abrir** aplicación en dispositivo móvil o usar herramientas de desarrollador
2. **Configurar** vista móvil (375x667px)
3. **Verificar** adaptación de elementos:
   - Menú se convierte en hamburguesa
   - Formularios se adaptan al ancho
   - Botones son touch-friendly (mínimo 44px)
   - Texto es legible sin zoom
4. **Probar** navegación móvil
5. **Realizar** evaluación Fast Check en móvil

#### Criterios de Verificación:
✅ Menú hamburguesa funciona correctamente
✅ Formularios son usables en pantalla pequeña
✅ Botones tienen tamaño apropiado para touch
✅ No hay scroll horizontal
✅ Funcionalidad principal se mantiene

### 9.2 Prueba en Tablet

#### Pasos:
1. **Configurar** vista tablet (768x1024px)
2. **Verificar** layout intermedio:
   - Menú puede mantenerse visible
   - Formularios usan espacio eficientemente
   - Tablas se adaptan apropiadamente
3. **Probar** orientación portrait y landscape
4. **Verificar** funcionalidad completa

---

## 10. Pruebas de Compatibilidad de Navegadores

### 10.1 Prueba Multi-Navegador

#### Navegadores a Probar:
- **Chrome** (última versión)
- **Firefox** (última versión)
- **Safari** (si disponible)
- **Edge** (última versión)

#### Pasos por Navegador:
1. **Abrir** aplicación en navegador
2. **Realizar** login
3. **Navegar** por secciones principales
4. **Ejecutar** evaluación Fast Check
5. **Verificar** descarga de PDF
6. **Comprobar** funcionalidad de formularios

#### Criterios de Verificación:
✅ Interfaz se ve consistente
✅ Funcionalidad es idéntica
✅ No hay errores de JavaScript
✅ Rendimiento es aceptable
✅ Descargas funcionan correctamente

---

## 11. Pruebas de Performance

### 11.1 Prueba de Tiempos de Carga

#### Métricas a Medir:
- **Tiempo de carga inicial:** < 3 segundos
- **Tiempo de login:** < 2 segundos
- **Tiempo de navegación:** < 1 segundo
- **Tiempo de evaluación Fast Check:** < 30 segundos
- **Tiempo de generación PDF:** < 10 segundos

#### Pasos:
1. **Limpiar** caché del navegador
2. **Cronometrar** carga inicial de la aplicación
3. **Cronometrar** proceso de login
4. **Cronometrar** navegación entre secciones
5. **Cronometrar** evaluación completa
6. **Cronometrar** generación de reportes

#### Herramientas de Medición:
- Cronómetro manual
- Herramientas de desarrollador (Network tab)
- Lighthouse (opcional)

### 11.2 Prueba de Carga de Datos

#### Pasos:
1. **Acceder** a sección con muchos datos (Evaluaciones)
2. **Verificar** tiempo de carga de lista
3. **Probar** paginación
4. **Verificar** filtros con grandes volúmenes
5. **Comprobar** que interfaz no se bloquea

---

## 12. Pruebas de Accesibilidad

### 12.1 Prueba de Navegación por Teclado

#### Pasos:
1. **Usar solo teclado** para navegar
2. **Probar tecla Tab** para moverse entre elementos
3. **Usar Enter/Espacio** para activar botones
4. **Verificar** que todos los elementos son accesibles
5. **Comprobar** orden lógico de navegación

#### Criterios de Verificación:
✅ Todos los elementos interactivos son accesibles
✅ Orden de navegación es lógico
✅ Focus visible en elemento activo
✅ No hay trampas de teclado

### 12.2 Prueba de Contraste y Legibilidad

#### Pasos:
1. **Verificar** contraste de texto sobre fondos
2. **Comprobar** legibilidad en diferentes tamaños
3. **Verificar** que colores no son el único indicador
4. **Probar** con zoom al 200%

---

## 13. Pruebas de Seguridad Básicas

### 13.1 Prueba de Sesiones

#### Pasos:
1. **Iniciar sesión** en una pestaña
2. **Abrir** nueva pestaña con la aplicación
3. **Verificar** que sesión se mantiene
4. **Cerrar sesión** en una pestaña
5. **Verificar** que se cierra en ambas
6. **Probar** acceso directo a URLs protegidas sin login

#### Resultado Esperado:
- Sesión se mantiene entre pestañas
- Logout afecta todas las pestañas
- URLs protegidas redirigen a login

### 13.2 Prueba de Validación de Inputs

#### Pasos:
1. **Intentar** inyectar código en campos de texto:
   - `<script>alert('test')</script>`
   - `'; DROP TABLE users; --`
   - `../../../etc/passwd`
2. **Verificar** que inputs son sanitizados
3. **Comprobar** que no se ejecuta código malicioso

---

## 14. Checklist de Pruebas por Funcionalidad

### 14.1 Autenticación
- [ ] Login con credenciales válidas
- [ ] Login con credenciales inválidas
- [ ] Validación de campos requeridos
- [ ] Validación de formato de email
- [ ] Logout exitoso
- [ ] Redirección después de logout
- [ ] Protección de rutas sin autenticación

### 14.2 Fast Check
- [ ] Formulario carga correctamente
- [ ] Validación de RUT funciona
- [ ] Evaluación se ejecuta exitosamente
- [ ] Resultados se muestran correctamente
- [ ] Descarga de PDF funciona
- [ ] Manejo de errores apropiado

### 14.3 Evaluaciones
- [ ] Lista de evaluaciones carga
- [ ] Creación de nueva evaluación
- [ ] Visualización de resultados
- [ ] Filtros funcionan correctamente
- [ ] Exportación de datos
- [ ] Paginación (si aplica)

### 14.4 Administración
- [ ] Acceso restringido por rol
- [ ] Gestión de usuarios
- [ ] Configuraciones del sistema
- [ ] Guardado de cambios
- [ ] Validaciones apropiadas

### 14.5 Interfaz General
- [ ] Navegación entre secciones
- [ ] Breadcrumbs funcionan
- [ ] Mensajes de error/éxito
- [ ] Loading states apropiados
- [ ] Responsividad en móvil
- [ ] Compatibilidad de navegadores

---

## 15. Reporte de Errores

### 15.1 Información a Incluir
Cuando encuentres un error, documenta:

**Información Básica:**
- Fecha y hora del error
- Navegador y versión
- Sistema operativo
- Resolución de pantalla
- URL donde ocurrió

**Descripción del Error:**
- Pasos para reproducir
- Resultado esperado
- Resultado actual
- Severidad (Crítico/Alto/Medio/Bajo)

**Evidencias:**
- Capturas de pantalla
- Mensajes de error
- Logs de consola (si aplica)

### 15.2 Clasificación de Severidad

**Crítico:**
- Aplicación no carga
- No se puede hacer login
- Pérdida de datos
- Funcionalidad principal no funciona

**Alto:**
- Funcionalidad importante no funciona
- Errores que afectan flujo principal
- Problemas de seguridad

**Medio:**
- Funcionalidad secundaria no funciona
- Problemas de usabilidad
- Errores visuales menores

**Bajo:**
- Problemas cosméticos
- Mejoras de usabilidad
- Optimizaciones

---

## 16. Mejores Prácticas para Pruebas Manuales

### 16.1 Antes de Empezar
- **Limpiar** caché y cookies del navegador
- **Verificar** que tienes datos de prueba actualizados
- **Preparar** herramientas de captura
- **Revisar** casos de prueba específicos

### 16.2 Durante las Pruebas
- **Documentar** cada paso realizado
- **Capturar** evidencias de errores
- **Probar** casos límite y escenarios negativos
- **Verificar** mensajes de usuario
- **Comprobar** consistencia visual

### 16.3 Después de las Pruebas
- **Compilar** reporte de resultados
- **Priorizar** errores encontrados
- **Comunicar** hallazgos al equipo
- **Verificar** correcciones implementadas

---

## 17. Casos de Prueba Específicos por Rol

### 17.1 Pruebas para Rol Administrador
- Acceso a todas las secciones
- Gestión de usuarios
- Configuración del sistema
- Visualización de reportes completos
- Exportación de datos masivos

### 17.2 Pruebas para Rol Operador
- Acceso limitado apropiado
- Creación de evaluaciones
- Visualización de resultados
- Descarga de reportes individuales
- No acceso a administración

### 17.3 Pruebas para Rol Visualizador
- Solo lectura de datos
- No puede crear/modificar
- Acceso limitado a secciones
- Puede descargar reportes
- No acceso a configuraciones

---

## 18. Escenarios de Prueba Avanzados

### 18.1 Prueba de Concurrencia
- **Abrir** múltiples pestañas
- **Realizar** acciones simultáneas
- **Verificar** consistencia de datos
- **Comprobar** que no hay conflictos

### 18.2 Prueba de Recuperación
- **Simular** pérdida de conexión
- **Verificar** manejo de errores de red
- **Comprobar** recuperación automática
- **Verificar** que datos no se pierden

### 18.3 Prueba de Límites
- **Probar** con datos máximos permitidos
- **Verificar** manejo de archivos grandes
- **Comprobar** límites de caracteres
- **Verificar** timeouts apropiados

---

## 19. Métricas de Calidad

### 19.1 Criterios de Aceptación General
- **Funcionalidad:** 100% de casos críticos pasan
- **Usabilidad:** Tareas principales completables en tiempo esperado
- **Performance:** Tiempos de carga dentro de umbrales
- **Compatibilidad:** Funciona en navegadores objetivo
- **Responsividad:** Usable en dispositivos móviles

### 19.2 Umbrales de Performance
- Carga inicial: < 3 segundos
- Navegación: < 1 segundo
- Evaluación Fast Check: < 30 segundos
- Generación PDF: < 10 segundos
- Respuesta de formularios: < 2 segundos

---

## 20. Contactos y Recursos

### 20.1 Equipo de Desarrollo
- **Frontend Lead:** [Nombre y contacto]
- **Backend Lead:** [Nombre y contacto]
- **QA Lead:** [Nombre y contacto]
- **Product Owner:** [Nombre y contacto]

### 20.2 Recursos Adicionales
- **Entorno de Staging:** [URL de staging]

### 20.3 Herramientas Recomendadas
- **Captura de pantalla:** Lightshot, Snagit
- **Grabación de pantalla:** OBS, Loom
- **Gestión de bugs:** XLS
- **Documentación:** DOC Markdown

---

**Nota:** Esta guía debe actualizarse regularmente conforme evoluciona la aplicación. Última actualización: Septiembre 2025 - Versión 1.5.20

**Importante:** Siempre usar datos de prueba, nunca datos reales de producción durante las pruebas manuales.