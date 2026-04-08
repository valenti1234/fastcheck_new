/// <reference types="jest" />
import { validateChileanRut, formatChileanRut } from '../services/api';

type RutTestCase = [string];
type RutFormatTestCase = [string, string];

describe('Chilean RUT Validation', () => {
  // Test cases with known valid RUTs
  test.each<RutTestCase>([
    ['76.086.428-5'],
    ['77.879.240-2'],
    ['96.942.660-9'],
    ['96.571.220-8'],
    ['11.111.111-1'],
    ['22.222.222-2'],
    ['33.333.333-3'],
    ['12345678-5'],    // Without dots
    ['12.345.678-5'],  // With dots
    ['12 345 678-5'],  // With spaces
    ['12-345-678-5'],  // With dashes
  ])('validates correct RUT %s', (rut: string) => {
    expect(validateChileanRut(rut)).toBe(true);
  });

  // Test cases with invalid RUTs
  test.each<RutTestCase>([
    ['12.345.678-9'], // Invalid verification digit
    ['11.111.111-2'], // Wrong verification digit
    ['123456789'],    // No verification digit
    ['1234.5678-9'],  // Wrong format
    ['ABCD.EFGH-I'],  // Non-numeric
    [''],             // Empty
    ['1-9'],          // Too short
    ['999999999-9'],  // Too long
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
    ['12345678k', '12.345.678-K'],  // Lowercase k
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
      expect(validateChileanRut('11.111.111-K')).toBe(true);
      expect(validateChileanRut('11.111.111-k')).toBe(true);
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