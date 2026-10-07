import "server-only";

export async function compileTypstPdf(source: string): Promise<Uint8Array | null> {
  try {
    const { $typst } = await import("@myriaddreamin/typst.ts");
    const result = await $typst.pdf({ mainContent: source });
    return result ?? null;
  } catch (error) {
    console.warn("typst_compile", { status: "compile_pending", error: error instanceof Error ? error.message : "Unknown error" });
    return null;
  }
}
