import { ConsultaHistory } from '../../models/ConsultaHistory';
import { ConsultaHistoryService } from '../consultaHistoryService';

jest.mock('../../models/ConsultaHistory', () => ({
  ConsultaHistory: {
    countDocuments: jest.fn(),
    aggregate: jest.fn()
  }
}));

describe('ConsultaHistoryService.getConsultaStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('guards daily stats aggregation by converting invalid createdAt values safely', async () => {
    const tenantId = 'tenant-test';
    const countDocumentsMock = ConsultaHistory.countDocuments as jest.Mock;
    const aggregateMock = ConsultaHistory.aggregate as jest.Mock;

    countDocumentsMock
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    aggregateMock
      .mockResolvedValueOnce([{ totalCredits: 1 }])
      .mockResolvedValueOnce([{ avgTime: 150 }])
      .mockResolvedValueOnce([{ _id: '2026-01-02', count: 1 }])
      .mockResolvedValueOnce([{ _id: '/api/rut/lookup', count: 2 }]);

    const stats = await ConsultaHistoryService.getConsultaStats(tenantId);

    expect(stats.totalConsultations).toBe(2);
    expect(stats.consultationsByDay).toEqual([{ date: '2026-01-02', count: 1 }]);
    expect(stats.consultationsByEndpoint).toEqual([{ endpoint: '/api/rut/lookup', count: 2 }]);

    expect(aggregateMock).toHaveBeenCalledTimes(4);

    const dailyStatsPipeline = aggregateMock.mock.calls[2][0];
    expect(dailyStatsPipeline).toEqual(
      expect.arrayContaining([
        { $match: { tenantId } },
        {
          $addFields: {
            createdAtDate: {
              $convert: {
                input: '$createdAt',
                to: 'date',
                onError: null,
                onNull: null
              }
            }
          }
        },
        { $match: { createdAtDate: { $ne: null } } }
      ])
    );
    const groupStage = dailyStatsPipeline.find((stage: any) => stage.$group);
    expect(groupStage.$group._id).toEqual({
      $dateToString: {
        format: '%Y-%m-%d',
        date: '$createdAtDate'
      }
    });
  });
});
