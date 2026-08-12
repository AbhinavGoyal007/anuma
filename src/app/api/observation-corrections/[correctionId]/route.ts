import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ state: z.enum(["confirmed", "rejected"]) });
type Context = { params: Promise<{ correctionId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { correctionId } = await params;
  if (!z.string().uuid().safeParse(correctionId).success) {
    return NextResponse.json({ error: "Invalid correction." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid correction decision." }, { status: 400 });
  }

  const db = await createClient();
  const { error } = await db.rpc("review_observation_correction", {
    p_correction_id: correctionId,
    p_review_state: parsed.data.state,
  });
  if (error) {
    console.error("Observation correction review failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error:
          error.code === "42501"
            ? "You are not allowed to review this correction."
            : error.code === "23505"
              ? "This correction has already been reviewed."
              : "The correction decision could not be saved.",
      },
      { status: error.code === "42501" ? 403 : 400 },
    );
  }
  return NextResponse.json({ status: parsed.data.state });
}
