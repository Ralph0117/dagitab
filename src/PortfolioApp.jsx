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
  // =========================================================
  // ROUTING / UI STATES
  // =========================================================
  const [screen, setScreen] = useState(user ? "home" : "auth");
  // auth | home | profileSetup | profile | subjects | folders | files

  const [toast, setToast] = useState("");

  // AUTH UI
  const [authTab, setAuthTab] = useState("login"); // "login" | "signup"
  const [authMode, setAuthMode] = useState("main"); // "main" | "forgot" | "reset"
  const [isRecovery, setIsRecovery] = useState(false);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState(""); // for signup confirm
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // reset password inputs
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showNewPass2, setShowNewPass2] = useState(false);

  // PROFILE
  const [profile, setProfile] = useState({
    id: null,
    name: "",
    section: "",
    school: "",
    avatar_path: null,
    updated_at: null,
  });
  const [avatarSrc, setAvatarSrc] = useState(null);

  // SUBJECTS
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // add subject modal
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubIcon, setNewSubIcon] = useState("📘");

  // NAV
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [category, setCategory] = useState(null); // performance | written

  // FILES
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // upload chooser + inputs (mobile)
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // modals
  const [preview, setPreview] = useState(null); // {url,title,mime}
  const [optionsFor, setOptionsFor] = useState(null); // file row
  const [renameTitle, setRenameTitle] = useState("");

  // =========================================================
  // UTIL
  // =========================================================
  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1800);
  }

  // Title in top bar
  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile") return "PROFILE";
    if (screen === "profileSetup") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    return "DAGITAB";
  }, [screen]);

  // Keep screen synced with auth state
  useEffect(() => {
    setScreen(user ? (prev) => (prev === "auth" ? "home" : prev) : "auth");
  }, [user]);

  // =========================================================
  // ✅ RESET PASSWORD FLOW (new tab /reset)
  // =========================================================
  const SITE_URL = window.location.origin;
  const RESET_REDIRECT_URL = `${SITE_URL}/reset`;

  // If user opened the email link, they land on /reset
  useEffect(() => {
    const path = (window.location.pathname || "").toLowerCase();
    const isResetRoute = path.includes("/reset");
    if (!isResetRoute) return;

    // show reset UI
    setScreen("auth");
    setAuthMode("reset");
    setIsRecovery(true);
  }, []);

  async function sendResetEmail() {
    const em = email.trim();
    if (!em) return notify("Enter your email first");

    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: RESET_REDIRECT_URL,
    });

    if (error) {
      console.error(error);
      return notify(error.message || "Failed to send reset email");
    }

    notify("Reset link sent. Check your email.");
  }

  async function updatePasswordNow() {
    if (!newPass || newPass.length < 6) return notify("Password must be at least 6 characters");
    if (newPass !== newPass2) return notify("Passwords do not match");

    const { error } = await supabase.auth.updateUser({ password: newPass });

    if (error) {
      console.error(error);
      return notify(error.message || "Failed to update password");
    }

    notify("Password updated. You can login now.");

    // ✅ clean /reset URL so refresh doesn't keep showing reset
    try {
      window.history.replaceState({}, document.title, "/");
    } catch {}

    setIsRecovery(false);
    setAuthMode("main");
    setAuthTab("login");
    setNewPass("");
    setNewPass2("");
  }

  // =========================================================
  // AUTH (login/signup/logout)
  // =========================================================
  async function signIn() {
    const em = email.trim();
    if (!em) return notify("Enter email");
    if (!pass) return notify("Enter password");

    const { error } = await supabase.auth.signInWithPassword({
      email: em,
      password: pass,
    });

    if (error) return notify(error.message);
  }

  async function signUp() {
    const em = email.trim();
    if (!em) return notify("Enter email");
    if (!pass) return notify("Enter password");
    if (pass.length < 6) return notify("Password must be at least 6 characters");
    if (pass !== pass2) return notify("Passwords do not match");

    const { error } = await supabase.auth.signUp({
      email: em,
      password: pass,
    });

    if (error) return notify(error.message);

    notify("Account created. Logging you in…");

    // ✅ Immediately sign in so user can continue without reopening/refresh
    const { error: inErr } = await supabase.auth.signInWithPassword({
      email: em,
      password: pass,
    });

    if (inErr) return notify(inErr.message || "Created. Please login.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // =========================================================
  // PROFILE HELPERS (setup-first onboarding)
  // =========================================================
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

  // ✅ Ensures row exists. Returns {needsSetup:true/false}
  async function ensureProfile(u) {
    if (!u?.id) return { needsSetup: false };

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,updated_at")
      .eq("id", u.id)
      .maybeSingle();

    if (error) {
      console.error("ensureProfile error:", error);
      return { needsSetup: false };
    }

    // ✅ If missing, create EMPTY profile (no overwriting defaults)
    if (!data) {
      const { error: insErr } = await supabase.from("profiles").insert({
        id: u.id,
        name: "",
        section: "",
        school: "",
        avatar_path: null,
        updated_at: new Date().toISOString(),
      });

      if (insErr) {
        console.error("ensureProfile insert error:", insErr);
        return { needsSetup: false };
      }

      return { needsSetup: true };
    }

    const complete =
      (data.name || "").trim().length > 0 &&
      (data.section || "").trim().length > 0 &&
      (data.school || "").trim().length > 0;

    return { needsSetup: !complete };
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
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;

    // optimistic UI
    setProfile(next);

    const payload = {
      name: (next.name ?? "").trim(),
      section: (next.section ?? "").trim(),
      school: (next.school ?? "").trim(),
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
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }

    notify("Profile saved");

    // ✅ onboarding: after Save, go straight to dashboard
    if (screen === "profileSetup") {
      setScreen("home");
    }
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;

    const path = `${user.id}/profile/avatar.jpg`;

    const { error: upErr } = await supabase.storage
      .from("portfolio")
      .upload(path, file, {
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

  // ✅ Run once when user becomes available
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      const res = await ensureProfile(user);
      await loadProfile(user.id);

      // NOTE: loadSubjects is in Part 2 (we call it after definition)
      // We will call it in Part 2.

      if (res?.needsSetup) {
        setScreen("profileSetup");
        notify("Please complete your profile first.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =========================================================
  // SUBJECTS (Part 2 continues: loadSubjects, add/delete, files, UI)
  // =========================================================
  // =========================================================
  // SUBJECTS
  // =========================================================

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

    // ✅ New accounts should start EMPTY subjects (as requested)
    setSubjects(data ?? []);
  }

  async function addSubject() {
    if (!user?.id) return;

    const title = newSubTitle.trim();
    if (!title) return notify("Enter subject name");

    const nextSort = subjects.length
      ? Math.max(...subjects.map((s) => s.sort || 0)) + 1
      : 1;

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

    // delete DB file rows first (optional: remove storage objects too)
    await supabase.from("files").delete().eq("user_id", user.id).eq("subject_id", subjectId);

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("user_id", user.id)
      .eq("id", subjectId);

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
    if (!confirm("Delete ALL subjects and their files?")) return;

    // delete all files rows
    await supabase.from("files").delete().eq("user_id", user.id);

    // delete all subjects rows
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    if (error) {
      console.error(error);
      return notify("Failed to delete all subjects");
    }

    setSelectedSubject(null);
    setCategory(null);
    setFiles([]);
    await loadSubjects();
    notify("All subjects deleted");
  }

  // ✅ Call loadSubjects once it exists (fix for Part 1 effect)
  useEffect(() => {
    if (!user?.id) return;
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =========================================================
  // FILES
  // =========================================================

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
    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(fileRow.object_path, 60 * 10);

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

    const { error: stErr } = await supabase.storage
      .from("portfolio")
      .remove([optionsFor.object_path]);

    if (stErr) {
      console.error(stErr);
      return notify("Storage delete failed");
    }

    const { error } = await supabase
      .from("files")
      .delete()
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    if (error) {
      console.error(error);
      return notify("DB delete failed");
    }

    setOptionsFor(null);
    notify("Deleted");
    await loadFiles(selectedSubject.id, category);
  }

  // =========================================================
  // NAV BACK
  // =========================================================
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "profileSetup") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  // =========================================================
  // UI: AUTH
  // =========================================================
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            {/* ✅ Tabs only for main auth */}
            {authMode === "main" && (
              <div className="auth-tabs">
                <button
                  className={"tab " + (authTab === "login" ? "active" : "")}
                  onClick={() => setAuthTab("login")}
                >
                  Login
                </button>
                <button
                  className={"tab " + (authTab === "signup" ? "active" : "")}
                  onClick={() => setAuthTab("signup")}
                >
                  Create
                </button>
              </div>
            )}

            {/* ✅ Reset password screen (when user opens /reset link) */}
            {authMode === "reset" && (
              <>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>
                  Set New Password
                </div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  Enter your new password.
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
                    >
                      {showNewPass2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="small-btn primary" onClick={updatePasswordNow}>
                    Save New Password
                  </button>
                </div>
              </>
            )}

            {/* ✅ Forgot password screen (sends email) */}
            {authMode === "forgot" && (
              <>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>
                  Forgot Password
                </div>

                <div className="subtle" style={{ marginTop: 6 }}>
                  Enter your email. We will send a reset link.
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email"
                  />
                </div>

                <div className="modal-actions">
                  <button className="small-btn primary" onClick={sendResetEmail}>
                    Send Reset Link
                  </button>
                  <button
                    className="small-btn"
                    onClick={() => {
                      setAuthMode("main");
                      setAuthTab("login");
                    }}
                  >
                    Back
                  </button>
                </div>
              </>
            )}

            {/* ✅ Main login/signup */}
            {authMode === "main" && (
              <>
                <div className="auth-banner">
                  Digital Application for Guiding and Improving Tasks, Academics, and
                  Bibliographies for students
                </div>

                <div className="subtle" style={{ marginTop: 10 }}>
                  Login to sync your portfolio across devices.
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email"
                  />
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
                    <button className="eye" type="button" onClick={() => setShowPass((v) => !v)}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {authTab === "signup" && (
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
                      >
                        {showPass2 ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="modal-actions">
                  {authTab === "login" ? (
                    <button className="small-btn primary" onClick={signIn}>
                      Login
                    </button>
                  ) : (
                    <button className="small-btn primary" onClick={signUp}>
                      Create Account
                    </button>
                  )}

                  <button className="small-btn" onClick={() => setAuthMode("forgot")}>
                    Forgot Password
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // =========================================================
  // UI: MAIN SHELL
  // =========================================================
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
          <div className="hero">Hi, {(profile?.name || "STUDENT").trim() || "STUDENT"}</div>
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

      {/* PROFILE SETUP (forced on new accounts) */}
      {screen === "profileSetup" && (
        <div className="white-surface">
          <div style={{ fontWeight: 900, fontSize: 18 }}>Setup Profile</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Complete this once to start using your account.
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
              <div style={{ fontWeight: 900 }}>Profile Photo</div>
              <div className="subtle" style={{ margin: 0 }}>Optional</div>
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
            <input
              value={profile.name || ""}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>

          <div className="field">
            <label>SECTION</label>
            <input
              value={profile.section || ""}
              onChange={(e) => setProfile({ ...profile, section: e.target.value })}
            />
          </div>

          <div className="field">
            <label>SCHOOL</label>
            <input
              value={profile.school || ""}
              onChange={(e) => setProfile({ ...profile, school: e.target.value })}
            />
          </div>

          <div className="modal-actions">
            <button
              className="small-btn primary"
              onClick={() => {
                const ok =
                  (profile.name || "").trim() &&
                  (profile.section || "").trim() &&
                  (profile.school || "").trim();
                if (!ok) return notify("Please complete all fields");
                saveProfile(profile);
              }}
            >
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
          <div className="subtle">Add subjects, choose an icon, or delete them.</div>

          <div className="modal-actions" style={{ marginTop: 6 }}>
            <button className="small-btn primary" onClick={() => setShowAddSubject(true)}>
              + Add Subject
            </button>
            <button className="small-btn danger" onClick={deleteAllSubjects}>
              Delete All
            </button>
          </div>

          {loadingSubjects ? (
            <div className="subtle" style={{ marginTop: 10 }}>Loading…</div>
          ) : subjects.length === 0 ? (
            <div className="subtle" style={{ marginTop: 18, textAlign: "center" }}>
              <div style={{ fontSize: 44 }}>📚</div>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>No subjects yet</div>
              <div>Click “Add Subject” to create one.</div>
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
                <div>Click + to upload your work.</div>
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
                      <div style={{ fontWeight: 900, color: "#1e49d6" }}>IMG</div>
                    ) : (
                      <div style={{ fontWeight: 900, color: "#1e49d6" }}>FILE</div>
                    )}
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

          <button className="fab" onClick={triggerUpload} title="Upload">
            +
          </button>
        </div>
      )}

      {/* Upload chooser modal */}
      {showUploadChooser && (
        <div className="modal-overlay" onClick={() => setShowUploadChooser(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Upload</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Choose how to upload.
            </div>

            <div className="modal-actions">
              <button
                className="small-btn primary"
                onClick={() => {
                  fileRef.current?.click();
                }}
              >
                📄 Choose File
              </button>

              <button
                className="small-btn"
                onClick={() => {
                  cameraRef.current?.click();
                }}
              >
                📷 Camera
              </button>

              <button className="small-btn" onClick={() => setShowUploadChooser(false)}>
                Cancel
              </button>
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
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="modal-overlay preview-overlay"
          onClick={() => setPreview(null)}
          title="Tap to close"
        >
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
                <iframe
                  className="preview-frame"
                  src={preview.url}
                  title="preview"
                  style={{ height: "70vh" }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Options modal (rename/delete) */}
      {optionsFor && (
        <div className="modal-overlay" onClick={() => setOptionsFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900 }}>Options</div>

            <div className="field" style={{ marginTop: 10 }}>
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

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className={"bn " + (screen === "home" ? "active" : "")} onClick={() => setScreen("home")}>
          🏠<span>Home</span>
        </button>
        <button
          className={"bn " + (screen === "subjects" ? "active" : "")}
          onClick={() => setScreen("subjects")}
        >
          📘<span>Subjects</span>
        </button>
        <button className={"bn " + (screen === "profile" ? "active" : "")} onClick={() => setScreen("profile")}>
          👤<span>Profile</span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* keep user out of nav when onboarding */}
      {screen === "profileSetup" && (
        <style>{`
          .bottom-nav{ display:none; }
          .fab{ display:none; }
        `}</style>
      )}
    </div>
  );
}
