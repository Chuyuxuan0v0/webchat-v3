import mongoose, { Schema, Document } from 'mongoose';

export interface IUserChatState extends Document {
  userId: mongoose.Types.ObjectId;
  chatId: string;
  lastReadMessageId: mongoose.Types.ObjectId;
  lastReadAt: Date;
}

const userChatStateSchema = new Schema<IUserChatState>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    chatId: {
      type: String,
      required: true,
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Compound unique index: one record per user per chat
userChatStateSchema.index({ userId: 1, chatId: 1 }, { unique: true });

// Index for querying by user
userChatStateSchema.index({ userId: 1, lastReadAt: -1 });

export const UserChatState = mongoose.model<IUserChatState>('UserChatState', userChatStateSchema);
