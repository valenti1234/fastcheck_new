import mongoose, { Document, Schema } from 'mongoose';

export interface IUserNote extends Document {
  userId: string;
  tenantId: string;
  rut: string;
  note: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userNoteSchema = new Schema<IUserNote>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User'
    },
    tenantId: {
      type: String,
      required: true,
      ref: 'Tenant'
    },
    rut: {
      type: String,
      required: true,
      trim: true
    },
    note: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function(tags: string[]) {
          return tags.length <= 10; // Limite massimo di 10 tags
        },
        message: 'Cannot have more than 10 tags'
      }
    }
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient queries
userNoteSchema.index({ rut: 1, tenantId: 1 });
userNoteSchema.index({ userId: 1, tenantId: 1 });

export const UserNote = mongoose.models.UserNote || mongoose.model<IUserNote>('UserNote', userNoteSchema);