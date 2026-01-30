// src/lib/portfolioHelpers.js
import { supabase } from "../supabaseClient";
import { makeId } from "./id";

// ---------- small utils ----------
export function fmtBytes(bytes = 0) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isImage(mime = "") {
  return mime.startsWith("image/");
}

export function safeFileName(name = "file") {
  // remove weird chars and spaces to prevent URL / path problems
  return name.replace(/[^\w.\-]+/g, "_");
}

// ---------- SUBJECTS ----------
export async function seedDefaultSubjects(uid) {
  const defaults = Array.from({ length: 8 }, (_, i) => ({
    user_id: uid,
    title: `Subject ${i + 1}`,
    icon: "📄",
    sort: i + 1,
  }));

  const { error } = await supabase.from("subjects").insert(defaults);
  if (error) console.error("seedDefaultSubjects:", error);
}

export async function loadSubjects(uid) {
  const { data, error } = await supabase
    .from("subjects")
    .select("id,title,icon,sort")
    .eq("user_id", uid)
    .order("sort", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addSubject(uid, title, icon, nextSort) {
  const { error } = await supabase.from("subjects").insert({
    user_id: uid,
    title,
    icon,
    sort: nextSort,
  });
  if (error) throw error;
}

export async function deleteSubject(uid, subjectId) {
  // delete files rows first (optional but cleaner)
  await supabase
    .from("files")
    .delete()
    .eq("user_id", uid)
    .eq("subject_id", subjectId);

  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("user_id", uid)
    .eq("id", subjectId);

  if (error) throw error;
}

// ---------- FILES ----------
export async function loadFiles(uid, subjectId, category) {
  const { data, error } = await supabase
    .from("files")
    .select("id,title,object_path,mime_type,size,created_at")
    .eq("user_id", uid)
    .eq("subject_id", subjectId)
    .eq("category", category)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Uploads the actual file to Supabase Storage and returns objectPath.
 * FIXES:
 * - uses makeId() not crypto.randomUUID()
 * - sanitizes filename
 */
export async function uploadFileToStorage(uid, subjectId, category, file) {
  const safeName = safeFileName(file?.name || "upload");
  const objectPath = `${uid}/subjects/${subjectId}/${category}/${makeId()}-${safeName}`;

  const { error } = await supabase.storage
    .from("portfolio")
    .upload(objectPath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

  if (error) throw error;
  return objectPath;
}

/**
 * Inserts the file metadata to your `files` table.
 */
export async function insertFileRow(uid, subjectId, category, file, objectPath) {
  const { error } = await supabase.from("files").insert({
    user_id: uid,
    subject_id: subjectId,
    category,
    title: file?.name || "Untitled",
    object_path: objectPath,
    mime_type: file?.type || "",
    size: file?.size || 0,
  });

  if (error) throw error;
}

/**
 * Signed URL for preview (works even if bucket is private).
 */
export async function createSignedUrl(objectPath, seconds = 600) {
  const { data, error } = await supabase.storage
    .from("portfolio")
    .createSignedUrl(objectPath, seconds);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function renameFile(uid, fileId, newTitle) {
  const { error } = await supabase
    .from("files")
    .update({ title: newTitle })
    .eq("user_id", uid)
    .eq("id", fileId);

  if (error) throw error;
}

export async function deleteFile(uid, fileRow) {
  // Remove from storage first
  const { error: stErr } = await supabase.storage
    .from("portfolio")
    .remove([fileRow.object_path]);

  if (stErr) throw stErr;

  // Remove row from DB
  const { error } = await supabase
    .from("files")
    .delete()
    .eq("user_id", uid)
    .eq("id", fileRow.id);

  if (error) throw error;
}
