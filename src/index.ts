import { env } from "./config/env";
import { createBot } from "./bot/bot";
import { appDataSource } from "./database/data-source";
import { CurrencyRate } from "./entities/CurrencyRate";
import { Payment } from "./entities/Payment";
import { RateAlert } from "./entities/RateAlert";
import { User } from "./entities/User";
import { CurrencyService } from "./services/currencyService";
import { startWebhookServer } from "./webhook/server";

const bootstrap = async (): Promise<void> => {
  await appDataSource.initialize();
  console.log("Database connected");

  const userRepository = appDataSource.getRepository(User);
  const currencyService = new CurrencyService(appDataSource.getRepository(CurrencyRate));
  const alertRepository = appDataSource.getRepository(RateAlert);
  const paymentRepository = appDataSource.getRepository(Payment);

  let rateSyncRunning = false;
  const syncRates = async (reason: string): Promise<void> => {
    if (rateSyncRunning) return;
    rateSyncRunning = true;
    try {
      const saved = await currencyService.syncRates(env.rateApiUrl);
      console.log(`Rates synced (${reason})`, { count: saved.length });
    } finally {
      rateSyncRunning = false;
    }
  };

  await syncRates("startup");

  if (Number.isFinite(env.rateSyncIntervalMs) && env.rateSyncIntervalMs > 0) {
    const intervalHandle = setInterval(() => {
      void syncRates("interval").catch((error) => console.error("Periodic rate sync failed", error));
    }, env.rateSyncIntervalMs);
    intervalHandle.unref();
  }

  const bot = createBot(env.botToken, { userRepository, currencyService, alertRepository, paymentRepository });
  const webhookServer = startWebhookServer(env.webhookPort, {
    bot,
    paymentRepository,
    userRepository,
    proDurationDays: env.proDurationDays,
  });

  process.once("SIGINT", () => {
    webhookServer.close();
    bot.stop();
  });
  process.once("SIGTERM", () => {
    webhookServer.close();
    bot.stop();
  });

  console.log("Bot is starting...");
  await bot.start();
};

bootstrap().catch((err) => {
  console.error("Failed to bootstrap application", err);
  process.exit(1);
});
