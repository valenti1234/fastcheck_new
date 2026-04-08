/// <reference types="jest" />

// Mock utility functions based on the codebase patterns
const formatCurrency = (amount: number, currency: string = 'CLP') => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currency
    }).format(0);
  }
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

const formatDate = (dateString: string | Date) => {
  if (!dateString) return 'Fecha inválida';
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) {
      return 'Fecha inválida';
    }
    return date.toLocaleDateString('es-CL');
  } catch {
    return 'Fecha inválida';
  }
};

const formatDateDetailed = (dateString: string) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Fecha inválida';
    }
    
    // Format as dd/MM/yyyy
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    return 'Fecha inválida';
  }
};

const formatUTAAmount = (amount: number): string => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0';
  }
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(amount);
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  if (days > 0) {
    return `${days} días, ${hours} horas`;
  } else if (hours > 0) {
    return `${hours} horas, ${minutes} minutos`;
  } else {
    return `${minutes} minutos`;
  }
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const hasData = (value: any): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== 'N/A' && value !== '' && value !== 0;
};

describe('Utility Formatters', () => {
  describe('formatCurrency', () => {
    test('formats valid currency amounts correctly', () => {
      expect(formatCurrency(1000)).toContain('1.000');
      expect(formatCurrency(1000)).toContain('CLP');
      expect(formatCurrency(1500.50)).toContain('1.500');
      expect(formatCurrency(0)).toContain('0');
    });

    test('handles different currencies', () => {
      expect(formatCurrency(1000, 'USD')).toContain('USD');
      expect(formatCurrency(1000, 'EUR')).toContain('EUR');
    });

    test('handles invalid inputs', () => {
      expect(formatCurrency(NaN)).toContain('0');
      expect(formatCurrency(null as any)).toContain('0');
      expect(formatCurrency(undefined as any)).toContain('0');
    });

    test('handles negative amounts', () => {
      expect(formatCurrency(-1000)).toContain('-');
      expect(formatCurrency(-1000)).toContain('1.000');
    });
  });

  describe('formatDate', () => {
    test('formats valid date strings correctly', () => {
      expect(formatDate('2023-12-25')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      expect(formatDate('2023-01-01T00:00:00.000Z')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    test('formats Date objects correctly', () => {
      const date = new Date('2023-12-25');
      expect(formatDate(date)).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    test('handles invalid dates', () => {
      expect(formatDate('')).toBe('Fecha inválida');
      expect(formatDate('invalid-date')).toBe('Fecha inválida');
      expect(formatDate(null as any)).toBe('Fecha inválida');
      expect(formatDate(undefined as any)).toBe('Fecha inválida');
    });
  });

  describe('formatDateDetailed', () => {
    test('formats dates in dd/MM/yyyy format', () => {
      expect(formatDateDetailed('2023-12-25')).toBe('25/12/2023');
      expect(formatDateDetailed('2023-01-01')).toBe('01/01/2023');
      expect(formatDateDetailed('2023-06-15')).toBe('15/06/2023');
    });

    test('handles invalid dates', () => {
      expect(formatDateDetailed('invalid-date')).toBe('Fecha inválida');
      expect(formatDateDetailed('')).toBe('Fecha inválida');
    });
  });

  describe('formatUTAAmount', () => {
    test('formats UTA amounts with one decimal place', () => {
      expect(formatUTAAmount(100)).toBe('100,0');
      expect(formatUTAAmount(100.5)).toBe('100,5');
      expect(formatUTAAmount(1000.75)).toBe('1.000,8');
    });

    test('handles invalid inputs', () => {
      expect(formatUTAAmount(NaN)).toBe('0');
      expect(formatUTAAmount(null as any)).toBe('0');
      expect(formatUTAAmount(undefined as any)).toBe('0');
    });

    test('handles zero and negative values', () => {
      expect(formatUTAAmount(0)).toBe('0,0');
      expect(formatUTAAmount(-100)).toBe('-100,0');
    });
  });

  describe('formatBytes', () => {
    test('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    test('formats partial units correctly', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(2097152)).toBe('2 MB');
      expect(formatBytes(5368709120)).toBe('5 GB');
    });

    test('handles small byte values', () => {
      expect(formatBytes(512)).toBe('512 Bytes');
      expect(formatBytes(100)).toBe('100 Bytes');
    });
  });

  describe('formatUptime', () => {
    test('formats uptime correctly for different durations', () => {
      expect(formatUptime(60)).toBe('1 minutos');
      expect(formatUptime(3600)).toBe('1 horas, 0 minutos');
      expect(formatUptime(86400)).toBe('1 días, 0 horas');
      expect(formatUptime(90061)).toBe('1 días, 1 horas'); // 25 hours, 1 minute, 1 second
    });

    test('handles zero and small values', () => {
      expect(formatUptime(0)).toBe('0 minutos');
      expect(formatUptime(30)).toBe('0 minutos');
    });

    test('formats complex durations', () => {
      expect(formatUptime(266461)).toBe('3 días, 2 horas'); // 3 days, 2 hours, 1 minute, 1 second
    });
  });

  describe('formatDuration', () => {
    test('formats milliseconds correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    test('formats seconds correctly', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(2750)).toBe('2.75s');
    });

    test('handles zero and edge cases', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(1)).toBe('1ms');
    });
  });

  describe('hasData', () => {
    test('returns true for valid data', () => {
      expect(hasData('valid string')).toBe(true);
      expect(hasData(123)).toBe(true);
      expect(hasData([1, 2, 3])).toBe(true);
      expect(hasData({ key: 'value' })).toBe(true);
      expect(hasData(true)).toBe(true);
      expect(hasData(false)).toBe(true);
    });

    test('returns false for invalid data', () => {
      expect(hasData(undefined)).toBe(false);
      expect(hasData(null)).toBe(false);
      expect(hasData('N/A')).toBe(false);
      expect(hasData('')).toBe(false);
      expect(hasData(0)).toBe(false);
      expect(hasData([])).toBe(false);
    });

    test('handles arrays correctly', () => {
      expect(hasData(['item'])).toBe(true);
      expect(hasData([])).toBe(false);
      expect(hasData([null])).toBe(true); // Array with content, even if null
    });
  });
});