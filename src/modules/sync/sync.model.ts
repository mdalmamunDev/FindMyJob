import { model, Schema } from "mongoose";

export interface SyncState {
  _id: string;
  lastSyncAt?: Date;
}

const syncStateSchema = new Schema<SyncState>(
  {
    _id: { type: String, required: true },
    lastSyncAt: Date,
  },
  {
    collection: "app_state",
    strict: false,
    versionKey: false,
  }
);

const SyncStateModel = model<SyncState>("SyncState", syncStateSchema);

export default SyncStateModel;
