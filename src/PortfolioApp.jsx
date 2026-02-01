// src/PortfolioApp.jsx  (PART 1 / 2)
// Fixes in this part:
// 1) Global logo: upload/save in PROFILE, shown on LOGIN (global path in Storage)
// 2) 3-dots button now uses class "kebab" (black/visible on white cards)
// Part 2 will include the image preview proportional fix + file options modal behavior.

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

/**
 * GLOBAL LOGO PATH (Storage)
 * - Put your app logo here so ALL users see the same logo on Login page.
 * - Recommended: make the "portfolio" bucket PUBLIC (or add public read policy for this object).
 */
const GLOBAL_LOGO_OBJECT_PATH = "branding/dagitab_logo.png";

export default function PortfolioApp({ user }) {
  // routing
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | setpw | home | profile | subjects | folders | files
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // auth ui
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // reset pw ui
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  // profile
  const [profile, setProfile] = useState({
    id: null,
    name: "STUDENT 1",
    section: "12-FARADAY",
    school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
    avatar_path: null,
    updated_at: null,
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

  // files (Part 2 continues)
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // upload chooser (mobile)
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // preview/options (Part 2 continues)
  const [preview, setPreview] = useState(null); // {url,title,mime}
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optionsFor, setOptionsFor] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [signedCache, setSignedCache] = useState({}); // object_path -> signedUrl

  // GLOBAL LOGO (shown on auth)
  const [globalLogoUrl, setGlobalLogoUrl] = useState(null);

  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1800);
  }

  // keep screen in sync with user
  useEffect(() => {
    setScreen(user ? (prev) => (prev === "auth" ? "home" : prev) : "auth");
  }, [user]);

  // title
  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    if (screen === "setpw") return "RESET";
    return "DAGITAB";
  }, [screen]);

  // ========= GLOBAL LOGO =========
  async function loadGlobalLogo() {
    // If bucket is PUBLIC, getPublicUrl works.
    // If bucket is PRIVATE, you can switch this to createSignedUrl (still works if policy allows read).
    try {
      const { data } = supabase.storage.from("portfolio").getPublicUrl(GLOBAL_LOGO_OBJECT_PATH);
      const url = data?.publicUrl || null;
      setGlobalLogoUrl(url);
    } catch (e) {
      console.error(e);
      setGlobalLogoUrl(null);
    }
  }

  async function uploadGlobalLogo(file) {
    if (!file) return;
    setBusy(true);

    const { error: upErr } = await supabase.storage.from("portfolio").upload(
      GLOBAL_LOGO_OBJECT_PATH,
      file,
      {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      }
    );

    setBusy(false);

    if (upErr) {
      console.error(upErr);
      return notify("Logo upload failed");
    }

    // Refresh the URL (cache-bust a little)
    await loadGlobalLogo();
    notify("Logo updated (global)");
  }

  // Load global logo on first mount
  useEffect(() => {
    loadGlobalLogo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========= AUTH / PASSWORD RESET =========
  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
  }

  async function signUp() {
    if (pass !== pass2) return notify("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
    notify("Account created. Continue to profile setup.");
    // After signup, onAuthStateChange will set user, then we will route to profile if needed.
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  }

  // IMPORTANT: set this to your Netlify URL + /# (same tab)
  // Example: https://dagitab.netlify.app/#reset
  const RESET_REDIRECT_TO = `${window.location.origin}/#reset`;

  async function sendResetLink() {
    const em = (resetEmail || "").trim();
    if (!em) return notify("Enter your email");
    setBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: RESET_REDIRECT_TO,
    });

    setBusy(false);

    if (error) return notify(error.message);
    notify("Reset link sent. Open the email link in the same browser.");
  }

  async function updatePassword() {
    if (!newPassword || newPassword.length < 6) return notify("Password too short");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) return notify(error.message);

    notify("Password updated. You can continue.");
    setScreen("home");
  }

  // If user returns from email reset link, move to setpw
  useEffect(() => {
    if (window.location.hash === "#reset") {
      setScreen("setpw");
    }
  }, []);

  // ========= PROFILE HELPERS =========
  const needsProfileSetup = useMemo(() => {
    // treat blank or default values as "needs setup"
    const n = (profile?.name || "").trim();
    const s = (profile?.section || "").trim();
    const sch = (profile?.school || "").trim();
    if (!user?.id) return false;
    if (!profile?.id) return true;
    if (!n || !s || !sch) return true;
    // If still defaults, guide user
    if (n === "STUDENT 1" && s === "12-FARADAY") return true;
    return false;
  }, [profile, user?.id]);

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

    // only insert if missing (DO NOT overwrite)
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
    setBusy(true);

    // optimistic UI
    setProfile(next);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: (next.name ?? "").trim(),
        section: (next.section ?? "").trim(),
        school: (next.school ?? "").trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id,name,section,school,avatar_path,updated_at")
      .maybeSingle();

    setBusy(false);

    if (error) {
      console.error("saveProfile error:", error);
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }

    notify("Profile saved");

    // ✅ Smooth: after first setup, go directly to home
    if (screen === "profile") setScreen("home");
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;
    setBusy(true);

    const path = `${user.id}/profile/avatar.jpg`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      setBusy(false);
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

  // init profile + subjects only when user is ready
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects();
      // Guide new users to profile setup first
      setScreen((prev) => (prev === "auth" ? "profile" : prev));
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

    // ✅ New account = empty subjects (no auto-seed)
    setSubjects(data ?? []);
  }

  async function addSubject() {
    if (!user?.id) return;
    const title = newSubTitle.trim();
    if (!title) return notify("Enter subject name");

    setBusy(true);

    const nextSort = subjects.length ? Math.max(...subjects.map((s) => s.sort || 0)) + 1 : 1;

    const { error } = await supabase.from("subjects").insert({
      user_id: user.id,
      title,
      icon: newSubIcon,
      sort: nextSort,
    });

    setBusy(false);

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

    setBusy(true);

    await supabase.from("files").delete().eq("user_id", user.id).eq("subject_id", subjectId);

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("user_id", user.id)
      .eq("id", subjectId);

    setBusy(false);

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

    setBusy(true);

    // delete files rows first
    await supabase.from("files").delete().eq("user_id", user.id);
    // delete subjects rows
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    setBusy(false);

    if (error) {
      console.error(error);
      return notify("Failed to delete all subjects");
    }

    setSelectedSubject(null);
    setCategory(null);
    setScreen("subjects");
    await loadSubjects();
    notify("All subjects deleted");
  }

  // ========= NAV GUARD =========
  function go(tab) {
    if (needsProfileSetup && tab !== "profile") {
      notify("Complete your profile first.");
      setScreen("profile");
      return;
    }
    setScreen(tab);
  }

  /* ========== RENDER: SET PASSWORD ========== */
  if (screen === "setpw") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <div className="brand">Reset Password</div>
          </div>
          <div style={{ width: 40 }} />
        </div>

        <div className="white-surface pad-bottom">
          <div className="auth-card">
            <div className="hero" style={{ marginBottom: 6 }}>
              Set a new password
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
                <button className="eye" type="button" onClick={() => setShowNewPass((v) => !v)}>
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

  /* ========== RENDER: AUTH (logo shown here; upload happens in PROFILE) ========== */
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface pad-bottom">
          <div className="auth-card">
            <div className="auth-tabs">
              <button className={authMode === "login" ? "tab active" : "tab"} onClick={() => setAuthMode("login")} disabled={busy}>
                Login
              </button>
              <button className={authMode === "signup" ? "tab active" : "tab"} onClick={() => setAuthMode("signup")} disabled={busy}>
                Create
              </button>
            </div>

            {/* GLOBAL LOGO (read-only here) */}
            <div className="logo-frame" title="App Logo">
              {globalLogoUrl ? <img src={globalLogoUrl} alt="DAGITAB logo" /> : <div className="logo-ph">LOGO</div>}
            </div>

            <div className="auth-banner">
              Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
            </div>

            {authMode === "forgot" ? (
              <>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="Enter your email" />
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
                    <input type={showPass ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
                    <button className="eye" type="button" onClick={() => setShowPass((v) => !v)}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {authMode === "signup" && (
                  <div className="field">
                    <label>CONFIRM PASSWORD</label>
                    <div className="pw-wrap">
                      <input type={showPass2 ? "text" : "password"} value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" />
                      <button className="eye" type="button" onClick={() => setShowPass2((v) => !v)}>
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

  /* ========= MAIN UI continues in PART 2 ========= */

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          {screen !== "home" ? (
            <button className="back-btn" onClick={() => {
              if (screen === "profile") setScreen("home");
              else if (screen === "subjects") setScreen("home");
              else if (screen === "folders") setScreen("subjects");
              else if (screen === "files") setScreen("folders");
              else setScreen("home");
            }} title="Back" disabled={busy}>
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
        <div className="white-surface pad-bottom">
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

      {/* PROFILE (adds LOGO upload here for global logo) */}
      {screen === "profile" && (
        <div className="white-surface pad-bottom">
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

          {/* GLOBAL LOGO UPLOADER */}
          <div style={{ marginTop: 10 }}>
            <div className="subtle" style={{ marginBottom: 8 }}>
              App Logo (global): visible on Login screen for everyone
            </div>

            <div
              className="logo-frame"
              title="Tap to upload global logo"
              onClick={() => document.getElementById("globalLogoInput").click()}
              style={{ margin: "0 auto 10px" }}
            >
              {globalLogoUrl ? <img src={globalLogoUrl} alt="global logo" /> : <div className="logo-ph">LOGO</div>}
            </div>

            <input
              id="globalLogoInput"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadGlobalLogo(f);
              }}
            />
          </div>

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
            <button className="small-btn primary" onClick={() => saveProfile(profile)} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
            <button className="small-btn" onClick={signOut} disabled={busy}>
              Logout
            </button>
          </div>
        </div>
      )}

      {/* SUBJECTS */}
      {screen === "subjects" && (
        <div className="white-surface pad-bottom">
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
            <div className="subtle" style={{ marginTop: 12 }}>Loading…</div>
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
                  disabled={busy}
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

      {/* FOLDERS + FILES + PREVIEW + OPTIONS + NAV continue in PART 2 */}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
// src/PortfolioApp.jsx  (PART 2 / 2)
// Includes:
// ✅ Mobile proportional preview (no cut) using object-fit:contain + safe viewport sizing
// ✅ Smooth open/close preview (tap outside closes)
// ✅ 3-dots (kebab) always visible + opens rename/delete modal
// ✅ File open is faster (signed URL cache, no repeated network calls)
// ✅ Upload chooser works on mobile (file vs camera)
// ✅ Bottom nav included (home/subjects/profile) without hiding buttons

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
const GLOBAL_LOGO_OBJECT_PATH = "branding/dagitab_logo.png";

export default function PortfolioApp({ user }) {
  // routing
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | setpw | home | profile | subjects | folders | files
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // auth ui
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // reset pw ui
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  // profile
  const [profile, setProfile] = useState({
    id: null,
    name: "STUDENT 1",
    section: "12-FARADAY",
    school: "INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
    avatar_path: null,
    updated_at: null,
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

  // preview/options
  const [preview, setPreview] = useState(null); // {url,title,mime}
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optionsFor, setOptionsFor] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [signedCache, setSignedCache] = useState({}); // object_path -> signedUrl

  // GLOBAL LOGO (shown on auth)
  const [globalLogoUrl, setGlobalLogoUrl] = useState(null);

  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1800);
  }

  // keep screen in sync with user
  useEffect(() => {
    setScreen(user ? (prev) => (prev === "auth" ? "home" : prev) : "auth");
  }, [user]);

  // title
  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    if (screen === "setpw") return "RESET";
    return "DAGITAB";
  }, [screen]);

  // ========= GLOBAL LOGO =========
  async function loadGlobalLogo() {
    try {
      const { data } = supabase.storage.from("portfolio").getPublicUrl(GLOBAL_LOGO_OBJECT_PATH);
      const url = data?.publicUrl || null;
      // cache-bust so mobile sees updates fast
      setGlobalLogoUrl(url ? `${url}?v=${Date.now()}` : null);
    } catch (e) {
      console.error(e);
      setGlobalLogoUrl(null);
    }
  }

  async function uploadGlobalLogo(file) {
    if (!file) return;
    setBusy(true);

    const { error: upErr } = await supabase.storage.from("portfolio").upload(
      GLOBAL_LOGO_OBJECT_PATH,
      file,
      { upsert: true, contentType: file.type, cacheControl: "3600" }
    );

    setBusy(false);

    if (upErr) {
      console.error(upErr);
      return notify("Logo upload failed");
    }

    await loadGlobalLogo();
    notify("Logo updated (global)");
  }

  useEffect(() => {
    loadGlobalLogo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========= AUTH / PASSWORD RESET =========
  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
  }

  async function signUp() {
    if (pass !== pass2) return notify("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
    notify("Account created. Continue to profile setup.");
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  }

  const RESET_REDIRECT_TO = `${window.location.origin}/#reset`;

  async function sendResetLink() {
    const em = (resetEmail || "").trim();
    if (!em) return notify("Enter your email");
    setBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: RESET_REDIRECT_TO,
    });

    setBusy(false);

    if (error) return notify(error.message);
    notify("Reset link sent. Open the email link in the same browser.");
  }

  async function updatePassword() {
    if (!newPassword || newPassword.length < 6) return notify("Password too short");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) return notify(error.message);
    notify("Password updated.");
    setScreen("home");
  }

  useEffect(() => {
    if (window.location.hash === "#reset") setScreen("setpw");
  }, []);

  // ========= PROFILE HELPERS =========
  const needsProfileSetup = useMemo(() => {
    const n = (profile?.name || "").trim();
    const s = (profile?.section || "").trim();
    const sch = (profile?.school || "").trim();
    if (!user?.id) return false;
    if (!profile?.id) return true;
    if (!n || !s || !sch) return true;
    if (n === "STUDENT 1" && s === "12-FARADAY") return true;
    return false;
  }, [profile, user?.id]);

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
    setBusy(true);
    setProfile(next);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: (next.name ?? "").trim(),
        section: (next.section ?? "").trim(),
        school: (next.school ?? "").trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id,name,section,school,avatar_path,updated_at")
      .maybeSingle();

    setBusy(false);

    if (error) {
      console.error("saveProfile error:", error);
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile(data);
      await refreshAvatarSignedUrl(data.avatar_path);
    }

    notify("Profile saved");
    if (screen === "profile") setScreen("home");
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;
    setBusy(true);

    const path = `${user.id}/profile/avatar.jpg`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      setBusy(false);
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

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects();
      setScreen((prev) => (prev === "auth" ? "profile" : prev));
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

    setBusy(true);

    const nextSort = subjects.length ? Math.max(...subjects.map((s) => s.sort || 0)) + 1 : 1;

    const { error } = await supabase.from("subjects").insert({
      user_id: user.id,
      title,
      icon: newSubIcon,
      sort: nextSort,
    });

    setBusy(false);

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

    setBusy(true);

    await supabase.from("files").delete().eq("user_id", user.id).eq("subject_id", subjectId);

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("user_id", user.id)
      .eq("id", subjectId);

    setBusy(false);

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

    setBusy(true);
    await supabase.from("files").delete().eq("user_id", user.id);
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);
    setBusy(false);

    if (error) {
      console.error(error);
      return notify("Failed to delete all subjects");
    }

    setSelectedSubject(null);
    setCategory(null);
    setScreen("subjects");
    await loadSubjects();
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

    setBusy(true);

    const { error: upErr } = await supabase.storage.from("portfolio").upload(objectPath, f, {
      contentType: f.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      setBusy(false);
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

    setBusy(false);

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

  // Signed URL cache (fast open / less lag)
  async function getSignedUrl(objectPath, ttlSeconds = 60 * 10) {
    if (!objectPath) return null;
    if (signedCache[objectPath]) return signedCache[objectPath];

    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(objectPath, ttlSeconds);
    if (error) {
      console.error(error);
      return null;
    }

    const url = data?.signedUrl ?? null;
    if (url) {
      setSignedCache((prev) => ({ ...prev, [objectPath]: url }));
    }
    return url;
  }

  async function openPreview(fileRow) {
    setPreviewLoading(true);

    const url = await getSignedUrl(fileRow.object_path);
    setPreviewLoading(false);

    if (!url) return notify("Preview failed");

    setPreview({
      url,
      title: fileRow.title,
      mime: fileRow.mime_type || "",
    });
  }

  function closePreview() {
    setPreview(null);
  }

  function openOptions(fileRow) {
    setOptionsFor(fileRow);
    setRenameTitle(fileRow.title || "");
  }

  function closeOptions() {
    setOptionsFor(null);
    setRenameTitle("");
  }

  async function renameFile() {
    if (!user?.id || !optionsFor) return;
    const newName = renameTitle.trim();
    if (!newName) return notify("Enter new name");

    setBusy(true);

    const { error } = await supabase
      .from("files")
      .update({ title: newName })
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    setBusy(false);

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

    setBusy(true);

    const { error: stErr } = await supabase.storage.from("portfolio").remove([optionsFor.object_path]);
    if (stErr) {
      console.error(stErr);
      setBusy(false);
      return notify("Storage delete failed");
    }

    const { error } = await supabase.from("files").delete().eq("user_id", user.id).eq("id", optionsFor.id);

    setBusy(false);

    if (error) {
      console.error(error);
      return notify("DB delete failed");
    }

    notify("Deleted");
    closeOptions();
    await loadFiles(selectedSubject.id, category);
  }

  // ========= NAV GUARD =========
  function go(tab) {
    if (needsProfileSetup && tab !== "profile") {
      notify("Complete your profile first.");
      setScreen("profile");
      return;
    }
    setScreen(tab);
  }

  // Back navigation
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  /* ========== RENDER: SET PASSWORD ========== */
  if (screen === "setpw") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <div className="brand">Reset Password</div>
          </div>
          <div style={{ width: 40 }} />
        </div>

        <div className="white-surface pad-bottom">
          <div className="auth-card">
            <div className="hero" style={{ marginBottom: 6 }}>
              Set a new password
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
                <button className="eye" type="button" onClick={() => setShowNewPass((v) => !v)}>
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

  /* ========== RENDER: AUTH ========== */
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface pad-bottom">
          <div className="auth-card">
            <div className="auth-tabs">
              <button className={authMode === "login" ? "tab active" : "tab"} onClick={() => setAuthMode("login")} disabled={busy}>
                Login
              </button>
              <button className={authMode === "signup" ? "tab active" : "tab"} onClick={() => setAuthMode("signup")} disabled={busy}>
                Create
              </button>
            </div>

            <div className="logo-frame" title="App Logo">
              {globalLogoUrl ? <img src={globalLogoUrl} alt="DAGITAB logo" /> : <div className="logo-ph">LOGO</div>}
            </div>

            <div className="auth-banner">
              Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
            </div>

            {authMode === "forgot" ? (
              <>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="Enter your email" />
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
                    <input type={showPass ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
                    <button className="eye" type="button" onClick={() => setShowPass((v) => !v)}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {authMode === "signup" && (
                  <div className="field">
                    <label>CONFIRM PASSWORD</label>
                    <div className="pw-wrap">
                      <input type={showPass2 ? "text" : "password"} value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" />
                      <button className="eye" type="button" onClick={() => setShowPass2((v) => !v)}>
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

  // ========= MAIN UI =========
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
        <div className="white-surface pad-bottom">
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

      {/* PROFILE (includes global logo uploader) */}
      {screen === "profile" && (
        <div className="white-surface pad-bottom">
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

          <div style={{ marginTop: 10 }}>
            <div className="subtle" style={{ marginBottom: 8 }}>
              App Logo (global): visible on Login screen for everyone
            </div>

            <div
              className="logo-frame"
              title="Tap to upload global logo"
              onClick={() => document.getElementById("globalLogoInput").click()}
              style={{ margin: "0 auto 10px" }}
            >
              {globalLogoUrl ? <img src={globalLogoUrl} alt="global logo" /> : <div className="logo-ph">LOGO</div>}
            </div>

            <input
              id="globalLogoInput"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadGlobalLogo(f);
              }}
            />
          </div>

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
            <button className="small-btn primary" onClick={() => saveProfile(profile)} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
            <button className="small-btn" onClick={signOut} disabled={busy}>
              Logout
            </button>
          </div>
        </div>
      )}

      {/* SUBJECTS */}
      {screen === "subjects" && (
        <div className="white-surface pad-bottom">
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
            <div className="subtle" style={{ marginTop: 12 }}>Loading…</div>
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
                  disabled={busy}
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
        <div className="white-surface pad-bottom">
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
        <div className="white-surface pad-bottom">
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
                  {/* thumb */}
                  <div
                    className="file-thumb"
                    onClick={() => openPreview(f)}
                    style={{ cursor: "pointer" }}
                    title="Open"
                  >
                    {isImage(f.mime_type || "") ? "🖼️" : "📄"}
                  </div>

                  <div className="file-meta" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {f.mime_type || "file"} • {fmtBytes(f.size)} •{" "}
                      {f.created_at ? new Date(f.created_at).toLocaleString() : ""}
                    </div>
                  </div>

                  {/* 3-dots: use kebab class so it stays visible/black */}
                  <button
                    className="kebab"
                    onClick={() => openOptions(f)}
                    title="Options"
                    type="button"
                    disabled={busy}
                    style={{
                      color: "#0f172a", /* makes it black even if browser theme changes */
                      fontWeight: 900,
                    }}
                  >
                    ⋮
                  </button>
                </div>
              ))
            )}
          </div>

          {/* FAB upload */}
          <button className="fab" onClick={triggerUpload} disabled={busy} title="Upload">
            +
          </button>

          {/* hidden inputs */}
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
      )}

      {/* UPLOAD CHOOSER MODAL */}
      {showUploadChooser && (
        <div className="modal-overlay" onClick={() => !busy && setShowUploadChooser(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Upload</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Choose how you want to upload.
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                📎 Choose File
              </button>
              <button className="small-btn" disabled={busy} onClick={() => cameraRef.current?.click()}>
                📷 Use Camera
              </button>
              <button className="small-btn" disabled={busy} onClick={() => setShowUploadChooser(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW (smooth, proportional on mobile) */}
      {preview && (
        <div className="modal-overlay preview-overlay" onClick={closePreview}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-top">
              <div className="preview-title">{preview.title}</div>
              <button className="small-btn" type="button" onClick={closePreview}>
                Close
              </button>
            </div>

            <div className="preview-body">
              {previewLoading ? (
                <div className="subtle">Loading preview…</div>
              ) : isImage(preview.mime) ? (
                <img
                  src={preview.url}
                  alt={preview.title}
                  className="preview-img"
                  style={{
                    /* ✅ critical: prevent crop on mobile */
                    maxHeight: "70vh",
                    objectFit: "contain",
                    background: "#fff",
                  }}
                />
              ) : (
                <iframe
                  title="preview"
                  src={preview.url}
                  className="preview-frame"
                  style={{
                    height: "70vh",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* OPTIONS MODAL (rename/delete) */}
      {optionsFor && (
        <div className="modal-overlay" onClick={closeOptions}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Options</div>
            <div className="subtle" style={{ marginTop: 4 }}>
              {optionsFor.title}
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>RENAME</label>
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" disabled={busy} onClick={renameFile}>
                Save Name
              </button>
              <button className="small-btn danger" disabled={busy} onClick={deleteFile}>
                Delete
              </button>
              <button className="small-btn" disabled={busy} onClick={closeOptions}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className={screen === "home" ? "bn active" : "bn"} onClick={() => go("home")} disabled={busy}>
          🏠 <span>Home</span>
        </button>
        <button className={screen === "subjects" || screen === "folders" || screen === "files" ? "bn active" : "bn"} onClick={() => go("subjects")} disabled={busy}>
          📘 <span>Subjects</span>
        </button>
        <button className={screen === "profile" ? "bn active" : "bn"} onClick={() => go("profile")} disabled={busy}>
          👤 <span>Profile</span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
