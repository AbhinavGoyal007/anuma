import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  status: z.enum(["granted", "declined", "withdrawn", "not_required", "unknown"]),
  captureMethod: z.enum(["verbal", "written", "digital", "other"]),
});
type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { conversationId } = await params;
  const payload = consentSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(conversationId).success || !payload.success) {
    return NextResponse.json({ error: "The consent update is invalid." }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("append_customer_recording_consent", {
    p_conversation_id: conversationId,
    p_status: payload.data.status,
    p_capture_method: payload.data.captureMethod,
  });
  if (error) {
    console.error("Consent update failed", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: "Customer recording consent could not be recorded." },
      { status: error.code === "42501" ? 403 : 400 },
    );
  }
  return NextResponse.json({ status: "recorded" });
}
