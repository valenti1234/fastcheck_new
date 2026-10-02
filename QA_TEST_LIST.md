# Lista de Pruebas QA — Solo Frontend Web
> **Destinatario**: Persona encargada de validar las funcionalidades web desde el navegador (no requiere conocimientos de código, backend ni consola del servidor).  
> Versión: 2.0 · Fecha: 01.10.2026 · Ámbito: Toda la aplicación Web (Dashboard, Evaluaciones, Consultas, Fast Check EX, Listas Propias, Usuarios, Configuración, Deep Check)  
> Idioma: Español · Responsable: QA / Product Owner

---

## Convenciones

| Estado | Significado |
|--------|-------------|
| 🟢 PENDIENTE | Caso de prueba por ejecutar |
| 🟡 EN CURSO | Ejecución en progreso |
| ✅ APROBADO | Cumple los criterios de aceptación |
| ❌ RECHAZADO | No cumple; informar con pasos y captura de pantalla |
| ⚠️ OBSERVADO | Desviación menor, no bloqueante |

---

## 🔧 Pre-requisitos (Antes de Empezar)

| # | Requisito | Cómo comprobarlo |
|---|-----------|-------------------|
| P1 | Tener un usuario de tipo **Administrador** o **Usuario Regular** válido | Poder iniciar sesión correctamente con tu correo y contraseña |
| P2 | Los créditos disponibles son > 0 al iniciar la prueba (se ven en la página *Evaluación Individual*) | Al entrar verás un número mayor que 0 en *Creditos disponibles: N* |
| P3 | El navegador sea Chrome / Edge / Firefox en su versión actual | (No se requieren extensiones especiales) |
| P4 | Abrir **Herramientas de Desarrollador → Consola** (tecla F12) para detectar mensajes de error en rojo durante la prueba | Si no sabes usarlo, basta con comprobar que no aparezcan pantallas blancas ni bloqueos inesperados |

---

## MÓDULO 1 — Página de Consultas (Listado histórico)

> Página a la que accedes desde el menú izquierdo **“Consultas”**.

### 1.1 Carga inicial y paginación

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| C-001 | Abrir la lista | Ir a **Consultas** en el menú izquierdo | Se muestra la tabla con los resultados históricos; al principio puede verse un “cargando” breve | La página se ve completa en menos de 5 segundos; NO hay pantalla blanca ni error visible | 🟢 | | | | |
| C-002 | Ir a la página siguiente | Hacer clic en el botón Siguiente (⏭) al pie de la tabla | Se recargan los datos con los registros de la página 2 | La página no se recarga entera, solo cambian los datos de la tabla | 🟢 | | | | |
| C-003 | Volver a la página anterior | Estando en la página 2, clic en Anterior (⏮) | Vuelve a mostrar los mismos resultados de la primera carga | El orden y las filas coinciden con lo que viste al principio | 🟢 | | | | |
| C-004 | Exportar Excel | Clic en **Exportar Excel** (arriba a la derecha, junto a los filtros) | Se descarga un archivo `.xlsx` con el nombre `Consultas_Duxiter_YYYY-MM-DD.xlsx` | Abrir el archivo y comprobar que tiene columnas: RUT, Razón Social, Fecha Consulta, Nivel Riesgo, Etiquetas | 🟢 | | | | |

---

### 1.2 Filtros y Búsqueda

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| C-010 | Buscar por RUT con guion | Escribir en el buscador: `17752947-8` → Aplicar filtros | La tabla muestra solo los resultados cuyo RUT contiene `17752947` | Funciona tanto si escribes puntos (`17.752.947-8`) como si no | 🟢 | | | | |
| C-011 | Buscar por RUT sin DV | Escribir solo el cuerpo: `17752947` (sin el `-8`) | Se muestra el MISMO resultado que en C-010 | Se encuentra aunque omitas el dígito verificador | 🟢 | | | | |
| C-012 | Buscar por nombre / razón social | Escribir parte del nombre de una empresa conocida | Aparecen solo los resultados que incluyen ese texto | No distingue mayúsculas/minúsculas | 🟢 | | | | |
| C-013 | Filtrar por rango de fechas | Seleccionar fecha “Desde” y “Hasta” en las fechas de los filtros → Aplicar | Solo aparecen consultas hechas ENTRE esas dos fechas (ambos días incluidos) | Las dos fechas límite se incluyen en el filtro | 🟢 | | | | |

---

### 1.3 Abrir una consulta histórica (navegación → detalles)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| C-020 | Clic en una fila cualquiera | Dentro de la tabla de Consultas, haz clic en cualquier fila (en el RUT o nombre) | Te lleva a la página de detalle (Fast Check EX) con el informe de esa evaluación | El RUT y nombre que aparecen en el encabezado del detalle COINCIDEN con la fila donde clicaste | 🟢 | | | | |
| C-021 | Botón Volver | Una vez dentro del detalle, clic en “Volver” o en el botón atrás del navegador | Regresas al listado y se mantienen los filtros y la página donde estabas | No te devuelve a la página 1 ni borra tu búsqueda | 🟢 | | | | |

---

## MÓDULO 2 — Página “Evaluación Individual” (Bug Fix RUT — 01.10.2026)

> Página accesible desde el menú izquierdo **“Evaluación Individual”**.  
> **Objetivo principal del fix del 01/10**: comprobar que ahora PUEDES ESCRIBIR UN RUT ENTERO (7-8-9 dígitos) sin que el input se quede atascado, y que PUEDES BORRAR caracteres (backspace/delete) cuando el RUT está completo.

---

### 2.1 Configuración Previa — Solo para este módulo

| # | Requisito | Cómo comprobarlo |
|---|-----------|-------------------|
| P6 | El recuadro de términos (“Acepto los términos y condiciones…”) empieza SIN marcar | Es normal; no bloquea que escribas el RUT — solo bloquea el botón de evaluación |
| P7 | Los créditos disponibles se ven > 0 | (Mismo que P2 global) |

---

### 2.2 ✍ Pruebas de ESCRITURA del RUT (antes se trababa a 2 dígitos)

| ID | Caso de Prueba | Pasos a mano en el input “RUT del Proveedor” | Resultado Esperado | Criterio de Aceptación (BLOQUEANTE en W-002) | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|----------------------------------------------|---------------------|------------------------------------------------|--------|--------|-------------|----------|--------------------------------------|
| W-001 | 1 dígito | Borra lo que haya y escribe solo: `7` | Muestra `7` (1 carácter) | No aparece ningún guion ni dígito extra | 🟢 | | | | |
| W-002 | 2 dígitos | Escribe `12` después de W-001 | Muestra **`12`** (solo 2 dígitos) | **¡IMPORTANTE! No debe mostrar `12-9` con guion.** Con menos de 8 dígitos el guion no debe aparecer hasta que tú lo escribas o llegues a dígito 9 | 🟢 | | | | |
| W-003 | 7 dígitos | Escribe `1234567` (7 dígitos seguidos) | Muestra `1234567` (7 dígitos, solo números) | Sin guion, sin puntos ni signos | 🟢 | | | | |
| W-004 | 8 dígitos | Escribe `76086428` (8 dígitos). Después clic fuera del input (blur). | ✅ Mientras escribes → `76086428` juntos / borde neutro GRIS.  ✅ Después blur → sigue igual (`76086428`) — el formato PUNTOS+GUION sólo aparece cuando hay 9+ dígitos (8 cuerpo + DV), no antes. | El pretty print **NO** se aplica aún; se necesita al menos un DV para poder hacer `XX.XXX.XXX-DV`. | 🟢 | | | | |
| W-005 | 9 dígitos seguidos (RUT nuevo completo) | Después de `76086428`, escribe un `5` (total `760864285`).  ⚠️ **LUEGO**: haz clic FUERA del campo (pierde foco / pulsa TAB). | Durante escritura del 9º dígito → se ve `760864285` (sin puntos, sin guion, borde GRIS).  ✅ **Después del blur** → el valor se convierte en **`76.086.428-5`** (puntos y guion).  Borde VERDE ✔ + check verde. | **NO debe mostrar el formato `76.086.428-5` mientras sigues escribiendo; sólo cuando sales del campo** (onBlur). | 🟢 | | | | |
| W-006 | Termina en “k” minúscula | Borra todo y escribe `12345678k`.  ⚠️ **Después: clic FUERA del input** (pierde foco / TAB). | ✅ Mientras escribes → `12345678k` raw / borde gris.  ✅ Después del blur → **`12.345.678-K`** formateado. | La “k” sólo se pasa a mayúscula **onBlur**, no antes. El DV visualmente coincide con lo que escribiste (no corregido silenciosamente). Si matemáticamente no coincide, después de blur el borde se pone ROJO. | 🟢 | | | | |
| W-007 | Pegar RUT numérico sin formato | Copia `760864285` → Ctrl+V en el input. ⚠️ Luego **clic fuera** (pierde foco). | Después del pegado (antes blur) → se ve el texto raw pegado.  ✅ Después de blur → **`76.086.428-5`** formateado. | No se pierde ningún dígito del texto pegado. El formato bonito (puntos/guion) se retrasa a blur, igual que la escritura a mano. | 🟢 | | | | |
| W-008 | Pegar RUT con formato extraño | Copia `12-345-678-5` (muchos guiones) → pégalo.  ⚠️ Después: clic fuera / blur. | Antes blur → se ve como hayas pegado.  ✅ Después blur → normaliza a **`12.345.678-5`** (1 solo guion + puntos). | Se limpian los separadores de sobra pero **sólo cuando pierde foco**. | 🟢 | | | | |

---

### 2.3 ⌫ Pruebas de BORRADO (Backspace / Delete — antes no dejaba borrar RUTs válidos)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación (BLOQUEANTE en B-001/B-002) | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|------------------------------------------------|--------|--------|-------------|----------|--------------------------------------|
| B-001 | Borrar el DV (último número) de un RUT VERDE | (1) Escribe `12.345.678-5` y **haz clic FUERA** para activar formato+verde.  (2) Regresa al input, cursor al final y pulsa **⌫ BACKSPACE** 1 vez. | El valor pasa a ser **`12345678`** (solo cuerpo; sin puntos/guion). Durante la escritura (tienes foco) el borde se vuelve GRIS (no verde, no rojo). | **NO debe reaparecer el `-5` después del backspace.** Borrado escribe estado RAW; si luego **sales con blur** y es inválido → puedes poner borde ROJO (aceptable). | 🟢 | | | | |
| B-002 | Borrar el guion de un RUT VERDE | (1) RUT VALIDO, blur para tener verde. (2) Vuelve a entrar, cursor entre `8` y `-` → pulsa ⌫ 1 vez. | Mientras sigues dentro del input → muestra solo **`123456785`** (números juntos, sin puntos ni guion, borde gris). | **NO debe reinsertarse el guion y los puntos mientras estás escribiendo.** El pretty print sólo vuelve a aparecer **después de blur** (clic fuera). | 🟢 | | | | |
| B-003 | Borrar 3 caracteres seguidos | Haz B-001. Luego pulsa ⌫ 2 veces más | Muestra `123456` | Cada pulsación borra un carácter del cuerpo sin que aparezcan signos de vuelta | 🟢 | | | | |
| B-004 | Borrar un dígito del CENTRO del cuerpo | En `12.345.678-5`, pon el cursor ENTRE `5` y `6` (de “345678”) → ⌫ 1 vez (borra el `5`) | Queda con 7 dígitos + DV; el carácter se borra correctamente | No se rellena el hueco con un número “recalculado” por error | 🟢 | | | | |
| B-005 | Borrar TODO | Selecciona todo (Ctrl+A) → pulsa **SUPR / DELETE** | El input queda TOTALMENTE vacío (se ve el texto del placeholder “RUT del Proveedor”) | No debe quedar “1 dígito suelto” ni un guion olvidado | 🟢 | | | | |
| B-006 | Sobrescribir selección | En `12.345.678-5`, selecciona con el ratón la parte final `678-5` y escribe: `00` | Queda solo `12.345.00` o `1234500` y el DV anterior no se conserva | Se borra la selección y se escriben los nuevos caracteres | 🟢 | | | | |
| B-007 | Borrar con DEL (tecla Delete, flecha derecha) | Repite B-001 pero usando la tecla DEL en lugar de ⌫ | El carácter se borra igual que con Backspace | Ambos botones funcionan | 🟢 | | | | |

---

### 2.4 🟢🔴 Formato y validación visual (colores del borde + icono check)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| F-001 | RUT correcto de 8 dígitos | Escribe `76.086.428-5` (o la versión raw `760864285`). ⚠️ **Finalmente: CLIC FUERA del input (blur).** | ✅ Mientras escribes → borde GRIS, sin check.  ✅ Después de blur → se formatea a `76.086.428-5` y borde **VERDE** + ✔ check verde. | **Validez y color verde NO aparecen mientras escribes; sólo al perder el foco.** | 🟢 | | | | |
| F-002 | RUT correcto 7 dígitos + K | Escribe `1000005K`. Después **clic fuera** (blur). | Mientras escribes → raw. Después blur → se convierte en **`1.000.005-K`** y borde **VERDE** ✔ (K mayúscula). | El K se normaliza a mayúsculas y el borde se pone VERDE — pero **sólo después de blur**. | 🟢 | | | | |
| F-003 | RUT con DV ERRÓNEO (sabiendo que es incorrecto) | Escribe `12.345.678-9` (DV correcto = `-5`). Después **haz clic FUERA del input (blur)**. | ✅ Mientras escribes → borde GRIS (sin rojo, sin verde).  ✅ Después de blur → borde **ROJO** ✕ o mensaje “RUT inválido”; el valor se muestra formateado con `-9` (tu DV erróneo visible). | **No debe poner ROJO mientras el usuario todavía está digitando el DV.** El rojo llega **sólo al perder el foco**. El DV que el usuario escribió (aunque sea `-9` erróneo) SE MANTIENE en pantalla (no silenciosamente corregido a -5). | 🟢 | | | | |
| F-004 | Formato automático (puntos de miles) | Escribe `12345678-5` (solo 1 guion, sin puntos).  Después **clic FUERA (blur)**. | ✅ Mientras escribes → el texto sigue como lo escribiste (sin puntos).  ✅ Después blur → pasa a **`12.345.678-5`** (puntos de miles añadidos). | Puntos se aplican sólo en blur; el usuario escribe sin alteraciones. | 🟢 | | | | |
| F-005 | Caso “8 dígitos sin guion” (fix regresión 29.09) | Escribe SOLO `20779347` (8 díg.) y luego añade `7` (total `207793477`).  Luego **clic FUERA (blur)**. | Mientras escribes → texto raw `207793477` y borde neutro.  ✅ Después de blur → se formatea correctamente en **`20.779.347-7`** (8 dígitos cuerpo, no 7). | **NO debe formatear como `2.077.934-7`** (antiguo bug 7 dígitos cuerpo). El pretty-print se aplica onBlur, no a mitad de escritura. | 🟢 | | | | |
| F-006 | RUT irrisorio de 1 dígito + guion | Escribe `1-9`. Luego **clic FUERA (blur)**. | Mientras escribes → `1-9` raw, borde gris.  Después blur → se pone **ROJO** (marcado inválido) ✕. | **No marca ROJO mientras escribes; espera a blur.** (Si hiciera rojo inmediatamente tras escribir el 9, el formateador onBlur antiguo sería fantasma). | 🟢 | | | | |
| F-007 | Ceros iniciales de más | Escribe `000123456785`. Después **clic FUERA (blur)**. | Mientras escribes → texto tal cual.  Después blur → limpia a **`12.345.678-5`** y normaliza. | Limpieza ceros sólo se aplica onBlur. | 🟢 | | | | |
| F-008 | Input vacío o solo espacios | Borra todo y deja vacío | Muestra el texto placeholder; si intentas evaluar te avisa que el campo es obligatorio | No hay bloqueos ni pantallas blancas | 🟢 | | | | |

---

### 2.5 🖱 Botón “Evaluar Proveedor” — habilitaciones

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| I-001 | RUT válido + términos SIN marcar | RUT VERDE ✔ (ej. `76.086.428-5`); checkbox “Acepto términos” DESMARCADO | El botón **Evaluar Proveedor** está GRIS y NO se puede pulsar | Se requieren AMBAS cosas (RUT OK + términos OK) | 🟢 | | | | |
| I-002 | RUT inválido + términos MARCADOS | RUT ROJO (ej. `12.345.678-9`); checkbox ON | Botón sigue deshabilitado | Solo se activa cuando el RUT es VÁLIDO | 🟢 | | | | |
| I-003 | Ambos OK | Corrige el RUT a `12.345.678-5` + marca términos | El botón se ilumina de COLOR PRIMARIO (azul o verde) y puedes pulsarlo | Cursor mano al pasar el ratón | 🟢 | | | | |
| I-004 | Pulsar y esperar 2 segundos | Clic en Evaluar Proveedor | El botón se deshabilita momentáneamente y/o muestra un “cargando” | Solo se envía una única petición; no hace doble evaluación aunque hagas doble clic rápido | 🟢 | | | | |
| I-005 | Nombre autocompletado | Después de una evaluación exitosa | El campo “Nombre del Proveedor” se rellena con la Razón Social de la empresa | Puedes modificarlo manualmente después | 🟢 | | | | |
| I-006 | Copiar desde Excel / texto con espacios | En otro sitio copia `76 086 428 - 5` (con espacios) y pégalo | Lo interpreta y muestra como **`76.086.428-5`** (borde VERDE) | Los espacios alrededor del guion no molestan | 🟢 | | | | |

---

### 2.6 ⌨ Teclado y navegación (casos raros)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| E-001 | Pasar al siguiente campo con TAB → ¡triggers blur automático! | Escribe `760864285` (sin formato) → ⚠️ NO pulses clic fuera → directamente pulsa **TAB** para ir al campo Nombre. | TAB dispara implícitamente onBlur.  Por tanto: al salir al campo Nombre → el RUT se formatea en **`76.086.428-5`** y marca borde VERDE ✔ sin tener que hacer clic manualmente. | El TAB funciona como “confirmación de escritura” (blur implícito). Es normal y deseado. | 🟢 | | | | |
| E-002 | Pulsar ENTER dentro del input (sin blur previo) | Escribe un RUT correcto (ej `760864285`).  **Marca términos.**  ⚠️ SIN hacer clic fuera (sin blur) pulsa ENTER directamente dentro del input. | El submit **no se bloquea** por falta de blur: el backup en `handleSubmit` aplica la validación on-the-fly si isValidRut aún es null.  Si el RUT es OK → evalúa normalmente; si es RUT inválido → toast.  Además, al terminar el submit el RUT queda con el formato pretty (ya que finalRutFormatted se guarda). | **Comportamiento antiguo era válido sin blur pero ahora funciona gracias a la guardia adicional en handleSubmit que valida antes de mostrar toast.** No hay que pedirle al usuario que haga clic fuera para proceder. | 🟢 | | | | |
| E-003 | Pulsar ESCAPE | Pulsa ESC dentro del input RUT | Saca el foco; NO cambia ningún valor ni envía nada | — | 🟢 | | | | |
| E-004 | Mover cursor con flechas izquierda/derecha | Flechas ← / → dentro del input | No se borran ni añaden caracteres; solo se mueve el cursor | — | 🟢 | | | | |
| E-005 | HOME / END | Pulsa HOME y luego END dentro del input | Cursor va al principio, luego al final; valor intacto | — | 🟢 | | | | |
| E-006 | Copiar / Cortar / Pegar | Ctrl+C, Ctrl+X, Ctrl+V | Funcionan como un campo de texto normal; no se duplican signos | — | 🟢 | | | | |
| E-007 | Selección + arrastrar texto (Drag & Drop) | Selecciona parte del RUT y arrástralo a otra posición | No aparecen caracteres duplicados ni DV fantasma | Es aceptable que el formateo solo se aplique al terminar el arrastre | 🟢 | | | | |
| E-008 | En móvil / teclado táctil | Escribir RUT usando el teclado en pantalla | Los valores se escriben bien al seleccionar la palabra candidata del autocorrector | No se disparan envíos extra ni se cortan caracteres | 🟢 | | | | |

---

## MÓDULO 3 — Página “Fast Check EX” (Detalle de evaluación)

> Accedes haciendo clic en cualquier fila de “Consultas” o inmediatamente después de “Evaluar Proveedor”.
> **Bug Fix del 30/09**: la empresa PRINCIPAL de la evaluación no debe volver a aparecer entre los “Socios Históricos”.

### 3.1 Carga correcta desde el listado

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| FC-001 | Abrir un detalle conocido | Ir a Consultas → clic en una fila | Se abre la página Fast Check EX; el RUT/encabezado coinciden | NO hay pantalla blanca; no tarda más de 10 s | 🟢 | | | | |
| FC-002 | Scroll completo por toda la página | Desplázate hasta abajo usando rueda ratón / barra | Todas las secciones se renderizan; no hay huecos en blanco raros | No se vean tarjetas vacías duplicadas | 🟢 | | | | |

---

### 3.2 Socios Históricos — Verificación Bug Fix

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| FC-010 | Revisar Socios Históricos tras el fix | En la página Fast Check EX, localiza la tarjeta/sección **Socios Históricos**; copia el RUT de la empresa PRINCIPAL que aparece en el GRAN ENCABEZADO (arriba, grande) y busca ese mismo RUT dentro de la lista de Socios Históricos | **NO DEBE APARECER** el RUT principal dentro de los Socios Históricos | El buscador del navegador (Ctrl+F) por el RUT principal debe encontrarlo 1 sola vez en todo el bloque (el encabezado), 0 veces dentro del listado de socios | 🟢 | | | | |
| FC-011 | Más de 10 socios | Si la empresa tiene muchos socios, revisa la paginación o scroll dentro del bloque de socios | Carga los socios que falten; la ausencia del principal se mantiene | — | 🟢 | | | | |

---

### 3.3 Listas Propias (Alto/Medio Impacto)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| FC-020 | Bandera Listas Propias en evaluación NUEVA | Haz una evaluación nueva (Evaluación Individual) de una empresa que SABES que está en Lista Propia Alto/Medio Impacto | En Fast Check EX aparece la etiqueta/bandera correspondiente; el nivel de riesgo refleja ese impacto | — | 🟢 | | | | |
| FC-021 | Lectura de histórico inmutable (no debe cambiar flags) | Abre una consulta HISTÓRICA vieja (meses atrás) de una empresa que hoy NO está en Lista Propia pero SÍ lo estaba en aquel momento, o viceversa | Las banderas / estado de Listas Propias que se muestran SON LAS QUE HABÍAN EN FECHA DE LA CONSULTA, NO las actuales | No hay “sincronización automática” al consultar históricos (era el bug viejo — fix 30/09) | 🟢 | | | | |

---

### 3.4 Malla societaria — Grafo de nodos

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| FC-030 | Visualizar grafo | En la sección malla societaria / “Mapa Empresas Controladas” | Se ve un diagrama con nodos y flechas; se distingue la empresa principal | Las dimensiones del grafo son > 0 (no aparece un recuadro en blanco 0×0) | 🟢 | | | | |
| FC-031 | Zoom manual + arrastre | Haz zoom con la rueda; arrastra un nodo a otra posición | Se actualiza la vista; NO hay reseteo indeseado a la vista inicial | SOLO debe ajustar la vista cuando tú clicas explícitamente un botón “ajustar vista” (si existe) | 🟢 | | | | |
| FC-032 | Flecha inversa detectada (relación bidireccional) | La fuente de datos reporta solo `EMPRESA A → SOCIO X` (un solo sentido) | En el grafo deberías poder “ver” también la relación inversa (leyenda adecuada) o por lo menos NO hay duplicados extraños por nombre con/sin acento | Los nombres con acento y sin acento se fusionan en un único nodo (no aparecen 2 nodos iguales por variante de acento) | 🟢 | | | | |

---

## MÓDULO 4 — Menú “Listas Propias Alto/Medio Impacto”

> Gestión manual de empresas marcadas.

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| LP-001 | Añadir empresa a Lista Propia Alto Impacto | Abrir Listas Propias Alto Impacto → Añadir → RUT + nombre + motivo → Guardar | Aparece una fila nueva en la tabla; el conteo total en la cabecera se incrementa en +1 | Si vuelves a Consultas/FastCheck para ese RUT, la bandera aparece | 🟢 | | | | |
| LP-002 | Eliminar la misma empresa | Clic en Eliminar / Papelera en la fila nueva | Se elimina; la tabla se actualiza y el número total vuelve a bajar | Después de un rato / refresh, el registro sigue estando eliminado | 🟢 | | | | |
| LP-003 | Lista Mediano Impacto (comprobación idéntica) | Repetir LP-001 en la sección Mediano Impacto | Mismos resultados | — | 🟢 | | | | |
| LP-004 | Búsqueda interna dentro de la lista | Busca por RUT dentro de Lista Propia | Encuentra la fila aunque escribas sin puntos | — | 🟢 | | | | |

---

## MÓDULO 5 — Menús laterales generales

### 5.1 Dashboard

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| D-001 | Carga inicial | Clic en Dashboard en menú | Se muestran tarjetas: Consultas del mes, Nivel Riesgo promedio, Créditos, etc. | Las tarjetas no muestran NaN, undefined, null, valores en blanco | 🟢 | | | | |
| D-002 | Filtros temporales | Cambiar periodo (mensual / semanal) en Dashboard | Los totales se recalculan acorde al periodo | Sin errores de consola | 🟢 | | | | |

### 5.2 Evaluación Masiva

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| EM-001 | Subir CSV / TXT con varios RUTs | En **Evaluación Masiva**, sube un archivo con varios RUTs (uno por línea) | Se muestra el progreso; no crashea si uno de los RUTs es inválido | Al final aparece el botón de descarga del informe consolidado | 🟢 | | | | |
| EM-002 | Columna N no se bloquea | Esperar que termine masiva de ~5+ registros | Cada fila termina en éxito/error; el listado no se congela | — | 🟢 | | | | |

### 5.3 Usuarios (solo si eres Administrador)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| U-001 | Crear usuario nuevo (si permiso) | Ir a Usuarios → Nuevo → Rellenar datos | Usuario creado; puede iniciar sesión | Contraseña temporal visible o correo enviado | 🟢 | | | | |
| U-002 | Desactivar usuario | Clic en Desactivar en un usuario no administrador | El usuario ya NO puede iniciar sesión; no se borra el histórico | — | 🟢 | | | | |

### 5.4 Configuración

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| CF-001 | Modificar umbrales de nivel de riesgo | Ir a Configuración; cambiar umbrales (verde/amarillo/rojo) → Guardar | Al volver a entrar, los valores se han guardado; los colores se reflejan en evaluaciones nuevas | NO afecta el color de los históricos (se conserva el color del día) | 🟢 | | | | |
| CF-002 | Modo oscuro (si existe) | Toggle modo oscuro (abajo) | El tema cambia inmediatamente | Si haces refresh, persiste tu preferencia | 🟢 | | | | |

### 5.5 Historial de Consultas (aparte del listado principal)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| H-001 | Coincide con el módulo Consultas | Abrir Historial de Consultas en menú | Los mismos filtros y datos que en módulo Consultas | Si no existen diferencias entre ambos menús, marcar ✅ (solo duplican vista) | 🟢 | | | | |

---

## MÓDULO 6 — Evaluación Masiva + Deep Check

| ID | Caso de Prueba | Pasos | Resultado Esperado | Criterio de Aceptación | Estado | Tester | Data / Ora | Ambiente | Note (Bug / Screenshot: link o path) |
|----|----------------|-------|---------------------|-------------------------|--------|--------|-------------|----------|--------------------------------------|
| DC-001 | Entrar a Deep Check | En menú → Deep Check | Muestra explicación del servicio y si está disponible (coste de créditos distinto) | — | 🟢 | | | | |
| DC-002 | Consulta Deep Check sobre un proveedor ya analizado | Rellenar formulario | Inicia análisis; no crashea aunque la fuente externa no esté disponible | Si hay un error controlado por la API, se muestra mensaje; pantalla NO en blanco | 🟢 | | | | |
| DC-003 | Botones Descargar MD / PDF al finalizar | Clic en **Descargar MD** y **Descargar PDF** (arriba, esquina derecha del reporte) | Se descargan ambos archivos; el PDF contiene portada y secciones | El informe en MD se puede abrir en Visor Markdown sin caracteres rotos | 🟢 | | | | |

---

## ✔ Checklist Global de Aceptación

> Marca todo cuando termines la sesión de QA.

- [ ] **No hay pantallas blancas** ni bloqueos permanentes en NINGUNA de las páginas visitadas.
- [ ] **Consola del navegador (F12) sin errores en ROJO** durante los flujos felices (escribir, evaluar, abrir detalle). Pueden aparecer warnings amarillos; son aceptables.
- [ ] **Ninguna evaluación se envía dos veces** (no hay “doble click fantasma” que consuma créditos doble).
- [ ] **Botones de descarga (Excel / MD / PDF)** producen archivos abribles y con contenido coherente.
- [ ] **Fixes prioritarios OK**:
    - [ ] Escribir RUT de 2 dígitos → SIN guion (no “12-9”) → ✅
    - [ ] Borrar último dígito en RUT VERDE → no lo reinserta → ✅
    - [ ] Empresa PRINCIPAL no aparece en Socios Históricos → ✅
    - [ ] Históricos: banderas LP y colores de semáforo NO se actualizan/recalculan al abrir → ✅
- [ ] **Navegación general**: Todo el menú izquierdo (Dashboard, Evaluación Individual/Masiva, Consultas, Historial, Usuarios, Configuración, Listas Propias, Ayuda, Deep Check) se puede abrir sin errores 404.

---
