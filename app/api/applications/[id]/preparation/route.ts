import { NextResponse } from "next/server";
import { generatePreparationPack } from "@/lib/applications/preparation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return NextResponse.json(await generatePreparationPack(id, "manual"), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate preparation pack" }, { status: 500 }); }
}
