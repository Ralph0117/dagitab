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
  const [screen, setScreen] = useState(user ? "home" : "auth"); // auth | home | profile | subjects | folders | files
  const [toast, setToast] = useState("");

  // auth ui
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

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
    return "DAGITAB";
  }, [screen]);

  // ========= AUTH =========
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return notify(error.message);
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) return notify(error.message);
    notify("Account created. If email verification is ON, check your email.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ========= PROFILE (SIGNED URL HELPERS) =========
  async function refreshSignedUrl(path, setter) {
    if (!path) {
      setter(null);
      return;
    }

    // signed url works for both public/private buckets
    const { data, error } = await supabase.storage.from("portfolio").createSignedUrl(path, 60 * 30);
    if (error) {
      console.error("createSignedUrl error:", error);
      setter(null);
      return;
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

    // ✅ Only insert if missing (never overwrite)
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
      setProfile(data);
      await refreshSignedUrl(data.avatar_path, setAvatarSrc);
      await refreshSignedUrl(data.logo_path, setLogoSrc);
    }
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
      .select("id,name,section,school,avatar_path,logo_path,updated_at")
      .maybeSingle();

    if (error) {
      console.error("saveProfile error:", error);
      return notify("Failed to save profile");
    }

    if (data) {
      setProfile(data);
      await refreshSignedUrl(data.avatar_path, setAvatarSrc);
      await refreshSignedUrl(data.logo_path, setLogoSrc);
    }

    notify("Profile saved");
  }

  async function uploadAvatar(file) {
    if (!user?.id || !file) return;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/profile/avatar.${ext}`;

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

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/branding/logo.${ext}`;

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

  // run once when user id becomes available
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
    setPreview({ url: data.signedUrl, title: fileRow.title, mime: fileRow.mime_type || "" });
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
 // put this near your other states (top of PortfolioApp)
const [appLogo, setAppLogo] = useState(
  localStorage.getItem("dagitab_app_logo") || null
);

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
          {/* APP LOGO (Option B – permanent on this device via localStorage) */}
          <div
            onClick={() => document.getElementById("appLogoInput").click()}
            style={{
              width: 130,
              height: 130,
              borderRadius: 18,
              margin: "0 auto 16px",
              border: "3px solid rgba(30,73,214,0.9)",
              background: "rgba(30,73,214,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              cursor: "pointer",
              userSelect: "none",
            }}
            title="Tap to change logo"
          >
            {appLogo ? (
              <img
                src={appLogo}
                alt="DAGITAB Logo"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ fontWeight: 900, color: "#1e49d6", fontSize: 20 }}>
                DAGITAB
              </div>
            )}
          </div>

          <input
            id="appLogoInput"
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // important (mobile reselect)
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                localStorage.setItem("dagitab_app_logo", dataUrl);
                setAppLogo(dataUrl);
                notify("Logo saved on this device");
              };
              reader.readAsDataURL(file);
            }}
          />

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
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label>PASSWORD</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div className="modal-actions">
            <button className="small-btn primary" onClick={signIn}>
              Login
            </button>
            <button className="small-btn" onClick={signUp}>
              Create Account
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

          {/* ADD SUBJECT MODAL */}
          {showAddSubject && (
            <div className="modal-overlay" onClick={() => setShowAddSubject(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Add Subject</div>

                <div className="field">
                  <label>SUBJECT NAME</label>
                  <input value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} placeholder="e.g. Math" />
                </div>

                <div style={{ marginTop: 10, fontWeight: 800 }}>Choose Icon</div>
                <div className="icon-grid" style={{ marginTop: 8 }}>
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

                <div className="modal-actions" style={{ marginTop: 12 }}>
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

                  <div className="file-meta" onClick={() => openPreview(f)} style={{ cursor: "pointer" }}>
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {fmtBytes(f.size)} {f.created_at ? `• ${new Date(f.created_at).toLocaleString()}` : ""}
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
            <div className="modal-overlay" onClick={() => setShowUploadChooser(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Upload</div>

                <button className="small-btn primary" onClick={() => fileRef.current?.click()} type="button">
                  Choose File
                </button>

                <div style={{ height: 10 }} />

                <button className="small-btn" onClick={() => cameraRef.current?.click()} type="button">
                  Use Camera
                </button>

                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="small-btn" onClick={() => setShowUploadChooser(false)} type="button">
                    Cancel
                  </button>
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={handleUploadAny}
                />

                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={handleUploadCamera}
                />
              </div>
            </div>
          )}

          {/* File options modal */}
          {optionsFor && (
            <div className="modal-overlay" onClick={() => setOptionsFor(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>File Options</div>

                <div className="field">
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

          {/* Preview modal */}
          {preview && (
            <div className="modal-overlay" onClick={() => setPreview(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>{preview.title}</div>

                {isImage(preview.mime) ? (
                  <img src={preview.url} alt={preview.title} style={{ width: "100%", borderRadius: 12 }} />
                ) : (
                  <div className="subtle">
                    Preview for this file type isn’t embedded. Use the link below.
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    Open / Download
                  </a>
                </div>

                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="small-btn" onClick={() => setPreview(null)} type="button">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
