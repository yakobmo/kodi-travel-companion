import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_TRIP_GROUP_UUID } from "./demoRelationalIds.js";
import { getActiveDemoStorageDriverName } from "./demoStorage.js";
import { createSupabaseServerClient } from "./supabaseClient.js";

export type TripDocumentCategory = "flights" | "insurance" | "lodging" | "tickets" | "personal" | "other";
export type TripDocumentVisibility = "group" | "admins";

export interface TripDocument {
  id: string;
  title: string;
  originalFilename: string;
  category: TripDocumentCategory;
  visibility: TripDocumentVisibility;
  mimeType: string;
  sizeBytes: number;
  uploadedByMemberId: string;
  uploadedByName: string;
  createdAt: string;
  storagePath: string;
}

const bucketName = "trip-documents";
const bucketOptions = {
  public: false,
  fileSizeLimit: 8 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/json"]
};
const localRoot = process.env.TRIP_DOCUMENTS_LOCAL_DIR || join(process.cwd(), ".data", "trip-documents");
const localIndexPath = join(localRoot, "index.json");

async function ensureBucket() {
  const supabase = createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase document storage is not configured.");
  const { data } = await supabase.storage.getBucket(bucketName);
  if (!data) {
    const { error } = await supabase.storage.createBucket(bucketName, bucketOptions);
    if (error && !/already exists/i.test(error.message)) throw error;
  } else if (!data.allowed_mime_types?.includes("application/json")) {
    const { error } = await supabase.storage.updateBucket(bucketName, bucketOptions);
    if (error) throw error;
  }
  return supabase;
}

function readLocalIndex(): TripDocument[] {
  if (!existsSync(localIndexPath)) return [];
  try {
    return JSON.parse(readFileSync(localIndexPath, "utf8")) as TripDocument[];
  } catch {
    return [];
  }
}

function writeLocalIndex(documents: TripDocument[]) {
  mkdirSync(localRoot, { recursive: true });
  writeFileSync(localIndexPath, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
}

async function readSupabaseIndex(): Promise<TripDocument[]> {
  const supabase = await ensureBucket();
  const { data, error } = await supabase.storage.from(bucketName).download(`${DEMO_TRIP_GROUP_UUID}/index.json`);
  if (error) {
    if (/not found|does not exist/i.test(error.message)) return [];
    throw error;
  }
  try {
    return JSON.parse(await data.text()) as TripDocument[];
  } catch {
    return [];
  }
}

async function writeSupabaseIndex(documents: TripDocument[]) {
  const supabase = await ensureBucket();
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(`${DEMO_TRIP_GROUP_UUID}/index.json`, Buffer.from(JSON.stringify(documents)), {
      contentType: "application/json",
      upsert: true
    });
  if (error) throw error;
}

export async function listTripDocuments(): Promise<TripDocument[]> {
  const documents =
    getActiveDemoStorageDriverName() === "supabase" ? await readSupabaseIndex() : readLocalIndex();
  return [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveTripDocument(input: {
  title: string;
  originalFilename: string;
  category: TripDocumentCategory;
  visibility: TripDocumentVisibility;
  mimeType: string;
  content: Buffer;
  uploadedByMemberId: string;
  uploadedByName: string;
}) {
  const id = randomUUID();
  const extension = input.originalFilename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const storagePath = `${DEMO_TRIP_GROUP_UUID}/${id}.${extension}`;
  const document: TripDocument = {
    id,
    title: input.title,
    originalFilename: input.originalFilename,
    category: input.category,
    visibility: input.visibility,
    mimeType: input.mimeType,
    sizeBytes: input.content.length,
    uploadedByMemberId: input.uploadedByMemberId,
    uploadedByName: input.uploadedByName,
    createdAt: new Date().toISOString(),
    storagePath
  };
  const documents = await listTripDocuments();

  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureBucket();
    const { error } = await supabase.storage.from(bucketName).upload(storagePath, input.content, {
      contentType: input.mimeType,
      upsert: false
    });
    if (error) throw error;
    try {
      await writeSupabaseIndex([document, ...documents]);
    } catch (error) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      throw error;
    }
  } else {
    mkdirSync(localRoot, { recursive: true });
    writeFileSync(join(localRoot, `${id}.${extension}`), input.content);
    writeLocalIndex([document, ...documents]);
  }
  return document;
}

export async function readTripDocument(id: string) {
  const document = (await listTripDocuments()).find((item) => item.id === id);
  if (!document) return null;
  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureBucket();
    const { data, error } = await supabase.storage.from(bucketName).download(document.storagePath);
    if (error) throw error;
    return { document, content: Buffer.from(await data.arrayBuffer()) };
  }
  const extension = document.storagePath.split(".").pop() || "bin";
  const path = join(localRoot, `${document.id}.${extension}`);
  if (!existsSync(path)) return null;
  return { document, content: readFileSync(path) };
}

export async function removeTripDocument(id: string) {
  const documents = await listTripDocuments();
  const document = documents.find((item) => item.id === id);
  if (!document) return false;
  const remaining = documents.filter((item) => item.id !== id);
  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureBucket();
    const { error } = await supabase.storage.from(bucketName).remove([document.storagePath]);
    if (error) throw error;
    await writeSupabaseIndex(remaining);
  } else {
    const extension = document.storagePath.split(".").pop() || "bin";
    const path = join(localRoot, `${document.id}.${extension}`);
    if (existsSync(path)) unlinkSync(path);
    writeLocalIndex(remaining);
  }
  return true;
}
