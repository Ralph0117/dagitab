// src/PortfolioApp.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/** ✅ Mobile-safe unique id (replaces crypto.randomUUID on some phones) */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtBytes(bytes = 0) {
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

function isImage(mime = "") {
  return mime.startsWith("image/");
}

const ICONS = ["📘", "📄", "📁", "🧪", "💻", "📐", "🧠", "🎨", "📷", "🔧", "🧬", "🧾"];

export default function PortfolioApp({ user }) {
  // routing
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | setupProfile | home | profile | subjects | folders | files
  const [toast, setToast] = useState("");

  // auth UI tabs (BRING BACK)
  const [authTab, setAuthTab] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [busy, setBusy] = useState(false);

  // profile
  const [profile, setProfile] = useState({
    id: null,
    name: "",
    section: "",
    school: "",
    avatar_path: null,
  });
  const [avatarSrc, setAvatarSrc] = useState(null);

  // subjects
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // add subject modal (BRING BACK, improved UI)
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubIcon, setNewSubIcon] = useState("📘");

  // delete-all subjects confirm modal
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  // nav
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [category, setCategory] = useState(null); // performance | written

  // files
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // upload chooser (mobile)
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // preview (BETTER preview handling)
  const [preview, setPreview] = useState(null); // {url,title,mime,isImg}
  const [previewBusy, setPreviewBusy] = useState(false);

  // file options (3-dots)
  const [optionsFor, setOptionsFor] = useState(null); // file row
  const [renameTitle, setRenameTitle] = useState("");
  const [showRename, setShowRename] = useState(false);

  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1800);
  }

  // keep screen in sync with user
  useEffect(() => {
    setScreen(user ? (prev) => (prev === "auth" ? "home" : prev) : "auth");
  }, [user]);

  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    if (screen === "setupProfile") return "SETUP PROFILE";
    return "DAGITAB";
  }, [screen]);

  // =========================
  // AUTH
  // =========================
  async function signIn() {
    if (!email || !pass) return notify("Enter email and password");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
  }

  async function signUp() {
    if (!email || !pass) return notify("Enter email and password");
    if (pass.length < 6) return notify("Password must be at least 6 characters");
    if (pass !== pass2) return notify("Passwords do not match");

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    setBusy(false);

    if (error) return notify(error.message);

    // If email confirmation is OFF, session may exist immediately -> guide to profile setup
    const u = data?.user;
    if (u?.id) {
      notify("Account created. Set up your profile.");
      setAuthTab("login");
      // App.jsx will pass user after auth state change; we’ll decide setup in init effect.
    } else {
      notify("Account created. Check your email if verification is enabled.");
      setAuthTab("login");
    }
  }

  async function sendReset() {
    if (!email) return notify("Enter your email first");
    setBusy(true);

    // ✅ same-tab flow: user clicks email link -> returns to SAME APP url (Netlify)
    const redirectTo = window.location.origin; // keeps it on same domain/tab
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setBusy(false);
    if (error) return notify(error.message);
    notify("Password reset email sent. Open it, then come back here.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // =========================
  // PROFILE HELPERS
  // =========================
  async function refreshAvatarSignedUrl(avatarPath) {
    if (!avatarPath) {
      setAvatarSrc(null);
      return;
    }
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(avatarPath, 60 * 30);
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
      // ✅ Create blank profile (NO default name to avoid “resetting”)
      const { error: insErr } = await supabase.from("profiles").insert({
        id: u.id,
        name: "",
        section: "",
        school: "",
        updated_at: new Date().toISOString(),
        avatar_path: null,
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
      return data;
    }
    return null;
  }

  async function saveProfile(next) {
    if (!user?.id) return;

    // optimistic
    setProfile(next);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: next.name ?? "",
        section: next.section ?? "",
        school: next.school ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id,name,section,school,avatar_path,updated_at")
      .maybeSingle();

    if (error) {
      console.error("saveProfile error:", error);
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }
    notify("Profile saved");
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
      return notify("Avatar upload failed");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      console.error(error);
      return notify("Failed to save avatar");
    }

    await loadProfile(user.id);
    notify("Avatar updated");
  }

  function isProfileComplete(p) {
    const nameOk = (p?.name ?? "").trim().length >= 2;
    const sectionOk = (p?.section ?? "").trim().length >= 2;
    const schoolOk = (p?.school ?? "").trim().length >= 2;
    return nameOk && sectionOk && schoolOk;
  }

  // ✅ init when user id available
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      await ensureProfile(user);
      const p = await loadProfile(user.id);

      // ✅ guide first-time users to setup profile first
      if (p && !isProfileComplete(p)) {
        setScreen("setupProfile");
        return;
      }

      // otherwise normal flow
      setScreen((prev) => (prev === "auth" || prev === "setupProfile" ? "home" : prev));
      await loadSubjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =========================
  // SUBJECTS
  // =========================
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
      return notify("Failed to load subjects");
    }

    // ✅ New account: empty subjects (NO premade)
    setSubjects(data ?? []);
  }

  async function addSubject() {
    if (!user?.id) return;

    const title = newSubTitle.trim();
    if (!title) return notify("Enter subject name");

    const nextSort = subjects.length ? Math.max(...subjects.map((s) => s.sort || 0)) + 1 : 1;

    const { error } = await supabase.from("subjects").insert({
      user_id: user.id,
      title,
      icon: newSubIcon,
      sort: nextSort,
    });

    if (error) {
      console.error(error);
      return notify("Failed to add subject");
    }

    setShowAddSubject(false);
    setNewSubTitle("");
    setNewSubIcon("📘");
    await loadSubjects();
    notify("Subject added");
  }

  async function deleteSubject(subjectId) {
    if (!user?.id) return;
    if (!confirm("Delete this subject?")) return;

    // delete files rows first (storage objects: optional cleanup)
    await supabase.from("files").delete().eq("user_id", user.id).eq("subject_id", subjectId);

    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id).eq("id", subjectId);
    if (error) {
      console.error(error);
      return notify("Failed to delete subject");
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

    setBusy(true);

    // 1) delete files rows
    await supabase.from("files").delete().eq("user_id", user.id);

    // 2) delete subjects
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    setBusy(false);

    if (error) {
      console.error(error);
      return notify("Delete all failed");
    }

    setSubjects([]);
    setSelectedSubject(null);
    setScreen("subjects");
    setShowDeleteAll(false);
    notify("All subjects deleted");
  }

  // =========================
  // FILES (preview/rename/delete smooth)
  // =========================
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
      return notify("Failed to load files");
    }
    setFiles(data ?? []);
  }

  function openFiles(cat) {
    if (!selectedSubject) return;
    setCategory(cat);
    setScreen("files");
    loadFiles(selectedSubject.id, cat);
  }

  function triggerUpload() {
    setShowUploadChooser(true);
  }

  async function uploadSelectedFile(file) {
    const f = file;
    if (!f || !user?.id || !selectedSubject || !category) return;

    const safeName = f.name.replace(/[^\w.\-]+/g, "_");
    const objectPath = `${user.id}/subjects/${selectedSubject.id}/${category}/${uid()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(objectPath, f, {
      contentType: f.type,
      cacheControl: "3600",
    });
    if (upErr) {
      console.error(upErr);
      return notify("Upload failed");
    }

    const { error: insErr } = await supabase.from("files").insert({
      user_id: user.id,
      subject_id: selectedSubject.id,
      category,
      title: f.name,
      object_path: objectPath,
      mime_type: f.type,
      size: f.size,
    });
    if (insErr) {
      console.error(insErr);
      return notify("Upload saved but DB insert failed");
    }

    notify("Uploaded");
    await loadFiles(selectedSubject.id, category);
  }

  async function handleUploadAny(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    setShowUploadChooser(false);
    if (!f) return;
    await uploadSelectedFile(f);
  }

  async function handleUploadCamera(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    setShowUploadChooser(false);
    if (!f) return;
    await uploadSelectedFile(f);
  }

  async function openPreview(fileRow) {
    if (!fileRow?.object_path) return;

    setPreviewBusy(true);
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(fileRow.object_path, 60 * 10);
    setPreviewBusy(false);

    if (error) {
      console.error(error);
      return notify("Preview failed");
    }

    setPreview({
      url: data?.signedUrl,
      title: fileRow.title,
      mime: fileRow.mime_type || "",
      isImg: isImage(fileRow.mime_type || ""),
    });
  }

  function closePreview() {
    setPreview(null);
  }

  function openOptions(fileRow) {
    setOptionsFor(fileRow);
    setRenameTitle(fileRow?.title || "");
  }

  function closeOptions() {
    setOptionsFor(null);
    setShowRename(false);
    setRenameTitle("");
  }

  async function renameFile() {
    if (!user?.id || !optionsFor) return;
    const newName = renameTitle.trim();
    if (!newName) return notify("Enter new name");

    const { error } = await supabase
      .from("files")
      .update({ title: newName })
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    if (error) {
      console.error(error);
      return notify("Rename failed");
    }

    notify("Renamed");
    closeOptions();
    await loadFiles(selectedSubject.id, category);
  }

  async function deleteFile() {
    if (!user?.id || !optionsFor) return;
    if (!confirm("Delete this file?")) return;

    const { error: stErr } = await supabase.storage.from("portfolio").remove([optionsFor.object_path]);
    if (stErr) {
      console.error(stErr);
      return notify("Storage delete failed");
    }

    const { error } = await supabase.from("files").delete().eq("user_id", user.id).eq("id", optionsFor.id);
    if (error) {
      console.error(error);
      return notify("DB delete failed");
    }

    notify("Deleted");
    closeOptions();
    await loadFiles(selectedSubject.id, category);
  }

  // Back navigation
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "setupProfile") setScreen("auth");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  // =========================
  // RENDER: AUTH / SETUP / MAIN
  // =========================

  // ✅ AUTH PAGE (NO LOGO FEATURE)
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          {/* Tabs (Login / Sign Up) + Forgot link below */}
          <div className="auth-tabs">
            <button
              className={"tab " + (authTab === "login" ? "active" : "")}
              onClick={() => setAuthTab("login")}
              disabled={busy}
            >
              Login
            </button>
            <button
              className={"tab " + (authTab === "signup" ? "active" : "")}
              onClick={() => setAuthTab("signup")}
              disabled={busy}
            >
              Create
            </button>
          </div>

          <div className="auth-banner">
            Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
          </div>

          <div className="subtle" style={{ marginTop: 10 }}>
            {authTab === "signup" ? "Create an account to start your portfolio." : "Login to sync your portfolio across devices."}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>EMAIL</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" />
          </div>

          <div className="field">
            <label>PASSWORD</label>
            <div className="pw-wrap">
              <input
                type={showPw ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
              />
              <button className="eye" onClick={() => setShowPw((v) => !v)} type="button" aria-label="toggle password">
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {authTab === "signup" && (
            <div className="field">
              <label>CONFIRM PASSWORD</label>
              <div className="pw-wrap">
                <input
                  type={showPw2 ? "text" : "password"}
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  placeholder="••••••••"
                />
                <button className="eye" onClick={() => setShowPw2((v) => !v)} type="button" aria-label="toggle password 2">
                  {showPw2 ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions">
            {authTab === "login" ? (
              <button className="small-btn primary" onClick={signIn} disabled={busy}>
                {busy ? "Please wait…" : "Login"}
              </button>
            ) : (
              <button className="small-btn primary" onClick={signUp} disabled={busy}>
                {busy ? "Please wait…" : "Create Account"}
              </button>
            )}
          </div>

          {/* Forgot password BELOW only (no extra tab) */}
          <div style={{ marginTop: 12 }}>
            <button
              className="small-btn"
              onClick={sendReset}
              disabled={busy}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {busy ? "Please wait…" : "Forgot Password"}
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ✅ SETUP PROFILE SCREEN (first login / incomplete profile)
  if (screen === "setupProfile") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <button className="back-btn" onClick={back} title="Back">
              ←
            </button>
            <div className="brand">SETUP PROFILE</div>
          </div>
          <div />
        </div>

        <div className="white-surface">
          <div style={{ fontWeight: 900, fontSize: 18 }}>Set up your profile</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Fill this once. After saving, you will go straight to the dashboard.
          </div>

          <div className="profile-card">
            <div
              className="avatar"
              onClick={() => document.getElementById("avatarInputSetup").click()}
              style={{ cursor: "pointer" }}
              title="Change photo"
            >
              {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <div style={{ fontSize: 28 }}>👤</div>}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Profile Photo</div>
              <div className="subtle" style={{ margin: 0 }}>
                Tap to upload (optional)
              </div>
            </div>
          </div>

          <input
            id="avatarInputSetup"
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
            <button
              className="small-btn primary"
              onClick={async () => {
                await saveProfile(profile);
                // ✅ go to dashboard immediately (no sign-in again)
                setScreen("home");
                await loadSubjects();
              }}
            >
              Save & Continue
            </button>
            <button className="small-btn" onClick={signOut}>
              Logout
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // --------- PART 1 ENDS HERE ----------
  // Part 2 will include:
  // - main topbar + home/profile/subjects/folders/files UI
  // - Add Subject modal UI (improved, not just alert)
  // - preview modal (tap outside to close)
  // - file options modal (3 dots -> rename/delete)
  // - bottom navigation and FAB behavior fixes
  // ========= MAIN UI =========
  return (
    <div className="app-shell">
      {/* TOP BAR */}
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
          <div className="hero">Hi, {(profile?.name || "STUDENT").toUpperCase()}</div>
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

      {/* PROFILE */}
      {screen === "profile" && (
        <div className="white-surface">
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
              <div style={{ fontWeight: 900, fontSize: 18 }}>My Profile</div>
              <div className="subtle" style={{ margin: 0 }}>
                Tap avatar to change photo
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
          <div className="subtle" style={{ marginBottom: 10 }}>
            Tap a subject to open. Add or delete subjects anytime.
          </div>

          {/* Top actions */}
          <div className="actions-row">
            <button className="small-btn primary" onClick={() => setShowAddSubject(true)}>
              + Add Subject
            </button>
            <button className="small-btn danger" onClick={() => setShowDeleteAll(true)} disabled={busy || subjects.length === 0}>
              Delete All
            </button>
          </div>

          {loadingSubjects ? (
            <div className="subtle" style={{ marginTop: 12 }}>
              Loading…
            </div>
          ) : subjects.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 46 }}>📚</div>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>No subjects yet</div>
              <div className="subtle" style={{ marginTop: 6 }}>
                Click “Add Subject” to create your first one.
              </div>
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
          <div className="subtle">Tap a file to preview. Use ⋯ for rename/delete.</div>

          <div className="file-list">
            {loadingFiles ? (
              <div className="subtle">Loading…</div>
            ) : files.length === 0 ? (
              <div className="empty" style={{ padding: "34px 8px" }}>
                <div style={{ fontSize: 44 }}>📄</div>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>No files yet</div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  Click + to upload your work.
                </div>
              </div>
            ) : (
              files.map((f) => (
                <div key={f.id} className="file-item">
                  <div
                    className="file-thumb"
                    onClick={() => openPreview(f)}
                    style={{ cursor: "pointer" }}
                    title="Open preview"
                  >
                    {isImage(f.mime_type || "") ? (
                      <div style={{ fontSize: 22 }}>🖼️</div>
                    ) : (
                      <div style={{ fontSize: 22 }}>📄</div>
                    )}
                  </div>

                  <div className="file-meta" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {f.mime_type || "file"} {f.size ? `• ${fmtBytes(f.size)}` : ""}
                    </div>
                  </div>

                  {/* 3-dots options */}
                  <button
                    className="kebab kebab-dark"
                    onClick={() => openOptions(f)}
                    title="Options"
                    type="button"
                  >
                    ⋯
                  </button>
                </div>
              ))
            )}
          </div>

          {/* FAB upload */}
          <button className="fab" onClick={triggerUpload} title="Upload">
            +
          </button>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="bottom-nav">
        <button className={"nav-btn " + (screen === "home" ? "active" : "")} onClick={() => setScreen("home")}>
          🏠 <span>Home</span>
        </button>
        <button className={"nav-btn " + (screen === "subjects" ? "active" : "")} onClick={() => setScreen("subjects")}>
          📚 <span>Subjects</span>
        </button>
        <button className={"nav-btn " + (screen === "profile" ? "active" : "")} onClick={() => setScreen("profile")}>
          👤 <span>Profile</span>
        </button>
      </div>

      {/* Upload chooser modal (mobile) */}
      {showUploadChooser && (
        <div className="modal-bg" onClick={() => setShowUploadChooser(false)}>
          <div className="white-surface modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Upload</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Choose file or take a photo.
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={() => fileRef.current?.click()}>
                📁 Choose File
              </button>
              <button className="small-btn" onClick={() => cameraRef.current?.click()}>
                📷 Camera
              </button>
              <button className="small-btn" onClick={() => setShowUploadChooser(false)}>
                Cancel
              </button>
            </div>

            <input ref={fileRef} type="file" hidden onChange={handleUploadAny} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleUploadCamera} />
          </div>
        </div>
      )}

      {/* Add Subject modal (improved UI, not just toast) */}
      {showAddSubject && (
        <div className="modal-bg" onClick={() => setShowAddSubject(false)}>
          <div className="white-surface modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Add Subject</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Choose an icon and name your subject.
            </div>

            <div className="field">
              <label>SUBJECT NAME</label>
              <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} placeholder="e.g. Mathematics" />
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label>ICON</label>
              <div className="icon-grid">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={"icon-pick " + (newSubIcon === ic ? "active" : "")}
                    onClick={() => setNewSubIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
              <button className="small-btn" onClick={() => setShowAddSubject(false)}>
                Cancel
              </button>
              <button className="small-btn primary" onClick={addSubject}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete all confirm modal */}
      {showDeleteAll && (
        <div className="modal-bg" onClick={() => setShowDeleteAll(false)}>
          <div className="white-surface modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>Delete all subjects?</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              This will remove all subjects and their file records. (Storage files may remain unless you clean them later.)
            </div>

            <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
              <button className="small-btn" onClick={() => setShowDeleteAll(false)}>
                Cancel
              </button>
              <button className="small-btn danger" onClick={deleteAllSubjects} disabled={busy}>
                {busy ? "Deleting…" : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal (smooth, tap outside closes) */}
      {(preview || previewBusy) && (
        <div className="modal-bg" onClick={closePreview}>
          <div className="white-surface modal preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-top">
              <div style={{ fontWeight: 900, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {previewBusy ? "Loading preview…" : (preview?.title || "Preview")}
              </div>
              <button className="small-btn" onClick={closePreview} type="button">
                Close
              </button>
            </div>

            <div className="preview-body">
              {previewBusy ? (
                <div className="subtle">Please wait…</div>
              ) : preview?.isImg ? (
                <img className="preview-img preview-fit" src={preview.url} alt="preview" />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="subtle">This file is not an image.</div>
                  <a className="small-btn primary" href={preview?.url} target="_blank" rel="noreferrer">
                    Open / Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File options modal (⋯ -> rename/delete) */}
      {optionsFor && (
        <div className="modal-bg" onClick={closeOptions}>
          <div className="white-surface modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>File Options</div>
            <div className="subtle" style={{ marginTop: 6, wordBreak: "break-word" }}>
              {optionsFor.title}
            </div>

            {!showRename ? (
              <div className="modal-actions">
                <button className="small-btn primary" onClick={() => setShowRename(true)}>
                  Rename
                </button>
                <button className="small-btn danger" onClick={deleteFile}>
                  Delete
                </button>
                <button className="small-btn" onClick={closeOptions}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>NEW NAME</label>
                  <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
                </div>

                <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
                  <button className="small-btn" onClick={() => setShowRename(false)}>
                    Back
                  </button>
                  <button className="small-btn primary" onClick={renameFile}>
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
