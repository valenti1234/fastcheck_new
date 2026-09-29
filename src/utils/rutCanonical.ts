export const RUT_DV_CHARS = '0123456789K';

/**
 * Calcula el Dígito Verificador (DV) de un RUT chileno usando el algoritmo
 * estándar módulo 11 con multiplicadores cíclicos [2..7].
 *
 * @param numericBodyOrRut Cuerpo numérico del RUT (sólo dígitos). Acepta también
 *                        un RUT con/sin guion/puntos; el algorítmo extraerá sólo los
 *                        dígitos ANTES del último carácter (que se asume DV) sólo si
 *                        el último carácter es un DV válido y además el DV coincide
 *                        al recalcular. En la duda, pasa el cuerpo numérico solo.
 * @returns Carácter DV calculado ('0'-'9' o 'K').
 */
export function calculateDvMod11(numericBodyOrRut: string): string {
  if (!numericBodyOrRut) return '0';

  let digits: string;
  const raw = String(numericBodyOrRut).replace(/[^0-9Kk]/g, '').toUpperCase();
  if (raw.length === 0) return '0';

  const lastChar = raw.charAt(raw.length - 1);
  const beforeLast = raw.slice(0, -1);

  if (/^[0-9]+$/.test(raw)) {
    digits = raw;
  } else if (lastChar === 'K' && /^[0-9]+$/.test(beforeLast)) {
    const dvForBody = _mod11(beforeLast);
    const dvForFull = _mod11(raw);
    if (dvForBody === 'K') {
      digits = beforeLast;
    } else if (dvForFull === 'K') {
      digits = raw.slice(0, -1);
    } else {
      digits = beforeLast;
    }
  } else {
    digits = /^[0-9]+$/.test(beforeLast) ? beforeLast : raw.replace(/[^0-9]/g, '');
  }

  return _mod11(digits);
}

function _mod11(digitsOnly: string): string {
  let s = 0;
  let m = 2;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    const d = digitsOnly.charCodeAt(i) - 48;
    if (d < 0 || d > 9) continue;
    s += d * m;
    m = m >= 7 ? 2 : m + 1;
  }
  const rem = 11 - (s % 11);
  if (rem === 11) return '0';
  if (rem === 10) return 'K';
  return String(rem);
}

export interface CanonicalRutResult {
  /** RUT en formato canónico: `Cuerpo-DV` (sin puntos, sin ceros iniciales). */
  canonical: string;
  /** Sólo el cuerpo numérico (sin DV, sin guion, sin ceros iniciales). */
  body: string;
  /** DV calculado/confirmado ('0'-'9' o 'K'). */
  dv: string;
  /** True si el DV de entrada era válido y fue respetado; false si se recalculó. */
  originalDvValid: boolean;
  /** Longitud del cuerpo numérico (7 para RUT antiguos, 8 para RUT modernos). */
  bodyLength: number;
  /** True si el RUT original NO traía separador '-' y la longitud del "limpio"
   *  era 8 dígitos por lo que hubo que desambiguar mediante validación mod11. */
  disambiguatedNoDash: boolean;
}

/**
 * Canonicaliza un RUT chileno resolviendo la ambigüedad que se produce cuando el
 * valor llega SIN GUIÓN y todo numérico.
 *
 * 🚨 El bug clásico: 8 dígitos = `20779347` (Cuerpo = 20779347, DV = 7) si se
 *    trocea como substring(0,-1) da cuerpo `2077934` + DV `7` -> RUT RESULTANTE
 *    `2077934-7` ERRÓNEO: pierde el dígito de las decenas de millar.
 *
 * Estrategia:
 *   1. Limpiar (quitar puntos, espacios, guiones, pasar DV a mayúsculas).
 *   2. Si HAY guion en el original: cuerpo = lado izquierdo numérico, DV = 1 char
 *      derecho; validar DV y si falla recalcular; strip leading zeros cuerpo.
 *   3. Si NO HAY guion:
 *        a. len < 7 -> trivial (cuerpo = digitos, DV recalculado).
 *        b. len == 7: cuerpo dígitos, DV calculado (RUT sin DV explícito).
 *        c. len == 8 o 9: DESAMBIGUACIÓN:
 *           - Hipótesis A: últimos 8/9 dígitos contienen el DV al final.
 *             Probar: body=dgts[0..len-2], dv=dgts[len-1]. Si mod11(body) === dv -> ACEPTAR.
 *           - Hipótesis B: TODO es cuerpo sin DV; calcular DV y agregar.
 *             Si A pasa Y B también pasa (caso borde): preferir A (DV explícito).
 *           - Si A falla y B es numérico -> aplicar B (caso RUT 8cifras, ej. 20779347).
 *        d. len > 9: quitar ceros iniciales mientras siga siendo >8 dígitos; si
 *           tras strip es 8-9 dígitos, volver a (c). Si no, el más largo numérico.
 */
export function canonicalizeChileanRut(input: string | number | null | undefined): CanonicalRutResult {
  if (input == null) return emptyResult();
  const str = String(input);

  const hasDash = /-/.test(str);
  const clean = str.replace(/[^0-9Kk-]/g, '').toUpperCase();

  let body = '';
  let dv = '';
  let originalDvValid = false;
  let disambiguatedNoDash = false;

  if (hasDash) {
    const lastDashIdx = clean.lastIndexOf('-');
    const left = clean.substring(0, lastDashIdx).replace(/[^0-9]/g, '');
    const right = clean.substring(lastDashIdx + 1).replace(/[^0-9K]/g, '');

    if (right.length >= 1) {
      const candidateDv = right.charAt(0);
      const strippedLeft = left.replace(/^0+/, '') || '0';
      const expected = _mod11(strippedLeft === '0' ? '0' : strippedLeft);
      if (expected === candidateDv) {
        body = strippedLeft;
        dv = candidateDv;
        originalDvValid = true;
      } else {
        body = strippedLeft;
        dv = expected;
        originalDvValid = false;
      }
    } else {
      const strippedLeft = left.replace(/^0+/, '') || '0';
      body = strippedLeft;
      dv = _mod11(body);
      originalDvValid = false;
    }
  } else {
    const dgts = clean.replace(/[^0-9K]/g, '');
    if (dgts.length === 0) return emptyResult();

    if (dgts.length < 7) {
      body = dgts.replace(/^0+/, '') || '0';
      dv = _mod11(body);
      originalDvValid = false;
    } else if (dgts.length === 7) {
      body = dgts;
      dv = _mod11(body);
      originalDvValid = false;
    } else {
      // len >= 8: desambiguar. Intentar hipótesis A (último carácter es DV) siempre
      // pero len 8-9 solo.
      let dg = dgts;
      while (dg.length > 9 && /^0/.test(dg)) dg = dg.substring(1);

      if (dg.length >= 8 && dg.length <= 9) {
        const hBody = dg.slice(0, -1);
        const hDv = dg.charAt(dg.length - 1);
        const validH = /^[0-9]+$/.test(hBody) && _mod11(hBody) === hDv;
        if (validH) {
          body = hBody.replace(/^0+/, '') || hBody;
          dv = hDv;
          originalDvValid = true;
        } else {
          // Hipótesis B: todo es cuerpo, calcular DV
          const hBodyB = /^[0-9]+$/.test(dg) ? dg : dg.replace(/[^0-9]/g, '');
          const b2 = hBodyB.replace(/^0+/, '') || '0';
          body = b2;
          dv = _mod11(b2);
          originalDvValid = false;
          disambiguatedNoDash = true;
        }
      } else {
        // > 9 dígitos (raro) -> últimos 8/9? Se considera que el último es DV.
        const hBody = dg.slice(0, -1).replace(/[^0-9]/g, '');
        const hDv = dg.charAt(dg.length - 1);
        if (_mod11(hBody) === hDv) {
          body = hBody.replace(/^0+/, '') || hBody;
          dv = hDv;
          originalDvValid = true;
        } else {
          body = dg.replace(/^0+/, '') || '0';
          dv = _mod11(body);
          originalDvValid = false;
        }
      }
    }
  }

  // Sanity final: no-body
  if (!body) body = '0';
  if (!dv) dv = _mod11(body);
  body = body.replace(/^0+/, '') || '0';

  return {
    canonical: `${body}-${dv}`,
    body,
    dv,
    originalDvValid,
    bodyLength: body.length,
    disambiguatedNoDash,
  };
}

function emptyResult(): CanonicalRutResult {
  return { canonical: '0-0', body: '0', dv: '0', originalDvValid: false, bodyLength: 1, disambiguatedNoDash: false };
}

/** Alias rápido para renderizado UI - solo el formato canónico `Cuerpo-DV`. */
export function formatChileanRutCanonical(input: string | number | null | undefined): string {
  if (input == null || (typeof input === 'string' && input.trim() === '')) return '';
  return canonicalizeChileanRut(input).canonical;
}

/** Valida que un RUT tenga cuerpo numérico (7-8 dígitos) y DV consistente con módulo 11. */
export function validateChileanRutStrict(input: string | number | null | undefined): boolean {
  if (input == null) return false;
  const c = canonicalizeChileanRut(input);
  if (!c.originalDvValid && String(input).replace(/[^\-0-9Kk]/g, '').length >= 8) {
    return c.bodyLength >= 7 && c.bodyLength <= 8;
  }
  return c.bodyLength >= 7 && c.bodyLength <= 8;
}
