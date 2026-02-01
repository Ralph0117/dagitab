// src/PortfolioApp.jsx  (PART 1 / 2)
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
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | setpw | home | profile | subjects | folders | files
  const [toast, setToast] = useState("");

  // auth ui
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // forgot/reset
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

  // ✅ upload chooser + inputs (fix phone)
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
    if (screen === "profile") return "PROFILE";
    if (screen === "subjects") return "SUBJECTS";
    if (screen === "folders") return "FOLDERS";
    if (screen === "files") return "FILES";
    if (screen === "setpw") return "RESET";
    return "DAGITAB";
  }, [screen]);

  // ========= AUTH =========
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) return notify(error.message);
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
    });
    if (error) return notify(error.message);
    notify("Account created. If email verification is ON, check your email.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= FORGOT / RESET PASSWORD =========
  async function sendResetLink() {
    const em = resetEmail.trim();
    if (!em) return notify("Enter your email");

    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: window.location.origin, // works for localhost + netlify
    });

    if (error) return notify(error.message);
    notify("Password reset link sent. Check your email.");
    setAuthMode("login");
  }

  // If user clicks reset link, Supabase triggers PASSWORD_RECOVERY
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setScreen("setpw");
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function updatePassword() {
    if (!newPassword || newPassword.length < 6) return notify("Password must be at least 6 characters");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return notify(error.message);

    notify("Password updated. Login again.");
    setNewPassword("");
    await supabase.auth.signOut();
    setScreen("auth");
  }

  // ========= PROFILE =========
  async function refreshSignedImage(path, setter) {
    if (!path) {
      setter(null);
      return;
    }
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(path, 60 * 30);
    if (error) {
      console.error(error);
      setter(null);
      return;
    }
    setter(data?.signedUrl ?? null);
  }

  function isFirstTimeProfile(p) {
    if (!p) return true;
    return !p.name || p.name.trim() === "" || p.name === "STUDENT 1";
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

    // ✅ only insert if missing (do NOT overwrite)
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

      // ✅ First login -> force profile completion
      if (isFirstTimeProfile(data)) {
        setScreen("profile");
        notify("Please complete your profile first.");
      }
    }
  }

  async function saveProfile(next) {
    if (!user?.id) return;

    // optimistic UI
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
      .select("id,name,section,school,avatar_path,logo_path,updated_at")
      .maybeSingle();

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

  async function uploadLogo(file) {
    if (!user?.id || !file) return;

    const path = `${user.id}/branding/logo.png`;

    const { error: upErr } = await supabase.storage.from("portfolio").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (upErr) {
      console.error(upErr);
      return notify("Logo upload failed");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      console.error(error);
      return notify("Failed to save logo");
    }

    await loadProfile(user.id);
    notify("Logo updated");
  }

  // ✅ init when user id becomes available (prevents id=undefined)
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
  async function seedDefaultSubjects(uid_) {
    const defaults = Array.from({ length: 8 }, (_, i) => ({
      user_id: uid_,
      title: `Subject ${i + 1}`,
      icon: "📄",
      sort: i + 1,
    }));

    const { error } = await supabase.from("subjects").insert(defaults);
    if (error) console.error(error);
  }

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

    if (!data || data.length === 0) {
      await seedDefaultSubjects(user.id);
      return loadSubjects();
    }

    setSubjects(data);
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

    if (subjects.length <= 1) return notify("You must keep at least 1 subject");
    if (!confirm("Delete this subject?")) return;

    // delete file rows for this subject (storage objects not removed here)
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

  // ====== (PART 2 continues below) ======
// src/PortfolioApp.jsx  (PART 2 / 2)
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
    const f = file;
    if (!f || !user?.id || !selectedSubject || !category) return;

    // ✅ safe filename for storage (fix signed url + mobile issues)
    const safeName = f.name.replace(/[^\w.\-]+/g, "_");

    // ✅ mobile-safe uid (fix crypto error)
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

  // ========= NAV =========
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  function go(tab) {
    // basic guard: first time must complete profile
    if (user?.id && isFirstTimeProfile(profile) && tab !== "profile") {
      notify("Complete your profile first.");
      return setScreen("profile");
    }

    if (tab === "home") setScreen("home");
    if (tab === "subjects") setScreen("subjects");
    if (tab === "profile") setScreen("profile");
  }

  // ========= AUTH UI =========
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            {/* Logo frame (uploads only after login). Shows last saved logo if exists + user is already signed-in. */}
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 14,
                border: "3px solid rgba(30,73,214,0.95)",
                margin: "4px auto 14px",
                background: "rgba(30,73,214,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                userSelect: "none",
              }}
              title="Logo"
            >
              {logoSrc ? (
                <img src={logoSrc} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ fontWeight: 900, color: "#1e49d6" }}>LOGO</div>
              )}
            </div>

            <div className="auth-banner">
              Digital Application for Guiding and Improving Tasks, Academics, and Bibliographies for students
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className={`small-btn ${authMode === "login" ? "primary" : ""}`}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={`small-btn ${authMode === "signup" ? "primary" : ""}`}
                onClick={() => setAuthMode("signup")}
                type="button"
              >
                Create
              </button>
              <button
                className={`small-btn ${authMode === "forgot" ? "primary" : ""}`}
                onClick={() => setAuthMode("forgot")}
                type="button"
              >
                Forgot
              </button>
            </div>

            {authMode !== "forgot" ? (
              <>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" />
                </div>

                <div className="field">
                  <label>PASSWORD</label>
                  <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
                </div>

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
              </>
            ) : (
              <>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>EMAIL</label>
                  <input
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Enter your account email"
                  />
                </div>
                <div className="modal-actions">
                  <button className="small-btn primary" onClick={sendResetLink}>
                    Send Reset Link
                  </button>
                </div>
                <div className="subtle" style={{ marginTop: 10 }}>
                  We will email you a reset link. After you open it, you’ll return here and set a new password.
                </div>
              </>
            )}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ========= PASSWORD RESET PAGE =========
  if (screen === "setpw") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">RESET PASSWORD</div>
          <div />
        </div>

        <div className="white-surface">
          <div className="auth-card">
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Set a new password</div>
            <div className="subtle">Enter your new password below.</div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>NEW PASSWORD</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="modal-actions">
              <button className="small-btn primary" onClick={updatePassword}>
                Update Password
              </button>
              <button className="small-btn" onClick={() => setScreen("auth")}>
                Back
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

          {/* optional: logo uploader here too (this one works because you are logged in) */}
          <div className="profile-card" style={{ marginTop: 12 }}>
            <div
              onClick={() => document.getElementById("logoInput").click()}
              style={{
                width: 70,
                height: 70,
                borderRadius: 12,
                border: "2px solid rgba(30,73,214,0.65)",
                background: "rgba(30,73,214,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                cursor: "pointer",
              }}
              title="Change logo"
            >
              {logoSrc ? (
                <img src={logoSrc} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ fontWeight: 900, color: "#1e49d6" }}>LOGO</div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>App Logo</div>
              <div className="subtle" style={{ margin: 0 }}>
                Tap to upload/change
              </div>
            </div>
          </div>

          <input
            id="logoInput"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadLogo(f);
            }}
          />

          <div className="field" style={{ marginTop: 12 }}>
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
                    onClick={() => openFolders(s)}
                    role="button"
                    style={{ cursor: "pointer" }}
                    title="Open"
                  >
                    <div className="ticon">{s.icon}</div>
                    <div className="ttext">{s.title}</div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <button className="small-btn" onClick={() => openFolders(s)}>
                      Open
                    </button>
                    {/* ✅ Delete button for any subject (still blocks deleting last one) */}
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
            <div className="modal">
              <div className="modal-card">
                <div style={{ fontWeight: 900, fontSize: 16 }}>Add Subject</div>
                <div className="subtle" style={{ marginTop: 4 }}>
                  Name + choose an icon.
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>SUBJECT NAME</label>
                  <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} placeholder="e.g., Math" />
                </div>

                <div style={{ marginTop: 10, fontWeight: 900, fontSize: 12, color: "#0f172a" }}>ICON</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
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
                    {isImage(f.mime_type) ? "🖼️" : "📄"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="file-title" title={f.title}>
                      {f.title}
                    </div>
                    <div className="subtle" style={{ margin: 0 }}>
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
                    ⋮
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Floating + */}
          <button className="fab" onClick={triggerUpload} title="Upload">
            +
          </button>

          {/* Upload chooser */}
          {showUploadChooser && (
            <div className="modal" onClick={() => setShowUploadChooser(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Upload</div>
                <div className="subtle" style={{ marginTop: 4 }}>
                  Choose source:
                </div>

                <div className="modal-actions" style={{ marginTop: 14 }}>
                  <button className="small-btn primary" onClick={() => fileRef.current?.click()} type="button">
                    📁 File
                  </button>
                  <button className="small-btn" onClick={() => cameraRef.current?.click()} type="button">
                    📷 Camera
                  </button>
                  <button className="small-btn" onClick={() => setShowUploadChooser(false)} type="button">
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
            <div className="modal" onClick={() => setPreview(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>{preview.title}</div>

                {isImage(preview.mime) ? (
                  <img src={preview.url} alt="preview" style={{ width: "100%", borderRadius: 12 }} />
                ) : (
                  <iframe title="preview" src={preview.url} style={{ width: "100%", height: 520, border: 0 }} />
                )}

                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="small-btn" onClick={() => setPreview(null)} type="button">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Options modal */}
          {optionsFor && (
            <div className="modal" onClick={() => setOptionsFor(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>File Options</div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>RENAME</label>
                  <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
                </div>

                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="small-btn primary" onClick={renameFile} type="button">
                    Save Name
                  </button>
                  <button className="small-btn danger" onClick={deleteFile} type="button">
                    Delete
                  </button>
                  <button className="small-btn" onClick={() => setOptionsFor(null)} type="button">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ Bottom Navigation (easy navigation) */}
      <div className="bottom-nav">
        <button className={`navbtn ${screen === "home" ? "active" : ""}`} onClick={() => go("home")} type="button">
          <div className="navico">🏠</div>
          <div className="navtxt">Home</div>
        </button>

        <button
          className={`navbtn ${screen === "subjects" || screen === "folders" || screen === "files" ? "active" : ""}`}
          onClick={() => go("subjects")}
          type="button"
        >
          <div className="navico">📚</div>
          <div className="navtxt">Subjects</div>
        </button>

        <button className={`navbtn ${screen === "profile" ? "active" : ""}`} onClick={() => go("profile")} type="button">
          <div className="navico">👤</div>
          <div className="navtxt">Profile</div>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
