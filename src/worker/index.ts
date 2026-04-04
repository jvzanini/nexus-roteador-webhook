import { Worker } from "bullmq";
import { redis } from "../lib/redis";

console.log("[worker] Starting Nexus webhook worker...");

const deliveryWorker = new Worker(
  "webhook-delivery",
  async (job) => {
    console.log(`[worker] Processing job ${job.id}`, job.data);
  },
  { connection: redis, concurrency: 10 }
);

deliveryWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

deliveryWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await deliveryWorker.close();
  process.exit(0);
});
