import { Cron } from "croner";
import { config } from "./config.js";
import { startSyncBackground } from "./sync.js";
import { broadcast } from "./ws.js";

export function startAutoSync(): Cron | undefined {
  if (config.autoSyncHour === undefined) {
    console.log("[auto sync] Disabled; set AUTO_SYNC_HOUR to enable");
    return undefined;
  }

  const schedule =
    config.autoSyncHour === 24
      ? "0 0 * * *"
      : `0 */${config.autoSyncHour} * * *`;
  const task = new Cron(
    schedule,
    () => {
      const started = startSyncBackground(
        {
          categoryId: config.autoSyncCategoryId,
          postedWithin: config.autoSyncPostedWithinDay,
        },
        broadcast
      );
      if (!started) {
        console.warn(
          "[auto sync] Skipped scheduled sync because another sync is running"
        );
        return;
      }
      console.log("[auto sync] Scheduled sync started");
    },
    {
      protect: () => {
        console.warn(
          "[auto sync] Skipped scheduled run because the previous run is still active"
        );
      },
    }
  );

  console.log(
    `[auto sync] Enabled every ${config.autoSyncHour} hour(s); next run: ${task.nextRun()?.toLocaleString()}`
  );
  return task;
}
