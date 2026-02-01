import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/* =========================================================
   GLOBAL CONSTANTS (MUST EXIST ONLY ONCE)
   ========================================================= */

const ICONS = ["📘","📄","📁","🧪","💻","📐","🧠","🎨","📷","🔧","🧬","🧾"];

// one global logo for whole app (login + dashboard)
const GLOBAL_LOGO_OBJECT_PATH = "branding/global_logo.png";

/* =========================================================
   UTILITIES
   ========================================================= */

// Mobile-safe unique id (no crypto.randomUUID)
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtBytes(bytes = 0) {
  if (!bytes) return "";
  const units = ["B","KB","MB","GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024; i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isImage(mime = "") {
  return mime.startsWith("image/");
}

/* =========================================================
   MAIN APP
   ========================================================= */

export default function PortfolioApp({ user }) {

  /* ================= ROUTING ================= */
  const [screen, setScreen] = useState(user ? "home" : "auth");
  const [toast, setToast] = useState("");

  /* ================= AUTH ================= */
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState(""); // confirm password
  const [showPass, setShowPass] = useState(false);

  /* ================= PROFILE ================= */
  const [profile, setProfile] = useState({
    id: null,
    name: "",
    section: "",
    school: "",
    avatar_path: null
  });

  const [avatarSrc, setAvatarSrc] = useState(null);

  /* ================= GLOBAL LOGO ================= */
  const [logoUrl, setLogoUrl] = useState(null);

  /* ================= SUBJECTS ================= */
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  /* ================= FILES ================= */
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  /* ================= NAV ================= */
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [category, setCategory] = useState(null);

  /* ================= MODALS ================= */
  const [preview, setPreview] = useState(null);
  const [optionsFor, setOptionsFor] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");

  /* ================= FILE INPUTS ================= */
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  /* =========================================================
     TOAST
     ========================================================= */
  function notify(msg) {
    setToast(msg);
    clearTimeout(notify._t);
    notify._t = setTimeout(() => setToast(""), 1800);
  }

  /* =========================================================
     SYNC SCREEN WITH AUTH
     ========================================================= */
  useEffect(() => {
    if (user) {
      setScreen(s => (s === "auth" ? "home" : s));
    } else {
      setScreen("auth");
    }
  }, [user]);

  /* =========================================================
     LOAD GLOBAL LOGO (once)
     ========================================================= */
  async function loadGlobalLogo() {
    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(GLOBAL_LOGO_OBJECT_PATH, 60 * 60);

    if (!error && data?.signedUrl) {
      setLogoUrl(data.signedUrl);
    } else {
      setLogoUrl(null);
    }
  }

  useEffect(() => {
    loadGlobalLogo();
  }, []);

  /* =========================================================
     AUTH
     ========================================================= */

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass
    });
    if (error) notify(error.message);
  }

  async function signUp() {
    if (pass !== pass2) {
      notify("Passwords do not match");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password: pass
    });

    if (error) notify(error.message);
    else notify("Account created — check your email");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }
  /* =========================================================
     ROUTE TITLE
     ========================================================= */
  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile" || screen === "profile_setup") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    return "DAGITAB";
  }, [screen]);

  /* =========================================================
     PROFILE HELPERS
     ========================================================= */

  async function refreshAvatarSignedUrl(avatarPath) {
    if (!avatarPath) {
      setAvatarSrc(null);
      return;
    }
    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(avatarPath, 60 * 30);

    if (error) {
      console.error(error);
      setAvatarSrc(null);
      return;
    }
    setAvatarSrc(data?.signedUrl ?? null);
  }

  async function ensureProfile(u) {
    if (!u?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,updated_at")
      .eq("id", u.id)
      .maybeSingle();

    if (error) {
      console.error("ensureProfile error:", error);
      return;
    }

    if (!data) {
      const { error: insErr } = await supabase.from("profiles").insert({
        id: u.id,
        name: "",
        section: "",
        school: "",
        avatar_path: null,
        updated_at: new Date().toISOString(),
      });
      if (insErr) console.error("ensureProfile insert error:", insErr);
    }
  }

  async function loadProfile(uid_) {
    if (!uid_) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,updated_at")
      .eq("id", uid_)
      .maybeSingle();

    if (error) {
      console.error("loadProfile error:", error);
      return;
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
      // if first-time profile is blank, guide to setup
      const needs =
        !String(data.name || "").trim() ||
        !String(data.section || "").trim() ||
        !String(data.school || "").trim();
      if (needs && screen !== "profile_setup") setScreen("profile_setup");
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;

    const payload = {
      name: String(next.name || "").trim(),
      section: String(next.section || "").trim(),
      school: String(next.school || "").trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id)
      .select("id,name,section,school,avatar_path,updated_at")
      .maybeSingle();

    if (error) {
      console.error("saveProfile error:", error);
      notify("Failed to save profile");
      return;
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }

    notify("Profile saved");

    // if this was setup flow, continue to dashboard
    if (screen === "profile_setup") setScreen("home");
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;

    const path = `${user.id}/profile/avatar.jpg`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      notify("Avatar upload failed");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      console.error(error);
      notify("Failed to save avatar");
      return;
    }

    await loadProfile(user.id);
    notify("Avatar updated");
  }

  /* =========================================================
     GLOBAL LOGO (UPLOAD FROM PROFILE; SHOW ON LOGIN)
     ========================================================= */

  async function uploadGlobalLogo(file) {
    if (!file) return;

    const { error: upErr } = await supabase.storage
      .from("portfolio")
      .upload(GLOBAL_LOGO_OBJECT_PATH, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (upErr) {
      console.error(upErr);
      notify("Logo upload failed (check storage policy)");
      return;
    }

    await loadGlobalLogo();
    notify("Logo updated");
  }

  /* =========================================================
     SUBJECTS
     ========================================================= */

  async function loadSubjects() {
    if (!user?.id) return;

    setLoadingSubjects(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("id,title,icon,sort")
      .eq("user_id", user.id)
      .order("sort", { ascending: true });

    setLoadingSubjects(false);

    if (error) {
      console.error(error);
      notify("Failed to load subjects");
      return;
    }

    // ✅ New accounts start EMPTY (no seeding)
    setSubjects(data ?? []);
  }

  async function addSubject(title, icon) {
    if (!user?.id) return;

    const t = String(title || "").trim();
    if (!t) return notify("Enter subject name");

    const nextSort = subjects.length ? Math.max(...subjects.map((s) => s.sort || 0)) + 1 : 1;

    const { error } = await supabase.from("subjects").insert({
      user_id: user.id,
      title: t,
      icon: icon || "📘",
      sort: nextSort,
    });

    if (error) {
      console.error(error);
      notify("Failed to add subject");
      return;
    }

    await loadSubjects();
    notify("Subject added");
  }

  async function deleteSubject(subjectId) {
    if (!user?.id) return;
    if (!confirm("Delete this subject and its files?")) return;

    // delete file rows first
    await supabase.from("files").delete().eq("user_id", user.id).eq("subject_id", subjectId);

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("user_id", user.id)
      .eq("id", subjectId);

    if (error) {
      console.error(error);
      notify("Failed to delete subject");
      return;
    }

    if (selectedSubject?.id === subjectId) {
      setSelectedSubject(null);
      setScreen("subjects");
    }

    await loadSubjects();
    notify("Deleted");
  }

  async function deleteAllSubjects() {
    if (!user?.id) return;
    if (!confirm("Delete ALL subjects and ALL files?")) return;

    // delete file rows (and optionally storage objects later)
    await supabase.from("files").delete().eq("user_id", user.id);
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    if (error) {
      console.error(error);
      notify("Failed to delete all subjects");
      return;
    }

    setSelectedSubject(null);
    setCategory(null);
    setFiles([]);
    setSubjects([]);
    setScreen("subjects");
    notify("All subjects deleted");
  }

  /* =========================================================
     FILES
     ========================================================= */

  async function loadFiles(subjectId, cat) {
    if (!user?.id) return;

    setLoadingFiles(true);
    const { data, error } = await supabase
      .from("files")
      .select("id,title,object_path,mime_type,size,created_at")
      .eq("user_id", user.id)
      .eq("subject_id", subjectId)
      .eq("category", cat)
      .order("created_at", { ascending: false });

    setLoadingFiles(false);

    if (error) {
      console.error(error);
      notify("Failed to load files");
      return;
    }

    setFiles(data ?? []);
  }

  function openFiles(cat) {
    if (!selectedSubject) return;
    setCategory(cat);
    setScreen("files");
    loadFiles(selectedSubject.id, cat);
  }

  async function uploadSelectedFile(file) {
    if (!file || !user?.id || !selectedSubject || !category) return;

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const objectPath = `${user.id}/subjects/${selectedSubject.id}/${category}/${uid()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      notify("Upload failed");
      return;
    }

    const { error: insErr } = await supabase.from("files").insert({
      user_id: user.id,
      subject_id: selectedSubject.id,
      category,
      title: file.name,
      object_path: objectPath,
      mime_type: file.type,
      size: file.size,
    });

    if (insErr) {
      console.error(insErr);
      notify("Upload saved but DB insert failed");
      return;
    }

    notify("Uploaded");
    await loadFiles(selectedSubject.id, category);
  }

  async function handleUploadAny(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await uploadSelectedFile(f);
  }

  async function handleUploadCamera(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await uploadSelectedFile(f);
  }

  async function openPreview(fileRow) {
    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(fileRow.object_path, 60 * 10);

    if (error) {
      console.error(error);
      notify("Preview failed");
      return;
    }

    setPreview({
      url: data?.signedUrl,
      title: fileRow.title,
      mime: fileRow.mime_type || "",
    });
  }

  async function renameFile() {
    if (!user?.id || !optionsFor) return;

    const newName = String(renameTitle || "").trim();
    if (!newName) return notify("Enter new name");

    const { error } = await supabase
      .from("files")
      .update({ title: newName })
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    if (error) {
      console.error(error);
      notify("Rename failed");
      return;
    }

    setOptionsFor(null);
    setRenameTitle("");
    notify("Renamed");
    await loadFiles(selectedSubject.id, category);
  }

  async function deleteFile() {
    if (!user?.id || !optionsFor) return;
    if (!confirm("Delete this file?")) return;

    const { error: stErr } = await supabase.storage
      .from("portfolio")
      .remove([optionsFor.object_path]);

    if (stErr) {
      console.error(stErr);
      notify("Storage delete failed");
      return;
    }

    const { error } = await supabase
      .from("files")
      .delete()
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    if (error) {
      console.error(error);
      notify("DB delete failed");
      return;
    }

    setOptionsFor(null);
    notify("Deleted");
    await loadFiles(selectedSubject.id, category);
  }

  /* =========================================================
     INIT WHEN USER READY
     ========================================================= */
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* =========================================================
     NAV BACK
     ========================================================= */
  function back() {
    if (screen === "profile" || screen === "profile_setup") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  /* =========================================================
     AUTH UI (Login only + Forgot link below)
     NOTE: Logo shown here is GLOBAL (logoUrl)
     ========================================================= */

  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            {/* GLOBAL LOGO FRAME */}
            <div className="logo-frame" title="App logo">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" />
              ) : (
                <div className="logo-ph">LOGO</div>
              )}
            </div>

            <div className="auth-banner">
              Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
            </div>

            <div className="subtle" style={{ marginTop: 10 }}>
              Login to sync your portfolio across devices.
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>EMAIL</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" />
            </div>

            <div className="field">
              <label>PASSWORD</label>
              <div className="pw-wrap">
                <input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                />
                <button className="eye" onClick={() => setShowPass((v) => !v)} type="button" title="Show/Hide">
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={signIn}>
                Login
              </button>
              <button
                className="small-btn"
                onClick={() => {
                  // signup quick prompt (confirm password appears by browser prompt)
                  const p2 = prompt("Confirm password:");
                  if (p2 == null) return;
                  setPass2(p2);
                  setTimeout(() => signUp(), 0);
                }}
              >
                Create Account
              </button>
            </div>

            {/* Keep only this below (no extra tab) */}
            <div style={{ marginTop: 12 }}>
              <button
                className="small-btn"
                onClick={async () => {
                  if (!email) return notify("Enter your email first");
                  const redirectTo = window.location.origin + window.location.pathname; // same tab/site
                  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                  if (error) notify(error.message);
                  else notify("Password reset email sent");
                }}
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  /* =========================================================
     MAIN UI
     ========================================================= */

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          {screen !== "home" ? (
            <button className="back-btn" onClick={back} title="Back">
              ←
            </button>
          ) : null}
          <div className="brand">{titleLine}</div>
        </div>

        <button className="icon-btn" onClick={() => setScreen("profile")} title="Profile">
          👤
        </button>
      </div>

      {/* HOME */}
      {screen === "home" && (
        <div className="white-surface">
          <div className="hero">Hi, {profile?.name?.trim() ? profile.name : "STUDENT"}</div>
          <div className="subtle">Your digital portfolio — organized and synced.</div>

          <div className="big-tile" onClick={() => setScreen("subjects")} role="button">
            <div className="big-icon">📘</div>
            <div className="big-label">SUBJECTS</div>
          </div>

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="small-btn" onClick={() => setScreen("profile")}>
              👤 My Profile
            </button>
            <button className="small-btn" onClick={signOut}>
              Logout
            </button>
          </div>
        </div>
      )}

      {/* PROFILE SETUP (first time) */}
      {screen === "profile_setup" && (
        <div className="white-surface">
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Set up your profile</div>
          <div className="subtle" style={{ marginTop: 0 }}>
            Please complete this once. After saving, you’ll go to your dashboard.
          </div>

          {/* Avatar */}
          <div className="profile-card">
            <div
              className="avatar"
              onClick={() => document.getElementById("avatarInput").click()}
              style={{ cursor: "pointer" }}
              title="Change photo"
            >
              {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <div style={{ fontSize: 28 }}>👤</div>}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Your Photo</div>
              <div className="subtle" style={{ margin: 0 }}>
                Tap to upload
              </div>
            </div>
          </div>

          <input
            id="avatarInput"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadAvatar(f);
            }}
          />

          {/* Fields */}
          <div className="field">
            <label>FULL NAME</label>
            <input value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>

          <div className="field">
            <label>SECTION</label>
            <input value={profile.section || ""} onChange={(e) => setProfile({ ...profile, section: e.target.value })} />
          </div>

          <div className="field">
            <label>SCHOOL</label>
            <input value={profile.school || ""} onChange={(e) => setProfile({ ...profile, school: e.target.value })} />
          </div>

          <div className="modal-actions">
            <button className="small-btn primary" onClick={() => saveProfile(profile)}>
              Save & Continue
            </button>
          </div>
        </div>
      )}

      {/* PROFILE */}
      {screen === "profile" && (
        <div className="white-surface">
          <div className="profile-card">
            <div
              className="avatar"
              onClick={() => document.getElementById("avatarInput2").click()}
              style={{ cursor: "pointer" }}
              title="Change photo"
            >
              {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <div style={{ fontSize: 28 }}>👤</div>}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>My Profile</div>
              <div className="subtle" style={{ margin: 0 }}>
                Tap avatar to change photo
              </div>
            </div>
          </div>

          <input
            id="avatarInput2"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadAvatar(f);
            }}
          />

          <div className="field">
            <label>FULL NAME</label>
            <input
              value={profile.name || ""}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              onBlur={() => saveProfile(profile)}
            />
          </div>

          <div className="field">
            <label>SECTION</label>
            <input
              value={profile.section || ""}
              onChange={(e) => setProfile({ ...profile, section: e.target.value })}
              onBlur={() => saveProfile(profile)}
            />
          </div>

          <div className="field">
            <label>SCHOOL</label>
            <input
              value={profile.school || ""}
              onChange={(e) => setProfile({ ...profile, school: e.target.value })}
              onBlur={() => saveProfile(profile)}
            />
          </div>

          {/* GLOBAL APP LOGO (upload from profile; shows on login for everyone) */}
          <div style={{ marginTop: 14, fontWeight: 900 }}>App Logo (Global)</div>
          <div className="subtle" style={{ marginTop: 2 }}>
            Upload once — this logo appears on the Login screen for everyone.
          </div>

          <div
            className="logo-frame"
            onClick={() => document.getElementById("globalLogoInput").click()}
            title="Tap to upload global logo"
          >
            {logoUrl ? <img src={logoUrl} alt="global logo" /> : <div className="logo-ph">LOGO</div>}
          </div>

          <input
            id="globalLogoInput"
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              await uploadGlobalLogo(f);
            }}
          />

          <div className="modal-actions">
            <button className="small-btn primary" onClick={() => saveProfile(profile)}>
              Save
            </button>
            <button className="small-btn" onClick={signOut}>
              Logout
            </button>
          </div>
        </div>
      )}

      {/* SUBJECTS */}
      {screen === "subjects" && (
        <div className="white-surface">
          <div className="subtle">
            Add subjects, choose icons, and delete individually — or delete all.
          </div>

          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button
              className="small-btn primary"
              onClick={async () => {
                const title = prompt("Subject name:");
                if (title == null) return;
                const icon = prompt("Icon (example: 📘). Leave blank for default:") || "📘";
                await addSubject(title, ICONS.includes(icon) ? icon : icon);
              }}
            >
              + Add Subject
            </button>

            <button className="small-btn danger" onClick={deleteAllSubjects}>
              Delete All Subjects
            </button>
          </div>

          {loadingSubjects ? (
            <div className="subtle" style={{ marginTop: 10 }}>
              Loading…
            </div>
          ) : subjects.length === 0 ? (
            <div className="subtle" style={{ textAlign: "center", padding: "28px 10px" }}>
              <div style={{ fontSize: 44 }}>📚</div>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>No subjects yet</div>
              <div>Tap “Add Subject” to create your first one.</div>
            </div>
          ) : (
            <div className="grid" style={{ marginTop: 12 }}>
              {subjects.map((s) => (
                <div key={s.id} className="tile">
                  <div
                    onClick={() => {
                      setSelectedSubject(s);
                      setScreen("folders");
                    }}
                    role="button"
                    style={{ cursor: "pointer" }}
                  >
                    <div className="ticon">{s.icon}</div>
                    <div className="ttext">{s.title}</div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button className="small-btn danger" onClick={() => deleteSubject(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FOLDERS */}
      {screen === "folders" && (
        <div className="white-surface">
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            {selectedSubject ? `${selectedSubject.icon} ${selectedSubject.title}` : "Subject"}
          </div>

          <div className="row" onClick={() => openFiles("performance")}>
            <div className="box">📁</div>
            <div className="rtitle">Performance Tasks</div>
          </div>

          <div style={{ height: 12 }} />

          <div className="row" onClick={() => openFiles("written")}>
            <div className="box">📁</div>
            <div className="rtitle">Written Works</div>
          </div>
        </div>
      )}

      {/* FILES */}
      {screen === "files" && (
        <div className="white-surface">
          <div style={{ fontWeight: 900 }}>
            {selectedSubject ? selectedSubject.title : "Subject"} •{" "}
            {category === "performance" ? "Performance Tasks" : "Written Works"}
          </div>
          <div className="subtle">Tap a file to preview. Use ⋯ to rename/delete.</div>

          <div className="file-list">
            {loadingFiles ? (
              <div className="subtle">Loading…</div>
            ) : files.length === 0 ? (
              <div className="subtle" style={{ textAlign: "center", padding: "40px 10px" }}>
                <div style={{ fontSize: 44 }}>📄</div>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>No files yet</div>
                <div>Tap + to upload your work.</div>
              </div>
            ) : (
              files.map((f) => (
                <div key={f.id} className="file-item">
                  <div
                    className="file-thumb"
                    onClick={() => openPreview(f)}
                    style={{ cursor: "pointer" }}
                    title="Preview"
                  >
                    {isImage(f.mime_type || "") ? (
                      <img
                        src={
                          // fast thumbnail: signed url per click is costly; show icon here
                          // (preview will fetch signed url)
                          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                        }
                        alt=""
                        style={{ width: 1, height: 1 }}
                      />
                    ) : (
                      <div style={{ fontSize: 22 }}>📄</div>
                    )}
                  </div>

                  <div className="file-meta" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {fmtBytes(f.size)} • {(f.mime_type || "file").toLowerCase()}
                    </div>
                  </div>

                  <button
                    className="kebab"
                    onClick={() => {
                      setOptionsFor(f);
                      setRenameTitle(f.title || "");
                    }}
                    title="Options"
                    type="button"
                  >
                    ⋯
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Upload buttons */}
          <button className="fab" onClick={() => fileRef.current?.click()} title="Upload">
            +
          </button>

          <input ref={fileRef} type="file" onChange={handleUploadAny} style={{ display: "none" }} />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleUploadCamera}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* PREVIEW MODAL (tap outside to close) */}
      {preview && (
        <div
          className="modal-bg"
          onClick={() => setPreview(null)}
          role="button"
          aria-label="Close preview"
        >
          <div className="modal white-surface" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview.title}
              </div>
              <button className="small-btn" onClick={() => setPreview(null)} type="button">
                Close
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {isImage(preview.mime) ? (
                <img
                  src={preview.url}
                  alt={preview.title}
                  style={{
                    width: "100%",
                    maxHeight: "70vh",
                    objectFit: "contain",
                    borderRadius: 18,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                />
              ) : (
                <iframe
                  src={preview.url}
                  title={preview.title}
                  style={{
                    width: "100%",
                    height: "70vh",
                    borderRadius: 18,
                    border: "1px solid rgba(0,0,0,0.06)",
                    background: "#fff",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* OPTIONS MODAL (rename/delete) */}
      {optionsFor && (
        <div className="modal-bg" onClick={() => setOptionsFor(null)} role="button" aria-label="Close options">
          <div className="modal white-surface" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>File Options</div>
            <div className="subtle" style={{ marginTop: 0 }}>
              Rename or delete this file.
            </div>

            <div className="field">
              <label>RENAME</label>
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
            </div>

            <div className="modal-actions" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <button className="small-btn primary" onClick={renameFile}>
                Save
              </button>
              <button className="small-btn danger" onClick={deleteFile}>
                Delete
              </button>
              <button className="small-btn" onClick={() => setOptionsFor(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation */}
      <div className="bottom-nav">
        <button className={"nav-btn " + (screen === "home" ? "active" : "")} onClick={() => setScreen("home")}>
          🏠 <span>Home</span>
        </button>
        <button className={"nav-btn " + (screen === "subjects" ? "active" : "")} onClick={() => setScreen("subjects")}>
          📘 <span>Subjects</span>
        </button>
        <button className={"nav-btn " + (screen === "profile" ? "active" : "")} onClick={() => setScreen("profile")}>
          👤 <span>Profile</span>
        </button>
        <button className="nav-btn" onClick={signOut}>
          🚪 <span>Logout</span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
