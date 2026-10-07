import { NextResponse } from "next/server";
import { generateMaterialBundle } from "@/lib/materials/generate";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json({ results: await generateMaterialBundle(id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 422 }); }
}
