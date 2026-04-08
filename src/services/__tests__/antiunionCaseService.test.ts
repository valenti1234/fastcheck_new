import { antiunionCaseService, AntiunionCaseService, AntiunionCase, AntiunionCaseFilters, AntiunionCaseResponse, AntiunionCaseStats, UploadResponse } from '../antiunionCaseService';
import { apiClient } from '../api';

// Mock the API client
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('AntiunionCaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAntiunionCase: AntiunionCase = {
    _id: '507f1f77bcf86cd799439011',
    rut: '12345678-9',
    companyName: 'Test Company',
    rit: 'S-123',
    tribunal: 'JLT SANTIAGO',
    date: '2023-01-15',
    description: 'Test antiunion case description',
    complaintType: 'DT',
    fineAmount: '100 UTM',
    pdfFileName: 'test.pdf',
    pdfPath: '/uploads/test.pdf',
    uploadedBy: 'admin@test.com',
    createdAt: '2023-01-15T10:00:00Z',
    updatedAt: '2023-01-15T10:00:00Z',
  };

  const mockResponse: AntiunionCaseResponse = {
    success: true,
    data: [mockAntiunionCase],
    pagination: {
      current: 1,
      pages: 1,
      total: 1,
      limit: 10,
    },
  };

  const mockStats: AntiunionCaseStats = {
    totalCases: 100,
    casesByType: [
      { _id: 'DT', count: 60 },
      { _id: 'PARTICULAR', count: 30 },
      { _id: 'UNKNOWN', count: 10 },
    ],
    casesByTribunal: [
      { _id: 'JLT SANTIAGO', count: 50 },
      { _id: 'JLT VALPARAISO', count: 30 },
    ],
    recentCases: [
      {
        _id: '507f1f77bcf86cd799439011',
        companyName: 'Test Company',
        rut: '12345678-9',
        date: '2023-01-15',
        tribunal: 'JLT SANTIAGO',
      },
    ],
  };

  describe('getAllCases', () => {
    it('should fetch all antiunion cases successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await antiunionCaseService.getAllCases();

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases?');
      expect(result).toEqual(mockResponse);
    });

    it('should fetch cases with filters', async () => {
      const filters: AntiunionCaseFilters = {
        page: 1,
        limit: 20,
        rut: '12345678-9',
        companyName: 'Test',
        tribunal: 'JLT SANTIAGO',
        complaintType: 'DT',
      };

      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await antiunionCaseService.getAllCases(filters);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/antiunion-cases?page=1&limit=20&rut=12345678-9&companyName=Test&tribunal=JLT%20SANTIAGO&complaintType=DT'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockApiClient.get.mockRejectedValue(error);

      await expect(antiunionCaseService.getAllCases()).rejects.toThrow('API Error');
    });
  });

  describe('getCaseById', () => {
    it('should fetch a case by ID successfully', async () => {
      const mockSingleResponse = { success: true, data: mockAntiunionCase };
      mockApiClient.get.mockResolvedValue({ data: mockSingleResponse });

      const result = await antiunionCaseService.getCaseById('507f1f77bcf86cd799439011');

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases/507f1f77bcf86cd799439011');
      expect(result).toEqual(mockSingleResponse);
    });

    it('should handle case not found', async () => {
      const error = new Error('Case not found');
      mockApiClient.get.mockRejectedValue(error);

      await expect(antiunionCaseService.getCaseById('invalid-id')).rejects.toThrow('Case not found');
    });
  });

  describe('getCasesByRut', () => {
    it('should fetch cases by RUT successfully', async () => {
      const mockRutResponse = { success: true, count: 1, data: [mockAntiunionCase] };
      mockApiClient.get.mockResolvedValue({ data: mockRutResponse });

      const result = await antiunionCaseService.getCasesByRut('12345678-9');

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases/rut/12345678-9');
      expect(result).toEqual(mockRutResponse);
    });

    it('should handle invalid RUT', async () => {
      const error = new Error('Invalid RUT format');
      mockApiClient.get.mockRejectedValue(error);

      await expect(antiunionCaseService.getCasesByRut('invalid-rut')).rejects.toThrow('Invalid RUT format');
    });
  });

  describe('createCase', () => {
    it('should create a new case successfully', async () => {
      const newCaseData = {
        rut: '12345678-9',
        companyName: 'New Company',
        rit: 'S-456',
        tribunal: 'JLT VALPARAISO',
        date: '2023-02-01',
        description: 'New case description',
        complaintType: 'PARTICULAR' as const,
        fineAmount: '200 UTM',
      };

      const mockCreateResponse = {
        success: true,
        message: 'Case created successfully',
        data: { ...mockAntiunionCase, ...newCaseData },
      };

      mockApiClient.post.mockResolvedValue({ data: mockCreateResponse });

      const result = await antiunionCaseService.createCase(newCaseData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/antiunion-cases', newCaseData);
      expect(result).toEqual(mockCreateResponse);
    });

    it('should handle validation errors', async () => {
      const invalidCaseData = {
        rut: 'invalid',
        companyName: '',
        rit: '',
        tribunal: '',
        date: '',
        description: '',
        complaintType: 'INVALID' as any,
        fineAmount: '',
      };

      const error = new Error('Validation failed');
      mockApiClient.post.mockRejectedValue(error);

      await expect(antiunionCaseService.createCase(invalidCaseData)).rejects.toThrow('Validation failed');
    });
  });

  describe('updateCase', () => {
    it('should update a case successfully', async () => {
      const updateData = { companyName: 'Updated Company Name' };
      const mockUpdateResponse = {
        success: true,
        message: 'Case updated successfully',
        data: { ...mockAntiunionCase, ...updateData },
      };

      mockApiClient.put.mockResolvedValue({ data: mockUpdateResponse });

      const result = await antiunionCaseService.updateCase('507f1f77bcf86cd799439011', updateData);

      expect(mockApiClient.put).toHaveBeenCalledWith('/antiunion-cases/507f1f77bcf86cd799439011', updateData);
      expect(result).toEqual(mockUpdateResponse);
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      mockApiClient.put.mockRejectedValue(error);

      await expect(antiunionCaseService.updateCase('invalid-id', {})).rejects.toThrow('Update failed');
    });
  });

  describe('deleteCase', () => {
    it('should delete a case successfully', async () => {
      const mockDeleteResponse = {
        success: true,
        message: 'Case deleted successfully',
      };

      mockApiClient.delete.mockResolvedValue({ data: mockDeleteResponse });

      const result = await antiunionCaseService.deleteCase('507f1f77bcf86cd799439011');

      expect(mockApiClient.delete).toHaveBeenCalledWith('/antiunion-cases/507f1f77bcf86cd799439011');
      expect(result).toEqual(mockDeleteResponse);
    });

    it('should handle delete errors', async () => {
      const error = new Error('Delete failed');
      mockApiClient.delete.mockRejectedValue(error);

      await expect(antiunionCaseService.deleteCase('invalid-id')).rejects.toThrow('Delete failed');
    });
  });

  describe('getStatistics', () => {
    it('should fetch statistics successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: { data: mockStats } });

      const result = await antiunionCaseService.getStatistics();

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases/stats');
      expect(result).toEqual(mockStats);
    });

    it('should handle statistics fetch errors', async () => {
      const error = new Error('Statistics fetch failed');
      mockApiClient.get.mockRejectedValue(error);

      await expect(antiunionCaseService.getStatistics()).rejects.toThrow('Statistics fetch failed');
    });
  });

  describe('exportToCsv', () => {
    it('should export cases to CSV successfully', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      mockApiClient.get.mockResolvedValue({ data: mockBlob });

      const result = await antiunionCaseService.exportToCsv();

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases/export/csv?', {
        responseType: 'blob',
      });
      expect(result).toEqual(mockBlob);
    });

    it('should export with filters', async () => {
      const filters: AntiunionCaseFilters = {
        rut: '12345678-9',
        complaintType: 'DT',
      };
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      mockApiClient.get.mockResolvedValue({ data: mockBlob });

      const result = await antiunionCaseService.exportToCsv(filters);

      expect(mockApiClient.get).toHaveBeenCalledWith('/antiunion-cases/export/csv?rut=12345678-9&complaintType=DT', {
        responseType: 'blob',
      });
      expect(result).toEqual(mockBlob);
    });

    it('should handle export errors', async () => {
      const error = new Error('Export failed');
      mockApiClient.get.mockRejectedValue(error);

      await expect(antiunionCaseService.exportToCsv()).rejects.toThrow('Export failed');
    });
  });

  describe('validateRut', () => {
    it('should validate correct RUTs', () => {
      expect(AntiunionCaseService.validateRut('12345678-9')).toBe(true);
      expect(AntiunionCaseService.validateRut('12.345.678-9')).toBe(true);
      expect(AntiunionCaseService.validateRut('123456789')).toBe(true);
    });

    it('should reject invalid RUTs', () => {
      expect(AntiunionCaseService.validateRut('12345678-0')).toBe(false);
      expect(AntiunionCaseService.validateRut('invalid')).toBe(false);
      expect(AntiunionCaseService.validateRut('')).toBe(false);
      expect(AntiunionCaseService.validateRut('12345678-X')).toBe(false);
    });
  });

  describe('formatRut', () => {
    it('should format RUTs correctly', () => {
      expect(AntiunionCaseService.formatRut('123456789')).toBe('12.345.678-9');
      expect(AntiunionCaseService.formatRut('12345678-9')).toBe('12.345.678-9');
      expect(AntiunionCaseService.formatRut('12.345.678-9')).toBe('12.345.678-9');
    });

    it('should handle invalid input', () => {
      expect(AntiunionCaseService.formatRut('invalid')).toBe('invalid');
      expect(AntiunionCaseService.formatRut('')).toBe('');
    });
  });

  describe('uploadPDF', () => {
    it('should upload PDF successfully', async () => {
      const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      const mockUploadResponse: UploadResponse = {
        success: true,
        message: 'PDF uploaded successfully',
        data: [mockAntiunionCase],
        summary: {
          total: 1,
          saved: 1,
          skipped: 0,
        },
      };

      mockApiClient.post.mockResolvedValue({ data: mockUploadResponse });

      const result = await antiunionCaseService.uploadPDF(mockFile);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/antiunion-cases/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
      );
      expect(result).toEqual(mockUploadResponse);
    });

    it('should handle upload progress', async () => {
      const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      const mockUploadResponse: UploadResponse = {
        success: true,
        message: 'PDF uploaded successfully',
        data: [mockAntiunionCase],
      };

      const progressCallback = jest.fn();
      mockApiClient.post.mockResolvedValue({ data: mockUploadResponse });

      const result = await antiunionCaseService.uploadPDF(mockFile, progressCallback);

      expect(result).toEqual(mockUploadResponse);
    });

    it('should handle upload errors', async () => {
      const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      const error = new Error('Upload failed');
      mockApiClient.post.mockRejectedValue(error);

      await expect(antiunionCaseService.uploadPDF(mockFile)).rejects.toThrow('Upload failed');
    });
  });
});