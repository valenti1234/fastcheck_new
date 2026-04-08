import mongoose, { Schema, Document } from 'mongoose';

interface IDownloadLog extends Document {
  userId: string;
  tenantId: string;
  filename: string;
  downloadedAt: Date;
  fileSize: number;
  success: boolean;
  error?: string;
  metadata?: {
    isTextBased?: boolean;
    pageCount?: number;
  };
}

const DownloadLogSchema = new Schema<IDownloadLog>({
  userId: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  downloadedAt: { type: Date, default: Date.now },
  fileSize: { type: Number, required: true },
  success: { type: Boolean, required: true },
  error: { type: String },
  metadata: {
    isTextBased: { type: Boolean },
    pageCount: { type: Number }
  }
}, {
  timestamps: true
});

const DownloadLog = mongoose.model<IDownloadLog>('DownloadLog', DownloadLogSchema);

export class LogService {
  static async logDownload({ userId, tenantId, filename, fileSize, success, error, metadata }: {
    userId: string;
    tenantId: string;
    filename: string;
    fileSize: number;
    success: boolean;
    error?: string;
    metadata?: {
      isTextBased?: boolean;
      pageCount?: number;
    };
  }): Promise<void> {
    try {
      await DownloadLog.create({
        userId,
        tenantId,
        filename,
        fileSize,
        success,
        error,
        metadata,
        downloadedAt: new Date()
      });
    } catch (error) {
      console.error('Error logging download:', error);
    }
  }

  static async getDownloadLogs(tenantId: string, page = 1, limit = 10): Promise<{
    logs: IDownloadLog[];
    total: number;
    pages: number;
  }> {
    try {
      const total = await DownloadLog.countDocuments({ tenantId });
      const pages = Math.ceil(total / limit);
      const skip = (page - 1) * limit;

      const logs = await DownloadLog.find({ tenantId })
        .sort({ downloadedAt: -1 })
        .skip(skip)
        .limit(limit);

      return {
        logs,
        total,
        pages
      };
    } catch (error) {
      console.error('Error getting download logs:', error);
      return {
        logs: [],
        total: 0,
        pages: 0
      };
    }
  }
} 