import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process recurring invoices and bills daily at 6:00 AM UTC
crons.daily(
  "process recurring transactions",
  { hourUTC: 6, minuteUTC: 0 },
  internal.recurring.processRecurringTransactions
);

// Check and trigger automated email alerts daily at 7:00 AM UTC
crons.daily(
  "check email alerts",
  { hourUTC: 7, minuteUTC: 0 },
  internal.alerts.checkAndTriggerAlerts
);

// Check and update expired warranties daily at 5:00 AM UTC
crons.daily(
  "check warranty expiry",
  { hourUTC: 5, minuteUTC: 0 },
  internal.warranties.checkWarrantyExpiry
);

// Process expired loyalty points daily at 4:00 AM UTC
crons.daily(
  "process loyalty points expiry",
  { hourUTC: 4, minuteUTC: 0 },
  internal.loyalty.processPointsExpiry
);

// Process scheduled reports every hour at minute 0
crons.hourly(
  "process scheduled reports",
  { minuteUTC: 0 },
  internal.scheduledReports.processScheduledReports
);

export default crons;
