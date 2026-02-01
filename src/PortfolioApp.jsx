import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/** ✅ Mobile-safe unique id (replaces crypto.randomUUID) */
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
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | home | setup | profile | subjects | folders | files
  const [toast, setToast] = useState("");

  // AUTH UI state (tabs)
  // login | signup | forgot | reset
  const [authMode, setAuthMode] = useState("login");

  // auth ui
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState(""); // confirm password (signup)
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // reset password fields
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showNewPass2, setShowNewPass2] = useState(false);

  // profile
  const [profile, setProfile] = useState({
    id: null,
    name: "STUDENT 1",
    section: "12-FARADAY",
    school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
    avatar_path: null,
  });
  const [avatarSrc, setAvatarSrc] = useState(null);

  // subjects
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // add subject modal
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubIcon, setNewSubIcon] = useState("📘");

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

  // modals
  const [preview, setPreview] = useState(null); // {url,title,mime}
  const [optionsFor, setOptionsFor] = useState(null); // file row
  const [renameTitle, setRenameTitle] = useState("");

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
    if (screen === "setup") return "SETUP";
    if (screen === "profile") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    return "DAGITAB";
  }, [screen]);

  // =========================================================
  // ✅ PASSWORD RESET FIX: detect recovery link and show reset UI
  // =========================================================
  useEffect(() => {
    // 1) If link arrives with type=recovery (query) or access_token (hash), open reset mode.
    const href = window.location.href;
    const qs = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";

    const isRecoveryQuery = qs.get("type") === "recovery";
    const hasAccessToken = hash.includes("access_token=");
    const hasRecoveryInHash = hash.includes("type=recovery");

    if ((isRecoveryQuery || hasAccessToken || hasRecoveryInHash) && screen === "auth") {
      setAuthMode("reset");
    }

    // 2) Also listen to Supabase auth event PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("auth");
        setAuthMode("reset");
      }
    });

    return () => sub?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========= AUTH =========
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) return notify(error.message);
  }

  async function signUp() {
    if (pass.length < 6) return notify("Password must be at least 6 characters");
    if (pass !== pass2) return notify("Passwords do not match");

    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
    });

    if (error) return notify(error.message);

    // ✅ if email confirm is OFF, user is signed in immediately.
    // If email confirm is ON, they must verify first.
    notify("Account created. If email verification is ON, check your email.");
  }

  async function sendResetEmail() {
    if (!email) return notify("Enter your email first");

    // ✅ critical: redirect back to same tab/site
    // Netlify will serve your app at window.location.origin
    const redirectTo = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) return notify(error.message);

    notify("Reset email sent. Open it and you'll be redirected here.");
  }

  async function updatePasswordNow() {
    if (newPass.length < 6) return notify("Password must be at least 6 characters");
    if (newPass !== newPass2) return notify("Passwords do not match");

    // ✅ when user came from recovery link, supabase creates a recovery session
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) return notify(error.message);

    // Clean up UI fields
    setNewPass("");
    setNewPass2("");

    notify("Password updated. You can login now.");
    setAuthMode("login");

    // Optional: remove hash tokens from URL so refresh won't reopen reset screen
    if (window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= PROFILE / SUBJECTS / FILES =========
  // (rest continues in PART 2...)
  // ========= PROFILE =========
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
      .select("id,name,section,school,avatar_path")
      .eq("id", u.id)
      .maybeSingle();

    if (error) {
      console.error("ensureProfile error:", error);
      return;
    }

    if (!data) {
      const { error: insErr } = await supabase.from("profiles").insert({
        id: u.id,
        name: "STUDENT 1",
        section: "12-FARADAY",
        school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
        updated_at: new Date().toISOString(),
        avatar_path: null,
      });
      if (insErr) console.error("ensureProfile insert error:", insErr);
    }
  }

  async function loadProfile(uid) {
    if (!uid) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,updated_at")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.error("loadProfile error:", error);
      return;
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;

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

  // init profile + subjects only when user is ready
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ========= SUBJECTS =========
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
    if (!confirm("Delete ALL subjects and files?")) return;

    await supabase.from("files").delete().eq("user_id", user.id);
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    if (error) {
      console.error(error);
      return notify("Failed to delete all subjects");
    }

    setSelectedSubject(null);
    setCategory(null);
    setFiles([]);
    await loadSubjects();
    setScreen("subjects");
    notify("All subjects deleted");
  }

  // ========= FILES =========
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
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(fileRow.object_path, 60 * 10);
    if (error) {
      console.error(error);
      return notify("Preview failed");
    }
    setPreview({
      url: data.signedUrl,
      title: fileRow.title,
      mime: fileRow.mime_type || "",
    });
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

    setOptionsFor(null);
    setRenameTitle("");
    notify("Renamed");
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

    setOptionsFor(null);
    notify("Deleted");
    await loadFiles(selectedSubject.id, category);
  }

  // Back navigation
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  // ========= AUTH PAGE =========
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            {/* Tabs: Login / Sign Up (no extra forgot tab) */}
            <div className="auth-tabs">
              <button
                className={`tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                className={`tab ${authMode === "signup" ? "active" : ""}`}
                onClick={() => setAuthMode("signup")}
              >
                Sign Up
              </button>
            </div>

            {/* Reset password prompt (auto opens from email link) */}
            {authMode === "reset" ? (
              <>
                <div className="auth-banner">
                  Set a new password for your account.
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>NEW PASSWORD</label>
                  <div className="pw-wrap">
                    <input
                      type={showNewPass ? "text" : "password"}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      className="eye"
                      type="button"
                      onClick={() => setShowNewPass((v) => !v)}
                      title="Show/Hide"
                    >
                      {showNewPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>CONFIRM PASSWORD</label>
                  <div className="pw-wrap">
                    <input
                      type={showNewPass2 ? "text" : "password"}
                      value={newPass2}
                      onChange={(e) => setNewPass2(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      className="eye"
                      type="button"
                      onClick={() => setShowNewPass2((v) => !v)}
                      title="Show/Hide"
                    >
                      {showNewPass2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="small-btn primary" onClick={updatePasswordNow}>
                    Update Password
                  </button>
                  <button className="small-btn" onClick={() => setAuthMode("login")}>
                    Back to Login
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    <button
                      className="eye"
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      title="Show/Hide"
                    >
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {authMode === "signup" && (
                  <div className="field">
                    <label>CONFIRM PASSWORD</label>
                    <div className="pw-wrap">
                      <input
                        type={showPass2 ? "text" : "password"}
                        value={pass2}
                        onChange={(e) => setPass2(e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        className="eye"
                        type="button"
                        onClick={() => setShowPass2((v) => !v)}
                        title="Show/Hide"
                      >
                        {showPass2 ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="modal-actions">
                  {authMode === "login" ? (
                    <button className="small-btn primary" onClick={signIn}>
                      Login
                    </button>
                  ) : (
                    <button className="small-btn primary" onClick={signUp}>
                      Create Account
                    </button>
                  )}
                </div>

                {/* ✅ Forgot password below (no extra tab) */}
                <button
                  className="link-btn"
                  onClick={() => {
                    sendResetEmail();
                  }}
                >
                  Forgot password?
                </button>
              </>
            )}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ========= MAIN UI =========
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
          <div className="hero">Hi, {profile?.name || "STUDENT"}</div>
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
          <div className="subtle">Tap a subject. Add or delete subjects.</div>

          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button className="small-btn primary" onClick={() => setShowAddSubject(true)}>
              + Add Subject
            </button>
            <button className="small-btn danger" onClick={deleteAllSubjects}>
              Delete All
            </button>
          </div>

          {loadingSubjects ? (
            <div className="subtle" style={{ marginTop: 10 }}>
              Loading…
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

          {/* Add Subject Modal */}
          {showAddSubject && (
            <div className="modal-overlay" onClick={() => setShowAddSubject(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Add Subject</div>

                <div className="field">
                  <label>SUBJECT NAME</label>
                  <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} />
                </div>

                <div style={{ marginTop: 10, fontWeight: 900, fontSize: 12, color: "#0f172a", opacity: 0.75 }}>
                  ICON
                </div>

                <div className="icon-grid">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      className={`icon-pick ${newSubIcon === ic ? "active" : ""}`}
                      onClick={() => setNewSubIcon(ic)}
                      type="button"
                    >
                      {ic}
                    </button>
                  ))}
                </div>

                <div className="modal-actions">
                  <button className="small-btn primary" onClick={addSubject}>
                    Save
                  </button>
                  <button className="small-btn" onClick={() => setShowAddSubject(false)}>
                    Cancel
                  </button>
                </div>
              </div>
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
          <div className="subtle">Upload using the + button.</div>

          <div className="file-list">
            {loadingFiles ? (
              <div className="subtle">Loading…</div>
            ) : files.length === 0 ? (
              <div className="subtle" style={{ textAlign: "center", padding: "40px 10px" }}>
                <div style={{ fontSize: 44 }}>📄</div>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>No files yet</div>
                <div>Click + to upload your work.</div>
              </div>
            ) : (
              files.map((f) => (
                <div key={f.id} className="file-item">
                  <div className="file-thumb" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    {isImage(f.mime_type || "") ? "🖼️" : "📄"}
                  </div>

                  <div className="file-meta" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {fmtBytes(f.size)} • {new Date(f.created_at).toLocaleString()}
                    </div>
                  </div>

                  <button
                    className="kebab"
                    onClick={() => {
                      setOptionsFor(f);
                      setRenameTitle(f.title || "");
                    }}
                    title="Options"
                  >
                    ⋯
                  </button>
                </div>
              ))
            )}
          </div>

          <button className="fab" onClick={triggerUpload}>
            +
          </button>

          {/* Upload chooser */}
          {showUploadChooser && (
            <div className="modal-overlay" onClick={() => setShowUploadChooser(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900 }}>Upload</div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  Choose file or camera
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleUploadAny}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={handleUploadCamera}
                />

                <div className="modal-actions">
                  <button className="small-btn primary" onClick={() => fileRef.current?.click()}>
                    Choose File
                  </button>
                  <button className="small-btn" onClick={() => cameraRef.current?.click()}>
                    Use Camera
                  </button>
                  <button className="small-btn" onClick={() => setShowUploadChooser(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview modal */}
          {preview && (
            <div className="modal-overlay" onClick={() => setPreview(null)}>
              <div className="preview-card" onClick={(e) => e.stopPropagation()}>
                <div className="preview-top">
                  <div className="preview-title">{preview.title}</div>
                  <button className="small-btn" onClick={() => setPreview(null)}>
                    Close
                  </button>
                </div>

                <div className="preview-body">
                  {isImage(preview.mime) ? (
                    <img className="preview-img" src={preview.url} alt={preview.title} />
                  ) : (
                    <iframe className="preview-frame" src={preview.url} title="preview" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Options modal (rename / delete) */}
          {optionsFor && (
            <div className="modal-overlay" onClick={() => setOptionsFor(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900 }}>Options</div>

                <div className="field">
                  <label>RENAME</label>
                  <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
                </div>

                <div className="modal-actions">
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
        </div>
      )}

      {/* Bottom Nav */}
      <div className="bottom-nav">
        <button className={`bn ${screen === "home" ? "active" : ""}`} onClick={() => setScreen("home")}>
          🏠 <span>Home</span>
        </button>
        <button className={`bn ${screen === "subjects" ? "active" : ""}`} onClick={() => setScreen("subjects")}>
          📘 <span>Subjects</span>
        </button>
        <button className={`bn ${screen === "profile" ? "active" : ""}`} onClick={() => setScreen("profile")}>
          👤 <span>Profile</span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
