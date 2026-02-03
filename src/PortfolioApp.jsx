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
 * ✅ Extract tokens from URL hash (implicit flow)
 * Example:
 *   https://yoursite/reset#access_token=...&refresh_token=...&type=recovery
 */
function parseHashParams() {
  const raw = window.location.hash || "";
  if (!raw.startsWith("#")) return {};
  const hash = raw.slice(1);
  const params = new URLSearchParams(hash);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** ✅ clean URL so refresh doesn't repeat auth parsing */
function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, document.title, url.toString());
}

/** ✅ detect recovery as early as possible (prevents redirect-to-home bug) */
function detectRecoveryNow() {
  try {
    const url = new URL(window.location.href);
    const qType = url.searchParams.get("type");
    const hp = parseHashParams();
    const hType = hp.type;
    return qType === "recovery" || hType === "recovery";
  } catch {
    return false;
  }
}

export default function PortfolioApp({ user }) {
  // routing
  const [screen, setScreen] = useState(user ? "home" : "auth");
  // auth | home | profile | profileSetup | subjects | folders | files | resetPassword

  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // auth ui tabs (bring back)
  const [authTab, setAuthTab] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // forgot password
  const [forgotEmail, setForgotEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // reset password
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showNewPass2, setShowNewPass2] = useState(false);

  // ✅ set when we detect recovery in URL (forces reset screen)
  // IMPORTANT: initialize immediately if URL already indicates recovery
  const [recoveryMode, setRecoveryMode] = useState(() => detectRecoveryNow());

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

  // add subject modal (improved UI)
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubIcon, setNewSubIcon] = useState("📘");

  // nav
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [category, setCategory] = useState(null); // performance | written

  // files
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // upload chooser + inputs
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // modals
  const [preview, setPreview] = useState(null); // {url,title,mime,loading}
  const [optionsFor, setOptionsFor] = useState(null); // file row
  const [renameTitle, setRenameTitle] = useState("");

  function notify(msg) {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(""), 1800);
  }

  const titleLine = useMemo(() => {
    if (screen === "home") return "DAGITAB";
    if (screen === "profile") return "PROFILE";
    if (screen === "profileSetup") return "SETUP PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    if (screen === "resetPassword") return "RESET PASSWORD";
    return "DAGITAB";
  }, [screen]);

  // ========= ✅ AUTH LINK HANDLER (FIXED) =========
  useEffect(() => {
    let cancelled = false;

    async function handleAuthLink() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // detect recovery BEFORE exchanging session (prevents dashboard jump)
        const hp = parseHashParams();
        const qType = url.searchParams.get("type");
        const isRecovery = hp.type === "recovery" || qType === "recovery";

        if (isRecovery && !cancelled) {
          setRecoveryMode(true);
          setScreen("resetPassword");
        }

        // 1) PKCE flow: exchange code for session
        if (code) {
          setBusy(true);

          // ✅ IMPORTANT FIX: exchangeCodeForSession expects the code (not full URL)
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error("exchangeCodeForSession error:", error);
            if (!cancelled) notify("Reset link invalid/expired. Try again.");
          }

          clearAuthParamsFromUrl();
          setBusy(false);
        }

        // 2) Implicit hash flow: set session with tokens
        const access_token = hp.access_token;
        const refresh_token = hp.refresh_token;

        if (access_token && refresh_token) {
          setBusy(true);
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            console.error("setSession error:", error);
            if (!cancelled) notify("Reset link invalid/expired. Try again.");
          }

          clearAuthParamsFromUrl();
          setBusy(false);
        }
      } catch (e) {
        console.error("handleAuthLink fatal:", e);
      }
    }

    handleAuthLink();

    return () => {
      cancelled = true;
    };
  }, []);

  // ========= ✅ AUTH STATE LISTENER (FIXED) =========
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // If recovery event, force reset screen
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setScreen("resetPassword");
        return;
      }

      // ✅ KEY FIX: if this visit is recoveryMode, do NOT auto-jump to dashboard
      if (recoveryMode) {
        // keep user on reset screen even if session appears
        setScreen("resetPassword");
        return;
      }

      if (session?.user) {
        // keep current screen unless auth was shown
        setScreen((prev) => (prev === "auth" ? "home" : prev));
      } else {
        setScreen("auth");
      }
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, [recoveryMode]);

  // ========= AUTH =========
  async function signIn() {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error) return notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    const e = email.trim();
    if (!e) return notify("Enter email");
    if (!pass) return notify("Enter password");
    if (pass.length < 6) return notify("Password must be at least 6 characters");
    if (pass !== pass2) return notify("Passwords do not match");

    try {
      setBusy(true);

      const { data, error } = await supabase.auth.signUp({
        email: e,
        password: pass,
      });

      if (error) return notify(error.message);

      if (data?.user && data?.session) {
        notify("Account created!");
        setScreen("profileSetup");
      } else {
        notify("Account created. Check your email to verify, then login.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= FORGOT PASSWORD =========
  async function sendResetEmail() {
    const e = (forgotEmail || email).trim();
    if (!e) return notify("Enter your email");

    try {
      setBusy(true);

      // Opens a new tab from email is normal.
      // Make sure Netlify redirect exists for /reset
      const redirectTo = `${window.location.origin}/reset`;

      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo,
      });

      if (error) return notify(error.message);

      notify("Reset email sent. Open it to set a new password.");
      setShowForgot(false);
    } finally {
      setBusy(false);
    }
  }

  // ========= RESET PASSWORD =========
  async function updatePasswordNow() {
    if (!newPass) return notify("Enter new password");
    if (newPass.length < 6) return notify("Password must be at least 6 characters");
    if (newPass !== newPass2) return notify("Passwords do not match");

    try {
      setBusy(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        return notify("Auth session missing. Please open the reset link again.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) return notify(error.message);

      notify("Password updated!");
      setRecoveryMode(false);

      // ✅ after reset, go back to login (safer), or home if you want
      setScreen("auth");
      setAuthTab("login");
    } finally {
      setBusy(false);
    }
  }

  // ========= PROFILE =========
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
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;

    const cleaned = {
      ...next,
      name: (next.name || "").trim(),
      section: (next.section || "").trim(),
      school: (next.school || "").trim(),
    };

    setProfile(cleaned);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: cleaned.name,
        section: cleaned.section,
        school: cleaned.school,
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

  async function shouldForceProfileSetup(uid_) {
    const { data, error } = await supabase
      .from("profiles")
      .select("name,section,school")
      .eq("id", uid_)
      .maybeSingle();

    if (error) return false;
    const n = (data?.name || "").trim();
    const s = (data?.section || "").trim();
    const sch = (data?.school || "").trim();
    return !(n && s && sch);
  }

  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);

      const needSetup = await shouldForceProfileSetup(user.id);
      if (needSetup) {
        setScreen("profileSetup");
        return;
      }

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
    if (!confirm("Delete ALL subjects and their file records?")) return;

    await supabase.from("files").delete().eq("user_id", user.id);
    const { error } = await supabase.from("subjects").delete().eq("user_id", user.id);

    if (error) {
      console.error(error);
      return notify("Failed to delete all subjects");
    }

    setSelectedSubject(null);
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

    const { error: upErr } = await supabase.storage.from("portfolio").upload(objectPath, f, {
      contentType: f.type,
      cacheControl: "3600",
      upsert: false,
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
    setPreview({
      url: "",
      title: fileRow.title,
      mime: fileRow.mime_type || "",
      loading: true,
    });

    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(fileRow.object_path, 60 * 10);
    if (error) {
      console.error(error);
      setPreview(null);
      return notify("Preview failed");
    }

    setPreview({
      url: data.signedUrl,
      title: fileRow.title,
      mime: fileRow.mime_type || "",
      loading: false,
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

  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "profileSetup") setScreen("auth");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  // ======= PART 2 STARTS BELOW (UI RETURNS) =======
  // ========= AUTH PAGE (tabs + forgot below) =========
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
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
                Sign Up
              </button>
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
                <button
                  className="eye"
                  onClick={() => setShowPass((v) => !v)}
                  type="button"
                  aria-label="toggle password"
                >
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
                    onClick={() => setShowPass2((v) => !v)}
                    type="button"
                    aria-label="toggle confirm"
                  >
                    {showPass2 ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {authTab === "login" ? (
                <button className="small-btn primary" onClick={signIn} disabled={busy}>
                  {busy ? "Please wait..." : "Login"}
                </button>
              ) : (
                <button className="small-btn primary" onClick={signUp} disabled={busy}>
                  {busy ? "Please wait..." : "Create Account"}
                </button>
              )}

              <button
                className="small-btn"
                onClick={() => {
                  setShowForgot((v) => !v);
                  setForgotEmail(email);
                }}
                disabled={busy}
              >
                Forgot Password
              </button>
            </div>

            {showForgot && (
              <div style={{ marginTop: 12 }}>
                <div className="field">
                  <label>EMAIL FOR RESET</label>
                  <input
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter email"
                  />
                </div>
                <div className="modal-actions">
                  <button className="small-btn primary" onClick={sendResetEmail} disabled={busy}>
                    {busy ? "Sending..." : "Send Reset Email"}
                  </button>
                  <button className="small-btn" onClick={() => setShowForgot(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ========= RESET PASSWORD SCREEN =========
  if (screen === "resetPassword") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <button className="back-btn" onClick={() => setScreen("auth")} title="Back">
              ←
            </button>
            <div className="brand">{titleLine}</div>
          </div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Set a new password</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Enter your new password below.
            </div>

            <div className="field">
              <label>NEW PASSWORD</label>
              <div className="pw-wrap">
                <input
                  type={showNewPass ? "text" : "password"}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="••••••••"
                />
                <button className="eye" onClick={() => setShowNewPass((v) => !v)} type="button">
                  {showNewPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div className="field">
              <label>CONFIRM NEW PASSWORD</label>
              <div className="pw-wrap">
                <input
                  type={showNewPass2 ? "text" : "password"}
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                  placeholder="••••••••"
                />
                <button className="eye" onClick={() => setShowNewPass2((v) => !v)} type="button">
                  {showNewPass2 ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={updatePasswordNow} disabled={busy}>
                {busy ? "Updating..." : "Update Password"}
              </button>
              <button
                className="small-btn"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setRecoveryMode(false);
                  setScreen("auth");
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>

            <div className="subtle" style={{ marginTop: 10 }}>
              If it says “Auth session missing”, open the reset email link again (it may be expired).
            </div>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ========= PROFILE SETUP (first login required) =========
  if (screen === "profileSetup") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <div className="brand">{titleLine}</div>
          </div>
          <button
            className="icon-btn"
            onClick={async () => {
              await signOut();
            }}
            title="Logout"
          >
            ⎋
          </button>
        </div>

        <div className="white-surface">
          <div className="auth-card">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Complete your profile</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Please fill out your profile first. After saving, you can use your dashboard immediately.
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
                  Tap to upload
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
                disabled={busy}
                onClick={async () => {
                  const n = (profile.name || "").trim();
                  const s = (profile.section || "").trim();
                  const sch = (profile.school || "").trim();
                  if (!n || !s || !sch) return notify("Please complete all fields.");

                  await saveProfile(profile);
                  await loadSubjects();
                  setScreen("home");
                }}
              >
                {busy ? "Saving..." : "Save & Continue"}
              </button>
            </div>
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

          <div className="modal-actions" style={{ marginTop: 14 }}>
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
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button className="small-btn" onClick={() => setShowAddSubject(true)}>
              ＋ Add Subject
            </button>
            <button className="small-btn danger" onClick={deleteAllSubjects}>
              Delete All
            </button>
          </div>

          <div className="grid" style={{ marginTop: 14 }}>
            {(loadingSubjects ? [] : subjects).map((s) => (
              <div
                key={s.id}
                className="tile"
                role="button"
                onClick={() => {
                  setSelectedSubject(s);
                  setScreen("folders");
                }}
              >
                <div className="ticon">{s.icon || "📘"}</div>
                <div className="ttext">{s.title}</div>

                <div className="modal-actions" style={{ marginTop: 10, justifyContent: "center" }}>
                  <button
                    className="small-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubject(s.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!loadingSubjects && subjects.length === 0 && (
              <div className="subtle" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
                No subjects yet. Tap “Add Subject”.
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOLDERS */}
      {screen === "folders" && selectedSubject && (
        <div className="white-surface">
          <div className="row" onClick={() => openFiles("performance")} role="button">
            <div className="box">✅</div>
            <div style={{ flex: 1 }}>
              <div className="rtitle">Performance Tasks</div>
              <div className="subtle" style={{ margin: 0 }}>
                Upload your PT files here
              </div>
            </div>
          </div>

          <div className="row" onClick={() => openFiles("written")} role="button" style={{ marginTop: 12 }}>
            <div className="box">📝</div>
            <div style={{ flex: 1 }}>
              <div className="rtitle">Written Works</div>
              <div className="subtle" style={{ margin: 0 }}>
                Upload your WW files here
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILES */}
      {screen === "files" && selectedSubject && category && (
        <div className="white-surface">
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {selectedSubject.title} — {category === "performance" ? "Performance Tasks" : "Written Works"}
          </div>

          <div className="file-list">
            {(loadingFiles ? [] : files).map((f) => (
              <div key={f.id} className="file-item" onClick={() => openPreview(f)} role="button">
                <div className="file-thumb">{isImage(f.mime_type) ? "🖼️" : "📄"}</div>

                <div className="file-meta">
                  <div className="file-title">{f.title}</div>
                  <div className="file-sub">
                    {fmtBytes(f.size)} • {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>

                <button
                  className="kebab"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOptionsFor(f);
                    setRenameTitle(f.title || "");
                  }}
                  title="Options"
                >
                  ⋮
                </button>
              </div>
            ))}

            {!loadingFiles && files.length === 0 && (
              <div className="subtle" style={{ marginTop: 10 }}>
                No files yet. Tap the + button to upload.
              </div>
            )}
          </div>

          <button className="fab" onClick={triggerUpload} title="Upload">
            +
          </button>
        </div>
      )}

      {/* ✅ UPDATED NAV ONLY */}
      <div className="bottom-nav">
        <button className={"bn " + (screen === "profile" ? "active" : "")} onClick={() => setScreen("profile")}>
          👤 <span>My Profile</span>
        </button>

        <button className="bn" onClick={signOut}>
          ⎋ <span>Logout</span>
        </button>
      </div>

      {/* UPLOAD CHOOSER */}
      {showUploadChooser && (
        <div className="modal-overlay" onClick={() => setShowUploadChooser(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Upload</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Choose how to upload your file.
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={() => fileRef.current?.click()}>
                Choose file
              </button>
              <button className="small-btn" onClick={() => cameraRef.current?.click()}>
                Use camera
              </button>
              <button className="small-btn" onClick={() => setShowUploadChooser(false)}>
                Cancel
              </button>
            </div>

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

      {/* PREVIEW MODAL */}
      {preview && (
        <div className="modal-overlay preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-top">
              <div className="preview-title">{preview.title}</div>
              <button className="small-btn" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>

            <div className="preview-body">
              {preview.loading ? (
                <div className="subtle">Loading preview...</div>
              ) : isImage(preview.mime) ? (
                <img className="preview-img" src={preview.url} alt={preview.title} />
              ) : (
                <iframe className="preview-frame" title="preview" src={preview.url} style={{ height: "70vh" }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* OPTIONS MODAL */}
      {optionsFor && (
        <div className="modal-overlay" onClick={() => setOptionsFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>File Options</div>

            <div className="field" style={{ marginTop: 10 }}>
              <label>RENAME</label>
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={renameFile}>
                Save Name
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

      {/* ADD SUBJECT MODAL */}
      {showAddSubject && (
        <div className="modal-overlay" onClick={() => setShowAddSubject(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Add Subject</div>

            <div className="field" style={{ marginTop: 10 }}>
              <label>SUBJECT NAME</label>
              <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} placeholder="e.g. Math" />
            </div>

            <div style={{ marginTop: 10, fontWeight: 900, fontSize: 12, opacity: 0.75 }}>ICON</div>
            <div className="icon-grid" style={{ marginTop: 8 }}>
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  className={"icon-pick " + (newSubIcon === ic ? "active" : "")}
                  onClick={() => setNewSubIcon(ic)}
                  type="button"
                >
                  {ic}
                </button>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="small-btn primary" onClick={addSubject}>
                Add
              </button>
              <button className="small-btn" onClick={() => setShowAddSubject(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
