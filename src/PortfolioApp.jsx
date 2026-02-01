// src/PortfolioApp.jsx  (NEW — PART 1 / 2)
// Features in this version:
// ✅ Smooth UI states (busy/disabled buttons + fast toast)
// ✅ Sign up: confirm password + show/hide password (eye)
// ✅ New account: NO premade subjects
// ✅ After sign up + first login: guided Profile -> Save -> Dashboard (no re-login)
// ✅ Subjects: Delete ALL subjects button
// ✅ Forgot password: uses redirectTo=window.location.origin (opens same site; email link still opens a browser tab)
// ✅ Recovery link: auto-switch to "Set new password" screen

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/** Mobile-safe unique id */
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
  // screens
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | setpw | home | profile | subjects | folders | files

  // ui helpers
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1400);
  }

  // auth
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // forgot/reset
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  // guide flow (new account / first time profile)
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  // profile
  const [profile, setProfile] = useState({
    id: null,
    name: "STUDENT 1",
    section: "12-FARADAY",
    school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
    avatar_path: null,
    logo_path: null,
  });
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [logoSrc, setLogoSrc] = useState(null);

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

  // upload chooser
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // modals
  const [preview, setPreview] = useState(null);
  const [optionsFor, setOptionsFor] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");

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
    if (screen === "setpw") return "RESET";
    return "DAGITAB";
  }, [screen]);

  // ========= AUTH =========
  async function signIn() {
    if (busy) return;
    if (!email.trim() || !pass) return notify("Enter email and password");

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);

    if (error) return notify(error.message);
    // profile setup will be enforced once profile loads
  }

  async function signUp() {
    if (busy) return;
    const e = email.trim();
    if (!e || !pass) return notify("Enter email and password");
    if (pass.length < 6) return notify("Password must be at least 6 characters");
    if (pass !== pass2) return notify("Passwords do not match");

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: e, password: pass });
    setBusy(false);

    if (error) return notify(error.message);

    // If email verification is OFF => session exists => guide to profile immediately
    if (data?.session?.user?.id) {
      notify("Account created. Set up your profile.");
      setNeedsProfileSetup(true);
      // screen will switch from auth -> home automatically when user becomes available, then we force profile
    } else {
      // If email verification is ON
      notify("Account created. Verify email then login.");
      setAuthMode("login");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= FORGOT / RESET =========
  async function sendResetLink() {
    const em = resetEmail.trim();
    if (!em) return notify("Enter your email");
    if (busy) return;

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      // ✅ IMPORTANT: keeps it in your same deployed site (Netlify URL)
      redirectTo: window.location.origin,
    });
    setBusy(false);

    if (error) return notify(error.message);
    notify("Reset link sent. Check email.");
    setAuthMode("login");
  }

  // ✅ When user clicks reset-email link and comes back, Supabase fires PASSWORD_RECOVERY
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("setpw");
        notify("Set your new password.");
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function updatePassword() {
    if (busy) return;
    if (!newPassword || newPassword.length < 6) return notify("Password must be at least 6 characters");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (error) return notify(error.message);

    notify("Password updated. Login now.");
    setNewPassword("");
    await supabase.auth.signOut();
    setScreen("auth");
    setAuthMode("login");
  }

  // ========= PROFILE HELPERS =========
  function isFirstTimeProfile(p) {
    if (!p) return true;
    // treat default template as "needs setup"
    return !p.name || p.name.trim() === "" || p.name === "STUDENT 1";
  }

  async function refreshSignedImage(path, setter) {
    if (!path) return setter(null);
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(path, 60 * 30);
    if (error) {
      console.error(error);
      return setter(null);
    }
    setter(data?.signedUrl ?? null);
  }

  async function ensureProfile(u) {
    if (!u?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,logo_path")
      .eq("id", u.id)
      .maybeSingle();

    if (error) {
      console.error("ensureProfile error:", error);
      return;
    }

    // Insert only if missing (do NOT overwrite)
    if (!data) {
      const { error: insErr } = await supabase.from("profiles").insert({
        id: u.id,
        name: "STUDENT 1",
        section: "12-FARADAY",
        school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
        updated_at: new Date().toISOString(),
        avatar_path: null,
        logo_path: null,
      });
      if (insErr) console.error("ensureProfile insert error:", insErr);

      // new account -> force profile
      setNeedsProfileSetup(true);
    }
  }

  async function loadProfile(uid_) {
    if (!uid_) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,section,school,avatar_path,logo_path,updated_at")
      .eq("id", uid_)
      .maybeSingle();

    if (error) {
      console.error("loadProfile error:", error);
      return;
    }

    if (data) {
      setProfile((prev) => ({ ...prev, ...data }));
      await refreshSignedImage(data.avatar_path, setAvatarSrc);
      await refreshSignedImage(data.logo_path, setLogoSrc);

      // ✅ guided: go to profile immediately for new accounts / first time
      if (needsProfileSetup || isFirstTimeProfile(data)) {
        setScreen("profile");
      }
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;
    if (busy) return;

    // basic validation
    const nm = (next.name ?? "").trim();
    const sec = (next.section ?? "").trim();
    const sch = (next.school ?? "").trim();
    if (!nm || !sec || !sch) return notify("Please complete all profile fields");

    setBusy(true);
    setProfile(next);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: nm,
        section: sec,
        school: sch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id,name,section,school,avatar_path,logo_path,updated_at")
      .maybeSingle();

    setBusy(false);

    if (error) {
      console.error("saveProfile error:", error);
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile((prev) => ({ ...prev, ...data }));
      await refreshSignedImage(data.avatar_path, setAvatarSrc);
      await refreshSignedImage(data.logo_path, setLogoSrc);
    }

    notify("Profile saved");

    // ✅ smooth: after first setup, go dashboard instantly (no re-login)
    if (needsProfileSetup || isFirstTimeProfile(next)) {
      setNeedsProfileSetup(false);
      setScreen("home");
    }
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;
    if (busy) return;

    setBusy(true);
    const path = `${user.id}/profile/avatar.jpg`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      setBusy(false);
      console.error(upErr);
      return notify("Avatar upload failed");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    setBusy(false);

    if (error) {
      console.error(error);
      return notify("Failed to save avatar");
    }

    await loadProfile(user.id);
    notify("Avatar updated");
  }

  async function uploadLogo(file) {
    if (!user?.id || !file) return;
    if (busy) return;

    setBusy(true);
    const path = `${user.id}/branding/logo.png`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      setBusy(false);
      console.error(upErr);
      return notify("Logo upload failed");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    setBusy(false);

    if (error) {
      console.error(error);
      return notify("Failed to save logo");
    }

    await loadProfile(user.id);
    notify("Logo updated");
  }

  // init when user id becomes available
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects(); // ✅ no seeding — new accounts start empty
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

    // ✅ NO DEFAULTS: empty list is allowed
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
    if (!confirm("Delete ALL subjects and ALL files? This cannot be undone.")) return;

    setBusy(true);

    // read all file object paths
    const { data: fileRows, error: fErr } = await supabase.from("files").select("object_path").eq("user_id", user.id);
    if (fErr) {
      setBusy(false);
      console.error(fErr);
      return notify("Failed to read files for deletion");
    }

    const paths = (fileRows ?? []).map((r) => r.object_path).filter(Boolean);

    // remove storage objects in chunks
    const chunk = (arr, n) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

    for (const group of chunk(paths, 100)) {
      if (group.length) {
        const { error: rmErr } = await supabase.storage.from("portfolio").remove(group);
        if (rmErr) console.error("storage remove chunk error:", rmErr);
      }
    }

    const { error: delFilesErr } = await supabase.from("files").delete().eq("user_id", user.id);
    if (delFilesErr) console.error(delFilesErr);

    const { error: delSubsErr } = await supabase.from("subjects").delete().eq("user_id", user.id);
    if (delSubsErr) console.error(delSubsErr);

    setBusy(false);

    setSelectedSubject(null);
    setCategory(null);
    setFiles([]);
    await loadSubjects();
    notify("All subjects deleted");
  }

  // ===== PART 2 will continue with:
  // files logic, preview/rename/delete modals, smooth auth UI (eye toggles + confirm password),
  // smooth guided profile page, subjects UI with Delete All button, and bottom nav.
// src/PortfolioApp.jsx  (NEW — PART 2 / 2)

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

function openFolders(subjectRow) {
  setSelectedSubject(subjectRow);
  setScreen("folders");
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
  if (!file || !user?.id || !selectedSubject || !category) return;

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const objectPath = `${user.id}/subjects/${selectedSubject.id}/${category}/${uid()}-${safeName}`;

  const { error: upErr } = await supabase.storage.from("portfolio").upload(objectPath, file, {
    contentType: file.type,
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
    title: file.name,
    object_path: objectPath,
    mime_type: file.type,
    size: file.size,
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
  setPreview({ url: data.signedUrl, title: fileRow.title, mime: fileRow.mime_type || "" });
}

async function renameFile() {
  if (!optionsFor || !user?.id) return;
  const nm = renameTitle.trim();
  if (!nm) return notify("Enter a new name");

  const { error } = await supabase
    .from("files")
    .update({ title: nm })
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
  if (!optionsFor || !user?.id) return;
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

// ========= NAV =========
function back() {
  if (screen === "profile") setScreen("home");
  else if (screen === "subjects") setScreen("home");
  else if (screen === "folders") setScreen("subjects");
  else if (screen === "files") setScreen("folders");
  else setScreen("home");
}

function go(tab) {
  // force profile completion for new users
  if (needsProfileSetup && tab !== "profile") {
    notify("Complete your profile first.");
    return setScreen("profile");
  }
  setScreen(tab);
}

// ========= SET PASSWORD SCREEN =========
if (screen === "setpw") {
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">Reset Password</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="white-surface">
        <div className="auth-card">
          <div className="hero" style={{ marginBottom: 6 }}>
            Set a new password
          </div>
          <div className="subtle" style={{ marginBottom: 12 }}>
            Choose a strong password (6+ characters).
          </div>

          <div className="field">
            <label>NEW PASSWORD</label>
            <div className="pw-wrap">
              <input
                type={showNewPass ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button className="eye" type="button" onClick={() => setShowNewPass((v) => !v)} title="Show/Hide">
                {showNewPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button className="small-btn primary" disabled={busy} onClick={updatePassword}>
              {busy ? "Saving..." : "Update Password"}
            </button>
            <button
              className="small-btn"
              disabled={busy}
              onClick={async () => {
                await supabase.auth.signOut();
                setScreen("auth");
                setAuthMode("login");
              }}
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
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
          {/* Signup/Login/Forgot switch */}
          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "tab active" : "tab"}
              onClick={() => setAuthMode("login")}
              disabled={busy}
            >
              Login
            </button>
            <button
              className={authMode === "signup" ? "tab active" : "tab"}
              onClick={() => setAuthMode("signup")}
              disabled={busy}
            >
              Create
            </button>
            <button
              className={authMode === "forgot" ? "tab active" : "tab"}
              onClick={() => setAuthMode("forgot")}
              disabled={busy}
            >
              Forgot
            </button>
          </div>

          {/* Logo frame (optional) */}
          <div
            className="logo-frame"
            title={user?.id ? "Tap to change logo" : "Logo (set after login)"}
            onClick={() => {
              if (!user?.id) return notify("Login first to set logo");
              document.getElementById("logoInput").click();
            }}
          >
            {logoSrc ? (
              <img src={logoSrc} alt="logo" />
            ) : (
              <div className="logo-ph">LOGO</div>
            )}
          </div>

          <input
            id="logoInput"
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadLogo(f);
            }}
          />

          <div className="auth-banner">
            Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
          </div>

          {authMode === "forgot" ? (
            <>
              <div className="field" style={{ marginTop: 12 }}>
                <label>EMAIL</label>
                <input
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>

              <div className="modal-actions">
                <button className="small-btn primary" disabled={busy} onClick={sendResetLink}>
                  {busy ? "Sending..." : "Send Reset Link"}
                </button>
                <button className="small-btn" disabled={busy} onClick={() => setAuthMode("login")}>
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
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
                  <button className="eye" type="button" onClick={() => setShowPass((v) => !v)} title="Show/Hide">
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
                    <button className="eye" type="button" onClick={() => setShowPass2((v) => !v)} title="Show/Hide">
                      {showPass2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                  {pass2 && pass !== pass2 ? (
                    <div className="subtle" style={{ color: "#b91c1c", fontWeight: 800 }}>
                      Passwords do not match
                    </div>
                  ) : null}
                </div>
              )}

              <div className="modal-actions">
                {authMode === "login" ? (
                  <>
                    <button className="small-btn primary" disabled={busy} onClick={signIn}>
                      {busy ? "Logging in..." : "Login"}
                    </button>
                    <button className="small-btn" disabled={busy} onClick={() => setAuthMode("signup")}>
                      Create Account
                    </button>
                  </>
                ) : (
                  <>
                    <button className="small-btn primary" disabled={busy} onClick={signUp}>
                      {busy ? "Creating..." : "Create"}
                    </button>
                    <button className="small-btn" disabled={busy} onClick={() => setAuthMode("login")}>
                      Back
                    </button>
                  </>
                )}
              </div>

              {authMode === "login" ? (
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => {
                    setResetEmail(email.trim());
                    setAuthMode("forgot");
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ========= MAIN SHELL =========
return (
  <div className="app-shell">
    <div className="topbar">
      <div className="topbar-left">
        {screen !== "home" ? (
          <button className="back-btn" onClick={back} title="Back" disabled={busy}>
            ←
          </button>
        ) : null}
        <div className="brand">{titleLine}</div>
      </div>

      <button className="icon-btn" onClick={() => go("profile")} title="Profile" disabled={busy}>
        👤
      </button>
    </div>

    {/* HOME */}
    {screen === "home" && (
      <div className="white-surface">
        <div className="hero">Hi, {profile?.name || "STUDENT"}</div>
        <div className="subtle">Your digital portfolio — organized and synced.</div>

        <div className="big-tile" onClick={() => go("subjects")} role="button">
          <div className="big-icon">📘</div>
          <div className="big-label">SUBJECTS</div>
        </div>

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="small-btn" onClick={() => go("profile")} disabled={busy}>
            👤 My Profile
          </button>
          <button className="small-btn" onClick={signOut} disabled={busy}>
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
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {needsProfileSetup ? "Finish Setup" : "My Profile"}
            </div>
            <div className="subtle" style={{ margin: 0 }}>
              {needsProfileSetup ? "Complete your info to continue." : "Tap avatar to change photo"}
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
          <button className="small-btn primary" onClick={() => saveProfile(profile)} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
          {!needsProfileSetup ? (
            <button className="small-btn" onClick={signOut} disabled={busy}>
              Logout
            </button>
          ) : null}
        </div>
      </div>
    )}

    {/* SUBJECTS */}
    {screen === "subjects" && (
      <div className="white-surface">
        <div className="subtle">Create subjects, or delete everything for a fresh start.</div>

        <div className="modal-actions" style={{ marginTop: 10 }}>
          <button className="small-btn primary" onClick={() => setShowAddSubject(true)} disabled={busy}>
            + Add Subject
          </button>
          <button className="small-btn danger" onClick={deleteAllSubjects} disabled={busy}>
            {busy ? "Working..." : "Delete All"}
          </button>
        </div>

        {loadingSubjects ? (
          <div className="subtle" style={{ marginTop: 12 }}>
            Loading…
          </div>
        ) : subjects.length === 0 ? (
          <div className="subtle" style={{ textAlign: "center", padding: "36px 10px" }}>
            <div style={{ fontSize: 44 }}>📘</div>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>No subjects yet</div>
            <div>Click “+ Add Subject” to create your first subject.</div>
          </div>
        ) : (
          <div className="grid" style={{ marginTop: 12 }}>
            {subjects.map((s) => (
              <div key={s.id} className="tile">
                <div onClick={() => openFolders(s)} role="button" style={{ cursor: "pointer" }}>
                  <div className="ticon">{s.icon}</div>
                  <div className="ttext">{s.title}</div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className="small-btn danger" onClick={() => deleteSubject(s.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* ADD SUBJECT MODAL */}
    {showAddSubject && (
      <div className="modal-overlay" onClick={() => !busy && setShowAddSubject(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>New Subject</div>

          <div className="field">
            <label>SUBJECT NAME</label>
            <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} placeholder="e.g. Math" />
          </div>

          <div className="subtle" style={{ marginTop: 6, marginBottom: 8 }}>
            Pick an icon:
          </div>
          <div className="icon-grid">
            {ICONS.map((ic) => (
              <button
                key={ic}
                className={newSubIcon === ic ? "icon-pick active" : "icon-pick"}
                onClick={() => setNewSubIcon(ic)}
                type="button"
              >
                {ic}
              </button>
            ))}
          </div>

          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="small-btn primary" onClick={addSubject} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
            <button className="small-btn" onClick={() => setShowAddSubject(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
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
                  className="icon-btn"
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

        <button className="fab" onClick={triggerUpload} disabled={busy}>
          +
        </button>
      </div>
    )}

    {/* UPLOAD CHOOSER (MOBILE SAFE) */}
    {showUploadChooser && (
      <div className="modal-overlay" onClick={() => setShowUploadChooser(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Upload</div>

          <div className="modal-actions">
            <button className="small-btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              Choose File
            </button>
            <button className="small-btn" onClick={() => cameraRef.current?.click()} disabled={busy}>
              Use Camera
            </button>
          </div>

          <button className="small-btn" style={{ marginTop: 10 }} onClick={() => setShowUploadChooser(false)}>
            Cancel
          </button>

          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleUploadAny} />
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

    {/* PREVIEW */}
    {preview && (
      <div className="modal-overlay" onClick={() => setPreview(null)}>
        <div className="preview-card" onClick={(e) => e.stopPropagation()}>
          <div className="preview-top">
            <div className="preview-title">{preview.title}</div>
            <button className="icon-btn" onClick={() => setPreview(null)} type="button">
              ✕
            </button>
          </div>

          <div className="preview-body">
            {isImage(preview.mime) ? (
              <img src={preview.url} alt="preview" style={{ width: "100%", borderRadius: 14 }} />
            ) : (
              <iframe title="preview" src={preview.url} style={{ width: "100%", height: 520, border: "none" }} />
            )}
          </div>
        </div>
      </div>
    )}

    {/* FILE OPTIONS */}
    {optionsFor && (
      <div className="modal-overlay" onClick={() => setOptionsFor(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>File Options</div>

          <div className="field">
            <label>RENAME</label>
            <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
          </div>

          <div className="modal-actions" style={{ marginTop: 10 }}>
            <button className="small-btn primary" onClick={renameFile} disabled={busy}>
              Save Name
            </button>
            <button className="small-btn danger" onClick={deleteFile} disabled={busy}>
              Delete
            </button>
          </div>

          <button className="small-btn" style={{ marginTop: 10 }} onClick={() => setOptionsFor(null)} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    )}

    {/* BOTTOM NAV */}
    <div className="bottom-nav">
      <button className={screen === "home" ? "bn active" : "bn"} onClick={() => go("home")} type="button">
        🏠
        <span>Home</span>
      </button>
      <button className={screen === "subjects" ? "bn active" : "bn"} onClick={() => go("subjects")} type="button">
        📘
        <span>Subjects</span>
      </button>
      <button className={screen === "profile" ? "bn active" : "bn"} onClick={() => go("profile")} type="button">
        👤
        <span>Profile</span>
      </button>
    </div>

    {toast && <div className="toast">{toast}</div>}
  </div>
);
}
