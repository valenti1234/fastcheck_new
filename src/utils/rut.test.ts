/// <reference types="jest" />
import { validateChileanRut, formatChileanRut } from '../services/api';

type RutTestCase = [string];
type RutFormatTestCase = [string, string];

describe('Chilean RUT Validation', () => {
  // Cuerpos usados y su DV correcto calculado por mod11 (algoritmo del proyecto):
  //   76086428 → 5 ; 77879240 → 0 ; 96942660 → 9
  //   96571220 → 8 ; 11111111 → 1 ; 22222222 → 2
  //   33333333 → 3 ; 12345678 → 5 ; 1000005  → K  (7 dígitos)
  test.each<RutTestCase>([
    ['76.086.428-5'],
    ['77.879.240-0'],
    ['96.942.660-9'],
    ['96.571.220-8'],
    ['11.111.111-1'],
    ['22.222.222-2'],
    ['33.333.333-3'],
    ['1.000.005-K'],
    ['12345678-5'],
    ['12.345.678-5'],
    ['12 345 678-5'],
    ['12-345-678-5'],
  ])('validates correct RUT %s', (rut: string) => {
    expect(validateChileanRut(rut)).toBe(true);
  });

  // Test cases with invalid RUTs
  test.each<RutTestCase>([
    ['12.345.678-9'], // Invalid verification digit (correct would be 5)
    ['11.111.111-2'], // Wrong verification digit (correct is 1)
    ['123456789'],    // Ambiguous 9 digits: 12345678 dv=9 vs correcto 5 → no válido
    ['1234.5678-9'],  // Wrong format + invalid DV
    ['ABCD.EFGH-I'],  // Non-numeric body
    [''],             // Empty
    ['1-9'],          // Too short
    ['999999999-9'],  // Too long body (9 dígitos)
    ['12.345.678'],   // Missing verification digit
    ['12.345.678-'],  // Missing verification digit after dash
    ['12.345.678-AB'], // Invalid verification digit
    [null as any],    // Null value
    [undefined as any], // Undefined value
  ])('rejects invalid RUT %s', (rut: string) => {
    expect(validateChileanRut(rut)).toBe(false);
  });

  // Test RUT formatting
  test.each<RutFormatTestCase>([
    ['11111111-1', '11.111.111-1'],
    ['222222222', '22.222.222-2'],
    ['76086428-5', '76.086.428-5'],
    ['960426701', '96.042.670-1'],
    ['12345678k', '12.345.678-K'],  // Lowercase k preserved (se formatea con guion aunque el dv sea inválido)
    ['12345678K', '12.345.678-K'],  // Uppercase K
    ['12.345.678-5', '12.345.678-5'], // Already formatted
    ['12-345-678-5', '12.345.678-5'], // With dashes
    ['12 345 678 5', '12.345.678-5'], // With spaces
    ['', ''],                         // Empty string
    ['1', '1'],                       // Single digit
  ])('formats RUT %s correctly to %s', (input: string, expected: string) => {
    expect(formatChileanRut(input)).toBe(expected);
  });

  // Edge cases for validation
  describe('Edge cases', () => {
    test('handles RUT with K verification digit', () => {
      // 1000005 (7 dígitos) mod11 según algoritmo proyecto = 10 → K.
      expect(validateChileanRut('1.000.005-K')).toBe(true);
      expect(validateChileanRut('1.000.005-k')).toBe(true);
    });

    test('handles different input formats', () => {
      const validRut = '12.345.678-5';
      expect(validateChileanRut('12345678-5')).toBe(validateChileanRut(validRut));
      expect(validateChileanRut('12.345.678-5')).toBe(validateChileanRut(validRut));
      expect(validateChileanRut('12 345 678-5')).toBe(validateChileanRut(validRut));
    });

    test('rejects RUTs with invalid characters', () => {
      expect(validateChileanRut('12.345.678-@')).toBe(false);
      expect(validateChileanRut('12.345.678-#')).toBe(false);
      expect(validateChileanRut('AB.CDE.FGH-I')).toBe(false);
    });
  });
});