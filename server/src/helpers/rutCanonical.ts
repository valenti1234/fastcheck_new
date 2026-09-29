export const RUT_DV_CHARS = '0123456789K';

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

/**
 * Calcula el dígito verificador (DV) de un RUT chileno usando el algoritmo
 * estándar módulo 11 con multiplicadores cíclicos [2..7].
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

export interface CanonicalRutResult {
  canonical: string;
  body: string;
  dv: string;
  originalDvValid: boolean;
  bodyLength: number;
  disambiguatedNoDash: boolean;
}

function emptyResult(): CanonicalRutResult {
  return { canonical: '0-0', body: '0', dv: '0', originalDvValid: false, bodyLength: 1, disambiguatedNoDash: false };
}

/**
 * Canonicaliza un RUT chileno resolviendo la ambigüedad cuando llega SIN GUIÓN
 * y todo numérico (8-9 dígitos).
 *
 * 🚨 Bug clásico: 8 dígitos = 20779347 se troceaba substring(0,-1) → cuerpo
 *    2077934 + DV 7 = RUT 2077934-7 ERRÓNEO (perdíase una cifra: 20779347 real).
 *
 * Estrategia: si HAY guion usar left+right; si NO HAY guion y len 7-9 evaluar
 * hipótesis A ("último char = DV") vs B ("todo cuerpo, recalcular DV") mediante
 * validación mod11; ganar la que sea consistente, preferir A en empate.
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
      const expected = _mod11(strippedLeft);
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
          const hBodyB = /^[0-9]+$/.test(dg) ? dg : dg.replace(/[^0-9]/g, '');
          const b2 = hBodyB.replace(/^0+/, '') || '0';
          body = b2;
          dv = _mod11(b2);
          originalDvValid = false;
          disambiguatedNoDash = true;
        }
      } else {
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

export function formatChileanRutCanonical(input: string | number | null | undefined): string {
  if (input == null || (typeof input === 'string' && input.trim() === '')) return '';
  return canonicalizeChileanRut(input).canonical;
}
