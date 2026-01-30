import { supabase } from "../supabaseClient";

export async function refreshAvatarSignedUrl(avatarPath, setAvatarSrc) {
  if (!avatarPath) {
    setAvatarSrc(null);
    return;
  }
  const { data, error } = await supabase.storage
    .from("portfolio")
    .createSignedUrl(avatarPath, 60 * 30);

  if (error) {
    console.error("refreshAvatarSignedUrl:", error);
    setAvatarSrc(null);
    return;
  }
  setAvatarSrc(data?.signedUrl ?? null);
}

export async function ensureProfile(userId) {
  if (!userId) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("ensureProfile error:", error);
    return;
  }

  if (!data) {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: userId,
      name: "STUDENT 1",
      section: "12-FARADAY",
      school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
      updated_at: new Date().toISOString(),
      avatar_path: null,
    });

    if (insErr) console.error("ensureProfile insert error:", insErr);
  }
}

export async function loadProfile(userId, setProfile, setAvatarSrc) {
  if (!userId) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,section,school,avatar_path,updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadProfile error:", error);
    return;
  }

  if (data) {
    setProfile(data);
    await refreshAvatarSignedUrl(data.avatar_path, setAvatarSrc);
  }
}

export async function saveProfile(userId, next, setProfile, setAvatarSrc, notify) {
  if (!userId) return;

  setProfile(next);

  const { data, error } = await supabase
    .from("profiles")
    .update({
      name: next.name ?? "",
      section: next.section ?? "",
      school: next.school ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id,name,section,school,avatar_path,updated_at")
    .maybeSingle();

  if (error) {
    console.error("saveProfile error:", error);
    notify?.("Failed to save profile");
    return;
  }

  if (data) {
    setProfile(data);
    await refreshAvatarSignedUrl(data.avatar_path, setAvatarSrc);
  }

  notify?.("Profile saved");
}

export async function uploadAvatar(userId, file, notify) {
  if (!userId || !file) return { ok: false };

  const path = `${userId}/profile/avatar.jpg`;

  const { error: upErr } = await supabase.storage
    .from("portfolio")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (upErr) {
    console.error("uploadAvatar upload error:", upErr);
    notify?.("Avatar upload failed");
    return { ok: false };
  }

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (dbErr) {
    console.error("uploadAvatar db error:", dbErr);
    notify?.("Failed to save avatar");
    return { ok: false };
  }

  notify?.("Avatar updated");
  return { ok: true, path };
}
