import { NextRequest, NextResponse } from "next/server";
import {
  receiveWebhook,
  verifyHmacSignature,
  getWebhookRoutingAdapter,
  configureWebhookRouting,
} from "@nexusai360/webhook-routing";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { normalizeWebhookPayload } from "@/lib/webhook/normalizer";
import { logAudit } from "@/lib/audit";
import { enqueueDeliveries } from "@/lib/webhook/enqueue";
import { webhookAdapter } from "@/lib/webhook/adapter";
import { handleInlineGet, handleInlinePost } from "./route-inline";

const USE_PACKAGE_PIPELINE = () => process.env.USE_PACKAGE_PIPELINE === "true";

interface RouteParams {
  params: Promise<{ webhookKey: string }>;
}

// HMR guard: garante adapter configurado mesmo apos hot reload
function ensureConfigured() {
  try {
    getWebhookRoutingAdapter();
  } catch {
    configureWebhookRouting(webhookAdapter);
  }
}

export async function GET(request: NextRequest, ctx: RouteParams) {
  // Challenge Meta sempre pelo pipeline inline (nao depende de adapter)
  return handleInlineGet(request, ctx);
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  if (!USE_PACKAGE_PIPELINE()) return handleInlinePost(request, ctx);
  ensureConfigured();
  return handlePackage(request, ctx);
}

async function handlePackage(request: NextRequest, { params }: RouteParams) {
  const { webhookKey } = await params;

  const company = await prisma.company.findUnique({
    where: { webhookKey },
    include: { credential: true },
  });
  if (!company || !company.isActive || !company.credential) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = decrypt(company.credential.metaAppSecret);

  if (
    !verifyHmacSignature({
      rawBody,
      signatureHeader,
      secret: appSecret,
      algo: "sha256",
    })
  ) {
    await logAudit({
      actorType: "system",
      actorLabel: "webhook-ingest",
      companyId: company.id,
      action: "auth.invalid_signature",
      resourceType: "InboundWebhook",
      details: { webhookKey, reason: "Assinatura X-Hub-Signature-256 invalida" },
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const events = normalizeWebhookPayload(payload as any, company.id);
  if (events.length === 0) {
    return NextResponse.json({ status: "ok", events: 0 });
  }

  let result;
  try {
    result = await receiveWebhook({
      companyId: company.id,
      rawBody,
      rawPayload: payload,
      events,
    });
  } catch (e) {
    console.error(
      `[webhook-ingest] receiveWebhook_failed company=${company.id}`,
      e,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  await enqueueDeliveries(
    result.inbound.map((i) => ({
      inboundWebhookId: i.inboundWebhookId,
      deliveryIds: i.deliveryIds,
    })),
    company.id,
  );

  return NextResponse.json({
    status: "ok",
    events: result.eventsProcessed,
    deduplicated: result.eventsDeduplicated,
  });
}
