import { extractText } from "@/lib/rag/extract";
import { unauthorizedResponse } from "@/lib/rag/auth";
import { addDocument, getWorkspaceSummary, removeDocument } from "@/lib/rag/store";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILES_PER_UPLOAD = 20;
const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => typeof value === "object" && value !== null && typeof (value as File).name === "string" && typeof (value as File).arrayBuffer === "function");
    if (!files.length) return Response.json({ error: "Choose at least one document to upload." }, { status: 400 });
    if (files.length > MAX_FILES_PER_UPLOAD) return Response.json({ error: `Upload at most ${MAX_FILES_PER_UPLOAD} documents at a time.` }, { status: 400 });
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) return Response.json({ error: "The total upload size cannot exceed 100 MB." }, { status: 400 });

    const errors: string[] = [];
    let uploaded = 0;
    for (const file of files) {
      try {
        const text = await extractText(file);
        addDocument(file.name, file.type || "application/octet-stream", file.size, text);
        uploaded += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Could not read ${file.name}.`);
      }
    }

    if (!uploaded) return Response.json({ error: errors.join(" ") }, { status: 422 });
    return Response.json({ workspace: getWorkspaceSummary(), errors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Document id is required." }, { status: 400 });
  return Response.json({ workspace: removeDocument(id) });
}
