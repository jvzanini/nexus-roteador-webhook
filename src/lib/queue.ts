import { Queue } from "bullmq";
import { redis } from "./redis";

export const webhookDeliveryQueue = new Queue("webhook-delivery", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const webhookDlqQueue = new Queue("webhook-dlq", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
