import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  valueText: z.string().trim().min(1).max(2000),
});
type Context = { params: Promise<{ observationId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { observationId } = await params;
  if (!z.string().uuid().safeParse(observationId).success) {
    return NextResponse.json({ error: "Invalid observation." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a corrected value." }, { status: 400 });
  }

  const db = await createClient();
  const { data, error } = await db.rpc("propose_observation_correction", {
    p_observation_id: observationId,
    p_proposed_value: { valueText: parsed.data.valueText },
    p_reason: parsed.data.reason || undefined,
  });
  if (error || !data) {
    console.error("Observation correction proposal failed", {
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json(
      {
        error:
          error?.code === "42501"
            ? "You are not allowed to correct this observation."
            : "The correction could not be saved.",
      },
      { status: error?.code === "42501" ? 403 : 400 },
    );
  }
  return NextResponse.json({ correctionId: data }, { status: 201 });
}
