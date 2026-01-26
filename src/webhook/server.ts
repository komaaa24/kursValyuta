import http, { IncomingMessage, Server, ServerResponse } from "http";
import { Bot } from "grammy";
import { Repository } from "typeorm";
import { env } from "../config/env";
import { Payment, PaymentStatus } from "../entities/Payment";
import { User } from "../entities/User";
import { generateClickResponseSignature, verifyClickSignature } from "../services/clickService";
import { applyProPayment } from "../services/proService";

type WebhookDeps = {
  bot: Bot;
  paymentRepository: Repository<Payment>;
  userRepository: Repository<User>;
  proDurationDays: number;
};

type PaymentMetadata = Record<string, unknown> & {
  webhookStatus?: string | null;
  webhookAmount?: unknown | null;
  webhookUserId?: unknown | null;
  webhookReceivedAt?: string;
  paidAt?: string;
  failedAt?: string;
  failedReason?: string | null;
  clickTransId?: string;
  clickMerchantTransId?: string;
  clickMerchantPrepareId?: string | null;
  clickMerchantUserId?: string | null;
  clickAmount?: string;
  clickAction?: string;
  clickSignTime?: string;
  clickError?: number;
  clickReceivedAt?: string;
  revokedAt?: string;
  revokedSkipAt?: string;
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const parseBody = (req: IncomingMessage, raw: string): Record<string, unknown> => {
  const contentType = String(req.headers["content-type"] ?? "");
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
};

const sendJson = (res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const formatDate = (value: Date): string => {
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy}`;
};

const coerceString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

const parseClickError = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const finalizePayment = async (
  payment: Payment,
  metadata: PaymentMetadata,
  deps: WebhookDeps,
  telegramIdOverride?: number | null,
): Promise<{ applied: boolean; telegramId: number | null }> => {
  if (payment.status !== PaymentStatus.PAID) {
    payment.status = PaymentStatus.PAID;
  }
  if (!metadata.paidAt) {
    metadata.paidAt = new Date().toISOString();
  }
  payment.metadata = metadata;

  if (!payment.appliedAt) {
    const telegramId = payment.telegramId || telegramIdOverride || null;
    if (!telegramId) {
      await deps.paymentRepository.save(payment);
      return { applied: false, telegramId: null };
    }

    let user = await deps.userRepository.findOne({ where: { telegramId } });
    if (!user) {
      const meta = payment.metadata as Record<string, unknown>;
      user = deps.userRepository.create({
        telegramId,
        username: typeof meta?.username === "string" ? meta.username : undefined,
        firstName: typeof meta?.firstName === "string" ? meta.firstName : undefined,
        lastName: typeof meta?.lastName === "string" ? meta.lastName : undefined,
      });
      await deps.userRepository.save(user);
    }

    const paidAtRaw = typeof metadata.paidAt === "string" ? metadata.paidAt : null;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    const paymentStartedAt = payment.createdAt ?? paidAt;
    if (user.revokedAt && paymentStartedAt.getTime() <= user.revokedAt.getTime()) {
      payment.metadata = {
        ...metadata,
        revokedAt: user.revokedAt.toISOString(),
        revokedSkipAt: new Date().toISOString(),
      };
      await deps.paymentRepository.save(payment);
      console.warn("[WEBHOOK] payment skipped due to revoke", { tx: payment.transactionParam, telegramId, revokedAt: user.revokedAt });
      return { applied: false, telegramId };
    }

    const updatedUntil = await applyProPayment(deps.userRepository, user, deps.proDurationDays, paidAt);
    payment.appliedAt = new Date();
    await deps.paymentRepository.save(payment);

    try {
      const untilLabel = deps.proDurationDays <= 0 ? "cheksiz" : formatDate(updatedUntil);
      await deps.bot.api.sendMessage(
        telegramId,
        ["✅ PRO faollashtirildi!", `Muddati: ${untilLabel}`, "Botga qaytib foydalanishingiz mumkin."].join("\n"),
      );
    } catch (error) {
      console.error("Failed to send payment notification", error);
    }

    return { applied: true, telegramId };
  }

  await deps.paymentRepository.save(payment);
  return { applied: true, telegramId: payment.telegramId || telegramIdOverride || null };
};

const handlePaymentWebhook = async (req: IncomingMessage, res: ServerResponse, deps: WebhookDeps): Promise<void> => {
  const rawBody = await readBody(req);
  const body = parseBody(req, rawBody);

  const tx = String(body.tx ?? "");
  const status = String(body.status ?? "");
  const amount = body.amount ?? null;
  const userIdRaw = body.user_id ?? body.userId ?? null;
  const userId = Number(userIdRaw);

  if (!tx) {
    sendJson(res, 400, { error: "transaction_param required" });
    return;
  }

  console.log("[WEBHOOK] /webhook/pay", { tx, status, amount, userId: userIdRaw });

  const payment = await deps.paymentRepository.findOne({ where: { transactionParam: tx } });
  if (!payment) {
    console.error("[WEBHOOK] payment not found", { tx });
    sendJson(res, 404, { error: "Payment not found" });
    return;
  }

  const paymentSuccess = status === "success" || status === "paid" || status === "completed";
  const metadata: PaymentMetadata = {
    ...(payment.metadata ?? {}),
    webhookStatus: status || null,
    webhookAmount: amount,
    webhookUserId: Number.isFinite(userId) ? userId : userIdRaw,
    webhookReceivedAt: new Date().toISOString(),
  };

  if (paymentSuccess) {
    const result = await finalizePayment(payment, metadata, deps, Number.isFinite(userId) ? userId : null);
    sendJson(res, 200, { success: true, message: result.applied ? "Payment completed" : "Payment recorded" });
    return;
  }

  payment.status = PaymentStatus.FAILED;
  payment.metadata = {
    ...metadata,
    failedAt: new Date().toISOString(),
    failedReason: status || null,
  };
  await deps.paymentRepository.save(payment);
  sendJson(res, 200, { success: false, message: "Payment failed" });
};

const handleClickPrepare = async (
  body: Record<string, unknown>,
  res: ServerResponse,
  deps: WebhookDeps,
): Promise<void> => {
  const clickTransId = coerceString(body.click_trans_id);
  const serviceId = coerceString(body.service_id);
  const merchantTransId = coerceString(body.merchant_trans_id);
  const merchantUserId = coerceString(body.merchant_user_id);
  const amount = coerceString(body.amount);
  const action = coerceString(body.action);
  const signTime = coerceString(body.sign_time);
  const signString = coerceString(body.sign_string);
  const secretKey = env.click.secretKey ?? "";

  const signatureValid = verifyClickSignature(
    clickTransId,
    serviceId,
    secretKey,
    merchantTransId,
    amount,
    action,
    signTime,
    signString,
  );

  if (!signatureValid) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: null,
      error: -1,
      error_note: "SIGN_CHECK_FAILED: Invalid signature",
    });
    return;
  }

  const payment = await deps.paymentRepository.findOne({ where: { transactionParam: merchantTransId } });
  if (!payment) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: null,
      error: -6,
      error_note: "TRANSACTION_NOT_FOUND: Transaction not found in database",
    });
    return;
  }

  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue !== payment.amount) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: null,
      error: -2,
      error_note: "INVALID_AMOUNT: Incorrect amount",
    });
    return;
  }

  if (payment.status === PaymentStatus.PAID) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: payment.id,
      error: -4,
      error_note: "ALREADY_PAID: This transaction already paid",
    });
    return;
  }

  payment.metadata = {
    ...(payment.metadata ?? {}),
    clickTransId,
    clickMerchantTransId: merchantTransId,
    clickMerchantUserId: merchantUserId || null,
    clickAmount: amount,
    clickAction: action,
    clickSignTime: signTime,
    clickReceivedAt: new Date().toISOString(),
  };
  await deps.paymentRepository.save(payment);

  const responseSignature = generateClickResponseSignature(
    clickTransId,
    serviceId,
    secretKey,
    merchantTransId,
    String(payment.id),
    amount,
    action,
    signTime,
  );

  sendJson(res, 200, {
    click_trans_id: clickTransId,
    merchant_trans_id: merchantTransId,
    merchant_prepare_id: payment.id,
    error: 0,
    error_note: "Success",
    sign_time: signTime,
    sign_string: responseSignature,
  });
};

const handleClickComplete = async (
  body: Record<string, unknown>,
  res: ServerResponse,
  deps: WebhookDeps,
): Promise<void> => {
  const clickTransId = coerceString(body.click_trans_id);
  const serviceId = coerceString(body.service_id);
  const merchantTransId = coerceString(body.merchant_trans_id);
  const merchantPrepareIdRaw = coerceString(body.merchant_prepare_id);
  const merchantUserId = coerceString(body.merchant_user_id);
  const amount = coerceString(body.amount);
  const action = coerceString(body.action);
  const signTime = coerceString(body.sign_time);
  const signString = coerceString(body.sign_string);
  const errorRaw = coerceString(body.error);
  const secretKey = env.click.secretKey ?? "";

  const signatureValid = verifyClickSignature(
    clickTransId,
    serviceId,
    secretKey,
    merchantTransId,
    amount,
    action,
    signTime,
    signString,
    merchantPrepareIdRaw,
  );

  if (!signatureValid) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: merchantPrepareIdRaw || null,
      error: -1,
      error_note: "SIGN_CHECK_FAILED: Invalid signature",
    });
    return;
  }

  const clickErrorCode = parseClickError(errorRaw);
  if (clickErrorCode < 0) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: merchantPrepareIdRaw || null,
      error: clickErrorCode,
      error_note: "Error from Click",
    });
    return;
  }

  const merchantPrepareId = Number.parseInt(merchantPrepareIdRaw, 10);
  if (!Number.isFinite(merchantPrepareId)) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: merchantPrepareIdRaw || null,
      error: -6,
      error_note: "TRANSACTION_NOT_FOUND: Transaction not found in database",
    });
    return;
  }
  const payment = await deps.paymentRepository.findOne({
    where: {
      transactionParam: merchantTransId,
      id: merchantPrepareId,
    },
  });

  if (!payment) {
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: merchantPrepareIdRaw || null,
      error: -6,
      error_note: "TRANSACTION_NOT_FOUND: Transaction not found in database",
    });
    return;
  }

  const baseMetadata: PaymentMetadata = {
    ...(payment.metadata ?? {}),
    clickTransId,
    clickMerchantTransId: merchantTransId,
    clickMerchantPrepareId: merchantPrepareIdRaw || null,
    clickMerchantUserId: merchantUserId || null,
    clickAmount: amount,
    clickAction: action,
    clickSignTime: signTime,
    clickReceivedAt: new Date().toISOString(),
  };

  if (clickErrorCode !== 0) {
    payment.status = PaymentStatus.FAILED;
    payment.metadata = {
      ...baseMetadata,
      clickError: clickErrorCode,
      failedAt: new Date().toISOString(),
      failedReason: "click_error",
    };
    await deps.paymentRepository.save(payment);
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: merchantPrepareIdRaw || null,
      error: -9,
      error_note: "Transaction cancelled",
    });
    return;
  }

  if (payment.status === PaymentStatus.PAID) {
    const responseSignature = generateClickResponseSignature(
      clickTransId,
      serviceId,
      secretKey,
      merchantTransId,
      merchantPrepareIdRaw || String(payment.id),
      amount,
      action,
      signTime,
    );
    sendJson(res, 200, {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: Number.isFinite(merchantPrepareId) ? merchantPrepareId : payment.id,
      error: -4,
      error_note: "Already paid",
      sign_time: signTime,
      sign_string: responseSignature,
    });
    return;
  }

  const telegramId = Number.isFinite(Number(merchantUserId)) ? Number(merchantUserId) : null;
  const metadata: PaymentMetadata = {
    ...baseMetadata,
    paidAt: new Date().toISOString(),
  };

  await finalizePayment(payment, metadata, deps, telegramId);

  const responseSignature = generateClickResponseSignature(
    clickTransId,
    serviceId,
    secretKey,
    merchantTransId,
    merchantPrepareIdRaw || String(payment.id),
    amount,
    action,
    signTime,
  );

  sendJson(res, 200, {
    click_trans_id: clickTransId,
    merchant_trans_id: merchantTransId,
    merchant_prepare_id: Number.isFinite(merchantPrepareId) ? merchantPrepareId : payment.id,
    error: 0,
    error_note: "Success",
    sign_time: signTime,
    sign_string: responseSignature,
  });
};

const handleClickWebhook = async (req: IncomingMessage, res: ServerResponse, deps: WebhookDeps): Promise<void> => {
  if (!env.click.enabled) {
    sendJson(res, 503, { error: -8, error_note: "Click not configured" });
    return;
  }

  const rawBody = await readBody(req);
  const body = parseBody(req, rawBody);
  const action = coerceString(body.action);

  if (action === "0") {
    await handleClickPrepare(body, res, deps);
    return;
  }

  if (action === "1") {
    await handleClickComplete(body, res, deps);
    return;
  }

  sendJson(res, 400, { error: -3, error_note: "Unknown action" });
};

export const startWebhookServer = (port: number, deps: WebhookDeps): Server => {
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");

    if (method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
      return;
    }

    if (method === "POST" && (url.pathname === "/webhook/click" || url.pathname === "/api/click")) {
      try {
        await handleClickWebhook(req, res, deps);
      } catch (error) {
        console.error("Click webhook error", error);
        sendJson(res, 500, { error: -8, error_note: "Internal server error" });
      }
      return;
    }

    if (method === "POST" && url.pathname === "/webhook/pay") {
      try {
        await handlePaymentWebhook(req, res, deps);
      } catch (error) {
        console.error("Webhook error", error);
        sendJson(res, 500, { error: "Internal server error" });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });

  return server;
};
