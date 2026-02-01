// src/PortfolioApp.jsx  (UPDATED — PART 1 / 2)
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
  const [busy, setBusy] = useState(false); // ✅ for smooth prompts

  // auth ui
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // forgot/reset
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // ✅ track first-time profile flow (new account guidance)
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
    notify._t = window.setTimeout(() => setToast(""), 1500); // ✅ faster
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
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) return notify(error.message);
  }

  // ✅ After sign up, immediately guide to profile (no sign-in again)
  async function signUp() {
    if (busy) return;
    setBusy(true);

    const { data, error } = await supabase.auth.signUp({ email, password: pass });

    setBusy(false);
    if (error) return notify(error.message);

    // If email verification is OFF, user is already signed in (session exists)
    // If ON, they must verify first. We'll show message either way.
    if (data?.session?.user?.id) {
      notify("Account created. Please setup your profile.");
      setNeedsProfileSetup(true);
      // screen will switch to home via App.jsx auth listener; we force profile after profile loads
    } else {
      notify("Account created. Check your email to verify, then login.");
      setAuthMode("login");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= FORGOT / RESET PASSWORD =========
  async function sendResetLink() {
    const em = resetEmail.trim();
    if (!em) return notify("Enter your email");
    if (busy) return;

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: window.location.origin, // ✅ required for Netlify
    });
    setBusy(false);

    if (error) return notify(error.message);
    notify("Reset link sent. Check your email.");
    setAuthMode("login");
  }

  // ✅ Smooth + fast reset prompt: always switch to setpw when recovery link is opened
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
    if (!newPassword || newPassword.length < 6) return notify("Password must be at least 6 characters");
    if (busy) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (error) return notify(error.message);

    // ✅ smooth: after updating, go straight to login page
    notify("Password updated. Login now.");
    setNewPassword("");
    await supabase.auth.signOut();
    setScreen("auth");
    setAuthMode("login");
  }

  // ========= PROFILE =========
  async function refreshSignedImage(path, setter) {
    if (!path) return setter(null);
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(path, 60 * 30);
    if (error) {
      console.error(error);
      return setter(null);
    }
    setter(data?.signedUrl ?? null);
  }

  function isFirstTimeProfile(p) {
    if (!p) return true;
    return !p.name || p.name.trim() === "" || p.name === "STUDENT 1";
  }

  // ✅ do NOT auto-seed subjects for new accounts; keep empty unless user adds
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

      // ✅ mark as new user -> force profile flow
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

      // ✅ forced guided setup (first login OR new account just created)
      if (needsProfileSetup || isFirstTimeProfile(data)) {
        setScreen("profile");
      }
    }
  }

  // ✅ Save profile: if guided setup, unlock app immediately (no sign-in again)
  async function saveProfile(next) {
    if (!user?.id) return;
    if (busy) return;

    setBusy(true);
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

    // ✅ if this was the first-time guided setup, go to home immediately
    if (needsProfileSetup) {
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

  // ✅ init when user id becomes available
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await ensureProfile(user);
      await loadProfile(user.id);
      await loadSubjects(); // ✅ loads empty by default for new accounts
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

    // ✅ no seeding anymore — new account starts EMPTY
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

  // ✅ Delete ALL subjects button (and their file records + storage files)
  async function deleteAllSubjects() {
    if (!user?.id) return;
    if (!confirm("Delete ALL subjects and ALL files? This cannot be undone.")) return;

    setBusy(true);

    // 1) fetch all file object paths so we can remove from storage
    const { data: fileRows, error: fErr } = await supabase
      .from("files")
      .select("object_path")
      .eq("user_id", user.id);

    if (fErr) {
      setBusy(false);
      console.error(fErr);
      return notify("Failed to read files for deletion");
    }

    const paths = (fileRows ?? []).map((r) => r.object_path).filter(Boolean);

    // 2) remove from storage in chunks (avoid too large request)
    const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    for (const group of chunk(paths, 100)) {
      if (group.length) {
        const { error: rmErr } = await supabase.storage.from("portfolio").remove(group);
        if (rmErr) console.error("storage remove chunk error:", rmErr);
      }
    }

    // 3) delete db rows
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

  // ===== (PART 2 continues: files + UI + smoother setpw prompt) =====
// src/PortfolioApp.jsx  (UPDATED — PART 2 / 2)

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
    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(fileRow.object_path, 60 * 10);

    if (error) {
      console.error(error);
      return notify("Preview failed");
    }

    setPreview({ url: data.signedUrl, title: fileRow.title, mime: fileRow.mime_type || "" });
  }

  async function renameFile() {
    if (!optionsFor || !user?.id) return;
    if (!renameTitle.trim()) return notify("Enter a new name");

    const { error } = await supabase
      .from("files")
      .update({ title: renameTitle.trim() })
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

    await supabase.storage.from("portfolio").remove([optionsFor.object_path]);
    await supabase.from("files").delete().eq("user_id", user.id).eq("id", optionsFor.id);

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
  }

  function go(tab) {
    if (needsProfileSetup && tab !== "profile") {
      notify("Complete your profile first.");
      return setScreen("profile");
    }
    setScreen(tab);
  }

  // ========= PASSWORD RESET UI =========
  if (screen === "setpw") {
    return (
      <div className="app-shell">
        <div className="topbar"><div className="brand">Reset Password</div></div>
        <div className="white-surface auth-card">
          <div className="hero">Set a new password</div>
          <input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder="New password" />
          <button className="small-btn primary" disabled={busy} onClick={updatePassword}>
            {busy ? "Saving..." : "Update Password"}
          </button>
        </div>
      </div>
    );
  }

  // ========= MAIN UI =========
  return (
    <div className="app-shell">
      <div className="topbar">
        {screen !== "home" && <button onClick={back}>←</button>}
        <div className="brand">{titleLine}</div>
      </div>

      {/* HOME */}
      {screen === "home" && (
        <div className="white-surface">
          <div className="hero">Hi, {profile.name}</div>
          <button onClick={() => setScreen("subjects")}>Subjects</button>
        </div>
      )}

      {/* SUBJECTS */}
      {screen === "subjects" && (
        <div className="white-surface">
          <button onClick={deleteAllSubjects} className="danger">Delete All Subjects</button>
          <div className="grid">
            {subjects.map(s => (
              <div key={s.id} onClick={()=>openFolders(s)}>
                {s.icon} {s.title}
                <button onClick={()=>deleteSubject(s.id)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOLDERS */}
      {screen === "folders" && (
        <div className="white-surface">
          <button onClick={()=>openFiles("performance")}>Performance</button>
          <button onClick={()=>openFiles("written")}>Written</button>
        </div>
      )}

      {/* FILES */}
      {screen === "files" && (
        <div className="white-surface">
          <button onClick={triggerUpload}>+</button>
          {files.map(f => (
            <div key={f.id} onClick={()=>openPreview(f)}>
              {f.title}
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadChooser && (
        <div className="modal">
          <button onClick={()=>fileRef.current.click()}>File</button>
          <button onClick={()=>cameraRef.current.click()}>Camera</button>
          <input type="file" ref={fileRef} hidden onChange={handleUploadAny}/>
          <input type="file" ref={cameraRef} accept="image/*" capture hidden onChange={handleUploadCamera}/>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="modal" onClick={()=>setPreview(null)}>
          {isImage(preview.mime) ? <img src={preview.url}/> : <iframe src={preview.url}/>}
        </div>
      )}

      {/* Bottom Nav */}
      <div className="bottom-nav">
        <button onClick={()=>go("home")}>Home</button>
        <button onClick={()=>go("subjects")}>Subjects</button>
        <button onClick={()=>go("profile")}>Profile</button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
