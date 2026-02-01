import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/* Mobile-safe uid (no crypto) */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtBytes(bytes = 0) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function isImage(m=""){ return m.startsWith("image/"); }

const ICONS = ["📘","📄","📁","🧪","💻","📐","🧠","🎨","📷","🔧","🧬","🧾"];

export default function PortfolioApp({ user }) {

  /* ========== ROUTING ========== */
  const [screen, setScreen] = useState(user ? "home" : "auth");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  /* auth modes */
  const [authMode, setAuthMode] = useState("login"); // login | signup | forgot | setpw
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  /* reset password */
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  /* profile */
  const [profile, setProfile] = useState({
    id:null,
    name:"STUDENT 1",
    section:"12-FARADAY",
    school:"INFORMATION AND COMMUNICATION TECHNOLOGY HIGH SCHOOL",
    avatar_path:null,
    logo_path:null
  });
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [logoSrc, setLogoSrc] = useState(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  /* subjects */
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubIcon, setNewSubIcon] = useState("📘");

  /* navigation */
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [category, setCategory] = useState(null);

  /* files */
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optionsFor, setOptionsFor] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [signedCache, setSignedCache] = useState({});

  /* mobile upload */
  const [showUploadChooser, setShowUploadChooser] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  function notify(m){
    setToast(m);
    clearTimeout(notify.t);
    notify.t = setTimeout(()=>setToast(""),1800);
  }

  /* keep screen synced */
  useEffect(()=>{
    setScreen(user ? (p=>p==="auth"?"home":p) : "auth");
  },[user]);

  const titleLine = useMemo(()=>{
    if(screen==="home") return "DAGITAB";
    if(screen==="profile") return "PROFILE";
    if(screen==="subjects") return "SUBJECTS";
    if(screen==="folders") return "FOLDERS";
    if(screen==="files") return "FILES";
    return "DAGITAB";
  },[screen]);

  /* ========== AUTH ========== */
  async function signIn(){
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if(error) return notify(error.message);
  }

  async function signUp(){
    if(pass !== pass2) return notify("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password: pass });
    setBusy(false);
    if(error) return notify(error.message);
    notify("Account created. Complete your profile.");
  }

  async function signOut(){
    await supabase.auth.signOut();
  }

  async function sendResetLink(){
    if(!resetEmail) return notify("Enter your email");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail,{
      redirectTo: window.location.origin
    });
    setBusy(false);
    if(error) return notify(error.message);
    notify("Reset link sent. Check your email.");
  }

  async function updatePassword(){
    if(newPassword.length < 6) return notify("Password too short");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password:newPassword });
    setBusy(false);
    if(error) return notify(error.message);
    notify("Password updated");
    setScreen("auth");
    setAuthMode("login");
  }

  /* detect recovery mode */
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      if(data?.session?.user && data.session.user.recovery_sent_at){
        setScreen("setpw");
      }
    });
  },[]);

  /* ========== PROFILE ========== */
  async function ensureProfile(u){
    if(!u?.id) return;
    const { data } = await supabase.from("profiles").select("*").eq("id",u.id).maybeSingle();
    if(!data){
      await supabase.from("profiles").insert({
        id:u.id,
        name:"",
        section:"",
        school:"",
        avatar_path:null,
        logo_path:null,
        updated_at:new Date().toISOString()
      });
      setNeedsProfileSetup(true);
      setScreen("profile");
    }
  }

  async function loadProfile(uid){
    const { data } = await supabase.from("profiles").select("*").eq("id",uid).maybeSingle();
    if(data){
      setProfile(data);
      setNeedsProfileSetup(!data.name);
      if(data.avatar_path){
        const { data:s } = await supabase.storage.from("portfolio").createSignedUrl(data.avatar_path,1800);
        setAvatarSrc(s?.signedUrl);
      }
      if(data.logo_path){
        const { data:s } = await supabase.storage.from("portfolio").createSignedUrl(data.logo_path,1800);
        setLogoSrc(s?.signedUrl);
      }
    }
  }

  async function saveProfile(next){
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ ...next, updated_at:new Date().toISOString() })
      .eq("id",user.id);
    setBusy(false);
    if(error) return notify("Save failed");
    setNeedsProfileSetup(false);
    setScreen("home");
    notify("Profile saved");
  }

  async function uploadAvatar(file){
    const path = `${user.id}/profile/avatar.jpg`;
    await supabase.storage.from("portfolio").upload(path,file,{upsert:true});
    await supabase.from("profiles").update({avatar_path:path}).eq("id",user.id);
    loadProfile(user.id);
  }

  async function uploadLogo(file){
    const path = `${user.id}/branding/logo.png`;
    await supabase.storage.from("portfolio").upload(path,file,{upsert:true});
    await supabase.from("profiles").update({logo_path:path}).eq("id",user.id);
    loadProfile(user.id);
  }

  /* run on login */
  useEffect(()=>{
    if(user?.id){
      ensureProfile(user);
      loadProfile(user.id);
      loadSubjects();
    }
  },[user?.id]);

  /* ========== SUBJECTS (empty by default) ========== */
  async function loadSubjects(){
    setLoadingSubjects(true);
    const { data } = await supabase.from("subjects")
      .select("*").eq("user_id",user.id).order("sort");
    setLoadingSubjects(false);
    setSubjects(data||[]);
  }

  async function addSubject(){
    const sort = subjects.length ? Math.max(...subjects.map(s=>s.sort||0))+1 : 1;
    await supabase.from("subjects").insert({
      user_id:user.id,
      title:newSubTitle,
      icon:newSubIcon,
      sort
    });
    setShowAddSubject(false);
    setNewSubTitle("");
    loadSubjects();
  }

  async function deleteSubject(id){
    await supabase.from("subjects").delete().eq("id",id).eq("user_id",user.id);
    loadSubjects();
  }

  async function deleteAllSubjects(){
    if(!confirm("Delete ALL subjects and files?")) return;
    await supabase.from("files").delete().eq("user_id",user.id);
    await supabase.from("subjects").delete().eq("user_id",user.id);
    setSubjects([]);
  }

  /* FILES + UI continues in PART 2 */
// src/PortfolioApp.jsx  (PART 2 / 2) — paste this RIGHT AFTER PART 1

  /* ========== FILES ========== */
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
    if (!fileRow?.object_path) return;

    setPreviewLoading(true);

    const cached = signedCache[fileRow.object_path];
    if (cached) {
      setPreview({ url: cached, title: fileRow.title, mime: fileRow.mime_type || "" });
      setPreviewLoading(false);
      return;
    }

    const { data, error } = await supabase.storage
      .from("portfolio")
      .createSignedUrl(fileRow.object_path, 60 * 10);

    if (error) {
      console.error(error);
      setPreviewLoading(false);
      return notify("Preview failed");
    }

    const url = data?.signedUrl;
    setSignedCache((prev) => ({ ...prev, [fileRow.object_path]: url }));
    setPreview({ url, title: fileRow.title, mime: fileRow.mime_type || "" });
    setPreviewLoading(false);
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
    setPreview(null);
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

    const { error } = await supabase
      .from("files")
      .delete()
      .eq("user_id", user.id)
      .eq("id", optionsFor.id);

    if (error) {
      console.error(error);
      return notify("DB delete failed");
    }

    setSignedCache((prev) => {
      const copy = { ...prev };
      delete copy[optionsFor.object_path];
      return copy;
    });

    setOptionsFor(null);
    setPreview(null);
    notify("Deleted");
    await loadFiles(selectedSubject.id, category);
  }

  /* ========== NAV ========== */
  function back() {
    if (screen === "profile") setScreen("home");
    else if (screen === "subjects") setScreen("home");
    else if (screen === "folders") setScreen("subjects");
    else if (screen === "files") setScreen("folders");
    else setScreen("home");
  }

  function go(tab) {
    if (needsProfileSetup && tab !== "profile") {
      notify("Complete your profile first.");
      setScreen("profile");
      return;
    }
    setScreen(tab);
  }

  /* ========== SET PASSWORD SCREEN ========== */
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

  /* ========== AUTH PAGE (no extra forgot tab) ========== */
  if (screen === "auth") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">DAGITAB</div>
          <div />
        </div>

        <div className="white-surface pad-bottom">
          <div className="auth-card">
            {/* 2 tabs only */}
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
            </div>

            {/* Logo frame (login first to set logo) */}
            <div
              className="logo-frame"
              title={user?.id ? "Tap to change logo" : "Logo (set after login)"}
              onClick={() => {
                if (!user?.id) return notify("Login first to set logo");
                document.getElementById("logoInput").click();
              }}
            >
              {logoSrc ? <img src={logoSrc} alt="logo" /> : <div className="logo-ph">LOGO</div>}
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

            {/* Forgot form */}
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
                    <button className="eye" type="button" onClick={() => setShowPass((v) => !v)}>
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

  /* ========== MAIN SHELL ========== */
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

      {/* PROFILE */}
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
                  <div className="file-thumb" onClick={() => openPreview(f)} role="button">
                    {isImage(f.mime_type || "") ? "🖼️" : "📄"}
                  </div>

                  <div className="file-meta" onClick={() => openPreview(f)} role="button">
                    <div className="file-title">{f.title}</div>
                    <div className="file-sub">
                      {fmtBytes(f.size)} • {new Date(f.created_at).toLocaleString()}
                    </div>
                  </div>

                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
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

      {/* UPLOAD CHOOSER */}
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
        <div className="modal-overlay preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-top">
              <div className="preview-title">{preview.title}</div>
              <button className="icon-btn" onClick={() => setPreview(null)} type="button">
                ✕
              </button>
            </div>

            <div className="preview-body">
              {previewLoading ? (
                <div className="subtle" style={{ textAlign: "center", padding: 24 }}>
                  Loading…
                </div>
              ) : isImage(preview.mime) ? (
                <img src={preview.url} alt="preview" className="preview-img" />
              ) : (
                <iframe title="preview" src={preview.url} className="preview-frame" />
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
