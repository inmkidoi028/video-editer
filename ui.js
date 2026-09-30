/* ══════════════════════════════════════════════════════════
   ClipForge AI — UI Controller (Complete)
   ══════════════════════════════════════════════════════════ */

(function(){
  "use strict";

  const state = {
    step: "input",
    source: null,
    config: { aspect:"9:16", duration:"30", customMin:0, customSec:45, reels:"3" },
    clips: [],
    activeClip: null,
    export: { quality:"1080", format:"mp4" },
    thumbnails: {},
    brollActive: false,
    sfxAudio: null
  };

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ══════════ TOASTS ══════════ */
  function toast(msg, type="info"){
    const stack = $("#toastStack");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const ico = type==="ok" ? "✔" : type==="err" ? "✕" : "ℹ";
    el.innerHTML = `<span class="toast-ico">${ico}</span><span>${escapeHtml(msg)}</span>`;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 260); }, 3200);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  /* ══════════ STEP NAV ══════════ */
  const STEPS = ["input","results","editor","export"];
  function setStep(step){
    state.step = step;
    STEPS.forEach((s, i) => {
      const btn = $(`.step[data-step="${s}"]`);
      const view = $(`#view-${s}`);
      const isCurrent = s === step;
      const isDone = STEPS.indexOf(step) > i;
      btn.classList.toggle("is-active", isCurrent);
      btn.classList.toggle("is-done", isDone);
      btn.disabled = !isCurrent && !isDone && i > STEPS.indexOf(step);
      view.classList.toggle("is-active", isCurrent);
    });
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  function enableStepsFrom(idx){
    STEPS.forEach((s, i) => { if (i <= idx) $(`.step[data-step="${s}"]`).disabled = false; });
  }

  /* ══════════ TABS ══════════ */
  function initTabs(){
    $$(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$(".tab").forEach(t => t.classList.remove("is-active"));
        $$(".tab-panel").forEach(p => p.classList.remove("is-active"));
        tab.classList.add("is-active");
        $(`#tab-${tab.dataset.tab}`).classList.add("is-active");
      });
    });
  }

  /* ══════════ SEGMENTED ══════════ */
  function initSegmented(){
    $$(".segmented").forEach(group => {
      const field = group.dataset.field;
      $$(".seg", group).forEach(seg => {
        seg.addEventListener("click", () => {
          $$(".seg", group).forEach(s => s.classList.remove("is-active"));
          seg.classList.add("is-active");
          state.config[field] = seg.dataset.value;
          if (field === "duration"){
            $("#customDuration").classList.toggle("is-hidden", seg.dataset.value !== "custom");
          }
        });
      });
    });
    $("#customMin").addEventListener("input", e => { state.config.customMin = clampInt(e.target.value, 0, 59); });
    $("#customSec").addEventListener("input", e => { state.config.customSec = clampInt(e.target.value, 0, 59); });
  }
  function clampInt(v, min, max){
    let n = parseInt(v, 10); if (isNaN(n)) n = 0;
    return Math.max(min, Math.min(max, n));
  }
  function getEffectiveDuration(){
    if (state.config.duration === "custom") return state.config.customMin * 60 + state.config.customSec;
    return parseInt(state.config.duration, 10);
  }

  /* ══════════ SOURCE INPUTS ══════════ */
  function initSourceInputs(){
    $("#btnLoadLink").addEventListener("click", async () => {
      const url = $("#youtubeUrl").value.trim();
      if (!url){ toast("Please paste a YouTube link","err"); return; }
      if (!/youtube\.com|youtu\.be/i.test(url)){ toast("That doesn't look like a YouTube URL","err"); return; }
      await loadSourceFromUrl(url);
    });
    $("#youtubeUrl").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLoadLink").click(); });

    const fileInput = $("#fileInput");
    const dropzone = $("#dropzone");
    fileInput.addEventListener("change", e => {
      const f = e.target.files && e.target.files[0]; if (f) handleFile(f);
    });
    ["dragenter","dragover"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("is-drag"); }));
    ["dragleave","drop"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("is-drag"); }));
    dropzone.addEventListener("drop", e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f);
    });
  }

  async function loadSourceFromUrl(url){
    const btn = $("#btnLoadLink");
    btn.disabled = true; btn.textContent = "Loading…";
    try {
      const info = await API.fetchVideoInfo(url);
      setSource({ id:info.id, type:"youtube", url, title:info.title, channel:info.channel, duration:info.duration, thumbnail:info.thumbnail });
      toast("Video loaded","ok");
    } catch(err){ toast(err.message || "Failed to load","err"); }
    finally { btn.disabled = false; btn.textContent = "Load Video"; }
  }

  async function handleFile(file){
    const dz = $("#dropzone");
    const old = dz.innerHTML;
    dz.innerHTML = `<div class="dz-icon">⏳</div><strong>Uploading ${escapeHtml(file.name)}…</strong><span>Please wait</span>`;
    try {
      const info = await API.uploadVideo(file);
      const localUrl = URL.createObjectURL(file);
      setSource({
        id: info.id || "local", type:"upload", url: localUrl,
        title: info.title || file.name, channel:"Local file",
        duration: info.duration || 0, thumbnail: info.thumbnail || ""
      });
      toast("Video ready","ok");
    } catch(err){ toast(err.message || "Upload failed","err"); }
    finally { dz.innerHTML = old; $("#fileInput").value = ""; }
  }

  function setSource(source){
    state.source = source;
    const thumb = $("#previewThumb");
    if (source.thumbnail){ thumb.src = source.thumbnail; thumb.style.display = ""; }
    else { thumb.removeAttribute("src"); thumb.style.display = "none"; }
    $("#previewBadge").textContent = source.type === "youtube" ? "YouTube" : "Local";
    $("#previewDuration").textContent = formatTime(source.duration);
    $("#previewTitle").textContent = source.title || "Untitled";
    $("#previewSub").textContent = source.channel || "Ready to analyse";
    $("#sourcePreview").classList.remove("is-hidden");
    $("#configPanel").classList.remove("is-hidden");
    $("#generateWrap").classList.remove("is-hidden");
    setTimeout(() => $("#configPanel").scrollIntoView({ behavior:"smooth", block:"start" }), 120);
  }

  function initChangeSource(){
    $("#btnChangeSource").addEventListener("click", () => {
      $("#sourcePreview").classList.add("is-hidden");
      $("#configPanel").classList.add("is-hidden");
      $("#generateWrap").classList.add("is-hidden");
      state.source = null;
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  }

  /* ══════════ GENERATE ══════════ */
  function initGenerate(){
    const btn = $("#btnGenerate");
    btn.addEventListener("click", async () => {
      if (!state.source){ toast("Load a source video first","err"); return; }
      const dur = getEffectiveDuration();
      if (dur < 5 || dur > 180){ toast("Clip duration must be between 5s and 3 minutes","err"); return; }

      const payload = {
        sourceId: state.source.id, sourceUrl: state.source.url,
        aspect: state.config.aspect, duration: state.config.duration,
        customDuration: dur, reels: state.config.reels
      };

      btn.disabled = true;
      btn.querySelector(".gen-label").textContent = "Generating…";
      $("#genProgress").classList.remove("is-hidden");

      const stop = animateProgress("#genFill","#genPct","#genStage", [
        "Analysing audio…","Detecting hooks…","Scoring virality…","Cutting clips…","Reframing for " + state.config.aspect + "…"
      ], 3200);

      try {
        const res = await API.generateClips(payload);
        stop(100);
        await waitFor(320);
        state.clips = (res.clips || []).map((c,i) => ({ ...c, index:i }));
        renderClipGallery();
        enableStepsFrom(STEPS.indexOf("results"));
        setStep("results");
        toast(`Generated ${state.clips.length} clip${state.clips.length===1?"":"s"}`, "ok");
      } catch(err){
        stop(0);
        toast(err.message || "Generation failed","err");
      } finally {
        btn.disabled = false;
        btn.querySelector(".gen-label").textContent = "✨ Generate Clips";
        $("#genProgress").classList.add("is-hidden");
        $("#genFill").style.width = "0%";
        $("#genPct").textContent = "0%";
      }
    });
  }

  /* ══════════ ANIMATION HELPERS ══════════ */
  function animateProgress(fillSel, pctSel, stageSel, stages, durMs){
    const fill = $(fillSel), pct = $(pctSel), stage = $(stageSel);
    const start = performance.now();
    let raf, cancelled = false;

    function frame(now){
      if (cancelled) return;
      const t = Math.min(1, (now - start) / durMs);
      const eased = easeOutCubic(t);
      const val = Math.round(eased * 96);
      fill.style.width = val + "%";
      pct.textContent = val + "%";
      if (stages && stages.length){
        const idx = Math.min(stages.length - 1, Math.floor(t * stages.length));
        stage.textContent = stages[idx];
      }
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return function stop(final){
      cancelled = true;
      cancelAnimationFrame(raf);
      if (typeof final === "number"){
        fill.style.width = final + "%";
        pct.textContent = final + "%";
        if (stages && stages.length) stage.textContent = final >= 100 ? "Done" : stages[0];
      }
    };
  }
  function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
  function waitFor(ms){ return new Promise(r => setTimeout(r, ms)); }

  /* ══════════ CLIP GALLERY ══════════ */
  function renderClipGallery(){
    const grid = $("#clipGrid");
    grid.innerHTML = "";
    $("#resultsMeta").textContent =
      `${state.clips.length} clips · ${state.config.aspect} · ${formatTime(getEffectiveDuration())} each`;

    state.clips.forEach((clip, i) => {
      const card = document.createElement("article");
      card.className = "clip-card";
      card.dataset.clipId = clip.id;
      card.innerHTML = `
        <div class="clip-media">
          <span class="clip-rank-badge">#${i+1}</span>
          <div class="viral-ring" style="--score:${clip.viralScore}">
            <b>${clip.viralScore}%</b>
            <small>🔥 Viral</small>
          </div>
          <video src="${clip.videoUrl}" muted playsinline preload="metadata" poster="${clip.thumbnail || ""}"></video>
          <span class="clip-duration-badge">${formatTime(clip.duration)}</span>
        </div>
        <div class="clip-info">
          <h4>${escapeHtml(clip.title)}</h4>
          <div class="clip-tags">${(clip.tags||[]).map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>
          <div class="clip-actions">
            <button class="btn btn-ghost btn-sm" data-action="preview">▶ Preview</button>
            <button class="btn btn-primary btn-sm" data-action="edit">✎ Edit in Pro</button>
          </div>
        </div>`;
      grid.appendChild(card);
    });

    grid.onclick = e => {
      const card = e.target.closest(".clip-card"); if (!card) return;
      const clip = state.clips.find(c => c.id === card.dataset.clipId); if (!clip) return;
      const action = e.target.closest("[data-action]"); if (!action) return;

      if (action.dataset.action === "edit") openEditor(clip);
      else if (action.dataset.action === "preview"){
        const v = card.querySelector("video");
        if (v.paused){ v.play(); action.textContent = "❚❚ Pause"; }
        else { v.pause(); action.textContent = "▶ Preview"; }
      }
    };
  }

  function initBackToInput(){
    $("#btnBackToInput").addEventListener("click", () => setStep("input"));
  }

  /* ══════════ PRO EDITOR ══════════ */
  function initEditor(){
    const video = $("#editorVideo");
    const playBtn = $("#tpPlay");
    const muteBtn = $("#tpMute");
    const track = $("#tpTrack");
    const fill = $("#tpFill");
    const cur = $("#tpCurrent");
    const total = $("#tpTotal");

    playBtn.addEventListener("click", () => {
      if (video.paused){ video.play(); playBtn.textContent = "❚❚"; }
      else { video.pause(); playBtn.textContent = "▶"; }
    });
    muteBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? "🔇" : "🔊";
    });
    video.addEventListener("timeupdate", () => {
      const t = video.currentTime || 0;
      const d = video.duration || 0;
      cur.textContent = formatTime(t);
      total.textContent = formatTime(d || getEffectiveDuration());
      const pct = d ? (t / d) * 100 : 0;
      fill.style.width = pct + "%";
      const ph = $("#tlPlayhead"); if (ph) ph.style.left = pct + "%";
    });
    track.addEventListener("click", e => {
      const rect = track.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (video.duration) video.currentTime = pct * video.duration;
    });
    $("#tlRuler").addEventListener("click", e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (video.duration) video.currentTime = pct * video.duration;
    });
    $("#btnGoExport").addEventListener("click", () => {
      prepareExport();
      enableStepsFrom(STEPS.indexOf("export"));
      setStep("export");
    });
  }

  function openEditor(clip){
    state.activeClip = clip;
    $("#editorClipLabel").textContent = `Clip #${clip.index + 1}`;
    const video = $("#editorVideo");
    video.src = clip.videoUrl;
    video.load();
    video.muted = false;
    video.playbackRate = 1;
    video.preservesPitch = true;
    video.style.filter = "";

    buildTimeline(clip);
    applyAspect(clip.aspectRatio || state.config.aspect);

    $("#captionLayer").classList.add("is-hidden");
    $("#toggleCaptions").checked = false;
    $("#toggleStudio").checked = false;
    $("#thumbResult").classList.add("is-hidden");
    $("#brollOverlay").classList.add("is-hidden");
    state.brollActive = false;
    clearBadges();

    enableStepsFrom(STEPS.indexOf("editor"));
    setStep("editor");
    toast(`Editing clip #${clip.index + 1}`, "info");
  }

  function applyAspect(aspect){
    const map = { "9:16":"9/16", "1:1":"1/1", "16:9":"16/9" };
    const frame = $("#playerFrame");
    frame.style.aspectRatio = map[aspect] || "9/16";
    frame.style.maxHeight = "60vh";
    frame.style.margin = "0 auto";
    frame.style.width = "100%";
  }

  /* ══════════ TIMELINE ══════════ */
  function buildTimeline(clip){
    const labels = $("#tlLabels");
    const laneGroup = $("#tlLaneGroup");
    const ruler = $("#tlRuler");

    const lanes = [
      { id:"video", name:"V1" },
      { id:"audio", name:"A1" },
      { id:"caption", name:"C1" },
      { id:"effect", name:"FX" }
    ];
    labels.innerHTML = `<div style="height:22px;border-bottom:1px solid var(--line)"></div>` +
      lanes.map(l => `<div class="tl-label">${l.name}</div>`).join("");

    ruler.innerHTML = "";
    const dur = clip.duration || 30;
    const tickEvery = dur <= 20 ? 2 : dur <= 45 ? 5 : 10;
    for (let t = 0; t <= dur; t += tickEvery){
      const tick = document.createElement("div");
      tick.className = "tl-tick";
      tick.style.left = ((t / dur) * 100) + "%";
      tick.textContent = `${t}s`;
      ruler.appendChild(tick);
    }

    laneGroup.innerHTML = lanes.map(l => `<div class="tl-lane" data-lane="${l.id}"></div>`).join("");

    const videoLane = laneGroup.querySelector('[data-lane="video"]');
    const audioLane = laneGroup.querySelector('[data-lane="audio"]');

    videoLane.innerHTML = `<div class="tl-clip video" style="left:0;width:100%">${escapeHtml((clip.title||"").slice(0,40))}</div>`;
    audioLane.innerHTML = `<div class="tl-clip audio" style="left:0;width:100%">Audio</div>`;
  }

  function addTimelineBlock(laneId, label, cls){
    const lane = $(`[data-lane="${laneId}"]`);
    if (!lane) return;
    const block = document.createElement("div");
    block.className = `tl-clip ${cls}`;
    block.style.left = "0"; block.style.width = "100%";
    block.textContent = label;
    lane.innerHTML = "";
    lane.appendChild(block);
  }
  function removeTimelineBlock(laneId){
    const lane = $(`[data-lane="${laneId}"]`);
    if (lane) lane.innerHTML = "";
  }

  /* ══════════ PLAYER BADGES ══════════ */
  function addBadge(text, cls="accent"){
    const wrap = $("#playerBadges");
    const b = document.createElement("span");
    b.className = `p-badge ${cls}`;
    b.textContent = text;
    b.dataset.badge = text;
    /* avoid duplicates */
    if (wrap.querySelector(`[data-badge="${text}"]`)) return;
    wrap.appendChild(b);
  }
  function removeBadge(text){
    const wrap = $("#playerBadges");
    const b = wrap.querySelector(`[data-badge="${text}"]`);
    if (b) b.remove();
  }
  function clearBadges(){ $("#playerBadges").innerHTML = ""; }

  /* ══════════ CUSTOM LANGUAGE LOGIC (NEW) ══════════ */
  function initCustomLanguage(){
    const fromSel = $("#dubFrom");
    const toSel = $("#dubTo");
    const fromWrap = $("#customFromWrap");
    const toWrap = $("#customToWrap");
    const fromInp = $("#customFromInput");
    const toInp = $("#customToInput");
    const preview = $("#langPreview");
    const previewFrom = $("#langFromPreview");
    const previewTo = $("#langToPreview");

    function updatePreview(){
      const f = getLanguageValue(fromSel, fromInp);
      const t = getLanguageValue(toSel, toInp);
      if (f && t){
        previewFrom.textContent = f;
        previewTo.textContent = t;
        preview.classList.remove("is-hidden");
      } else {
        preview.classList.add("is-hidden");
      }
    }

    fromSel.addEventListener("change", () => {
      const isCustom = fromSel.value === "__custom__";
      fromWrap.classList.toggle("is-hidden", !isCustom);
      if (isCustom) fromInp.focus();
      updatePreview();
    });
    toSel.addEventListener("change", () => {
      const isCustom = toSel.value === "__custom__";
      toWrap.classList.toggle("is-hidden", !isCustom);
      if (isCustom) toInp.focus();
      updatePreview();
    });
    fromInp.addEventListener("input", updatePreview);
    toInp.addEventListener("input", updatePreview);
  }

  function getLanguageValue(selectEl, inputEl){
    if (selectEl.value === "__custom__"){
      const v = (inputEl.value || "").trim();
      return v || "Custom";
    }
    return selectEl.value;
  }

  /* ══════════ PRO TOOLS ══════════ */
  function initProTools(){
    $$("[data-tool]").forEach(el => {
      if (el.tagName === "BUTTON"){
        el.addEventListener("click", () => runTool(el.dataset.tool, el.dataset.label));
      } else if (el.type === "checkbox"){
        el.addEventListener("change", () => {
          const label = el.dataset.tool === "captions" ? "Hormozi captions" : "Studio Sound";
          runTool(el.dataset.tool, (el.checked ? "Enabling " : "Disabling ") + label, !el.checked);
        });
      }
    });
  }

  async function runTool(tool, label, isUndo){
    if (!state.activeClip){ toast("Open a clip first","err"); return; }
    const video = $("#editorVideo");

    /* Instant visual feedback (works even without backend) */
    switch(tool){
      case "captions":
        $("#captionLayer").classList.toggle("is-hidden", !!isUndo);
        if (isUndo){ removeTimelineBlock("caption"); removeBadge("💬 Captions"); }
        else { addTimelineBlock("caption","3D Captions","caption"); addBadge("💬 Captions"); }
        break;
      case "studio":
        if (isUndo){ removeTimelineBlock("effect"); removeBadge("🎚️ Studio"); }
        else { addTimelineBlock("effect","Studio Sound","effect"); addBadge("🎚️ Studio"); }
        break;
      case "broll":
        /* Real overlay image (uses picsum) */
        const broll = $("#brollOverlay");
        broll.src = `https://picsum.photos/seed/broll-${Date.now()}/800/1200`;
        broll.classList.remove("is-hidden");
        state.brollActive = true;
        addTimelineBlock("effect","B-Roll","effect");
        addBadge("🎬 B-Roll","hot");
        break;
      case "sfx":
        /* Real beep via WebAudio API */
        playSfxBeep();
        addTimelineBlock("effect","Meme SFX","effect");
        addBadge("🔊 SFX","hot");
        break;
      case "clearfx":
        removeTimelineBlock("effect");
        removeTimelineBlock("caption");
        $("#brollOverlay").classList.add("is-hidden");
        $("#captionLayer").classList.add("is-hidden");
        $("#toggleCaptions").checked = false;
        $("#toggleStudio").checked = false;
        state.brollActive = false;
        clearBadges();
        toast("Overlays cleared","info");
        return;
      case "voice": {
        const style = $("#voiceStyle").value;
        const map = { "Robotic":1.0, "Deep Bass":0.78, "Chipmunk":1.55, "Echo Chamber":1.0, "Narrator":0.92, "Villain":0.72, "Normal":1.0 };
        video.playbackRate = map[style] || 1.0;
        try { video.preservesPitch = style !== "Robotic"; } catch(_){}
        if (style === "Deep Bass") video.style.filter = "brightness(1.05)";
        else if (style === "Chipmunk") video.style.filter = "saturate(1.3)";
        else video.style.filter = "";
        addTimelineBlock("audio", `Voice: ${style}`, "audio");
        removeBadge("🎛️ Voice");
        addBadge(`🎛️ ${style}`);
        break;
      }
      case "dub": {
        const from = getLanguageValue($("#dubFrom"), $("#customFromInput"));
        const to = getLanguageValue($("#dubTo"), $("#customToInput"));
        addTimelineBlock("audio", `${from} → ${to}`, "audio");
        removeBadge("🗣️ Dubbed");
        addBadge(`🗣️ ${from} → ${to}`, "ok");
        break;
      }
    }

    /* Show overlay 0→100 */
    await showProcessingOverlay(label, async () => {
      const params = collectToolParams(tool);
      try { await API.processTool(tool, params); } catch(_){}
    });

    if (tool === "thumbnail"){
      const url = grabVideoFrame(video);
      if (url){
        state.thumbnails[state.activeClip.id] = url;
        $("#thumbResultImg").src = url;
        $("#thumbResult").classList.remove("is-hidden");
        toast("Thumbnail grabbed from video","ok");
      } else {
        toast("Thumbnail ready","ok");
      }
    } else if (!isUndo && tool !== "clearfx"){
      toast(`${label} — applied`, "ok");
    }
  }

  function collectToolParams(tool){
    const base = { clipId: state.activeClip && state.activeClip.id };
    switch(tool){
      case "dub": {
        const from = getLanguageValue($("#dubFrom"), $("#customFromInput"));
        const to = getLanguageValue($("#dubTo"), $("#customToInput"));
        return { ...base, from, to };
      }
      case "voice": return { ...base, style: $("#voiceStyle").value };
      case "captions": return { ...base, enabled: $("#toggleCaptions").checked };
      case "studio": return { ...base, enabled: $("#toggleStudio").checked };
      default: return base;
    }
  }

  /* Real beep using WebAudio API */
  function playSfxBeep(){
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.25);
      setTimeout(() => { try { ctx.close(); } catch(_){} }, 400);
    } catch(_){}
  }

  /* Grab a real frame from the video element */
  function grabVideoFrame(video){
    try {
      const w = 640, h = 360;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch(e){ return null; }
  }

  /* Live 0 → 100 overlay */
  function showProcessingOverlay(label, asyncWork){
    const overlay = $("#processingOverlay");
    const ring = $("#procRing");
    const pctEl = $("#procPct");
    const title = $("#procTitle");
    const sub = $("#procSub");

    title.textContent = label + "…";
    sub.textContent = "Live processing — no page reload";
    overlay.classList.remove("is-hidden");

    return new Promise(resolve => {
      const start = performance.now();
      const durMs = 2200;
      let raf, finished = false;

      function frame(now){
        if (finished) return;
        const t = Math.min(1, (now - start) / durMs);
        const eased = easeOutCubic(t);
        const val = Math.round(eased * 99);
        ring.style.setProperty("--p", val);
        pctEl.textContent = val + "%";
        if (t < 1) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      (async () => {
        try { await asyncWork(); } catch(_){}
        finished = true;
        cancelAnimationFrame(raf);
        ring.style.setProperty("--p", 100);
        pctEl.textContent = "100%";
        title.textContent = label + " complete";
        sub.textContent = "Ready";
        await waitFor(420);
        overlay.classList.add("is-hidden");
        resolve();
      })();
    });
  }

  /* ══════════ EXPORT ══════════ */
  function initExport(){
    $("#btnBackToEditor").addEventListener("click", () => setStep("editor"));
    $("#qualitySelect").addEventListener("change", e => { state.export.quality = e.target.value; });
    $("#formatSelect").addEventListener("change", e => { state.export.format = e.target.value; });

    $("#btnDownload").addEventListener("click", async () => {
      if (!state.activeClip){ toast("No clip selected","err"); return; }
      const btn = $("#btnDownload");
      btn.disabled = true;
      $("#exportProgress").classList.remove("is-hidden");

      const stop = animateProgress("#exportFill","#exportPct","#exportStage", [
        "Encoding video…","Muxing audio…","Bundling thumbnail…","Finalising…"
      ], 2600);

      try {
        const res = await API.exportReel({
          clipId: state.activeClip.id,
          videoUrl: state.activeClip.videoUrl,
          thumbnailUrl: state.thumbnails[state.activeClip.id] || state.activeClip.thumbnail,
          quality: state.export.quality,
          format: state.export.format,
          aspect: state.activeClip.aspectRatio || state.config.aspect
        });
        stop(100);
        await waitFor(280);

        triggerDownload(res.downloadUrl, `clipforge-${state.activeClip.id}.${state.export.format}`);
        if (res.thumbnailUrl){
          setTimeout(() => triggerDownload(res.thumbnailUrl, `clipforge-${state.activeClip.id}-thumb.jpg`), 700);
        }
        toast("Download started","ok");
      } catch(err){
        stop(0);
        toast(err.message || "Export failed","err");
      } finally {
        btn.disabled = false;
        $("#exportProgress").classList.add("is-hidden");
        $("#exportFill").style.width = "0%";
        $("#exportPct").textContent = "0%";
      }
    });
  }

  function prepareExport(){
    if (!state.activeClip) return;
    const clip = state.activeClip;
    const video = $("#exportVideo");
    video.src = clip.videoUrl;
    video.poster = clip.thumbnail || "";

    $("#sumAspect").textContent = clip.aspectRatio || state.config.aspect;
    $("#sumDuration").textContent = formatTime(clip.duration);
    $("#sumScore").textContent = clip.viralScore + "%";

    const thumb = state.thumbnails[clip.id];
    if (thumb){
      $("#exportThumbImg").src = thumb;
      $("#exportThumbWrap").classList.remove("is-hidden");
    } else {
      $("#exportThumbWrap").classList.add("is-hidden");
    }
    $("#exportMeta").textContent = `Exporting "${clip.title}" · ${clip.viralScore}% viral score`;
  }

  function triggerDownload(url, filename){
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ══════════ RESET ══════════ */
  function initReset(){
    $("#btnReset").addEventListener("click", () => {
      state.source = null;
      state.clips = [];
      state.activeClip = null;
      state.thumbnails = {};
      state.config = { aspect:"9:16", duration:"30", customMin:0, customSec:45, reels:"3" };

      $("#youtubeUrl").value = "";
      $("#sourcePreview").classList.add("is-hidden");
      $("#configPanel").classList.add("is-hidden");
      $("#generateWrap").classList.add("is-hidden");
      $("#customDuration").classList.add("is-hidden");
      $("#clipGrid").innerHTML = "";
      $("#editorVideo").removeAttribute("src");
      $("#exportVideo").removeAttribute("src");
      $("#customFromWrap").classList.add("is-hidden");
      $("#customToWrap").classList.add("is-hidden");
      $("#langPreview").classList.add("is-hidden");
      $("#customFromInput").value = "";
      $("#customToInput").value = "";
      clearBadges();

      $$(".segmented").forEach(group => {
        const field = group.dataset.field;
        const def = field === "aspect" ? "9:16" : field === "duration" ? "30" : "3";
        $$(".seg", group).forEach(s => s.classList.toggle("is-active", s.dataset.value === def));
      });

      enableStepsFrom(0);
      setStep("input");
      toast("Project reset","info");
    });
  }

  /* ══════════ STEP NAV CLICKS ══════════ */
  function initStepNav(){
    $$(".step").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const step = btn.dataset.step;
        if (step === "editor" && !state.activeClip){ toast("Open a clip first","err"); return; }
        if (step === "export") prepareExport();
        setStep(step);
      });
    });
  }

  /* ══════════ BACKEND STATUS ══════════ */
  async function checkBackend(){
    const pill = $("#backendStatus");
    const footer = $("#footerMode");
    const label = pill.querySelector("b");
    if (API.IS_DEMO){
      pill.classList.add("is-online");
      label.textContent = "Demo mode";
      footer.textContent = "Demo Mode";
      return;
    }
    const res = await API.ping();
    if (res.ok){ pill.classList.add("is-online"); label.textContent = "Backend online"; footer.textContent = "Live Backend"; }
    else { pill.classList.add("is-offline"); label.textContent = "Backend offline"; footer.textContent = "Offline"; }
  }

  /* ══════════ UTIL ══════════ */
  function formatTime(seconds){
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const s = Math.floor(seconds);
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  }

  /* ══════════ BOOT ══════════ */
  function boot(){
    if (!window.API){ console.error("api.js missing"); return; }

    initTabs();
    initSegmented();
    initSourceInputs();
    initChangeSource();
    initGenerate();
    initBackToInput();
    initEditor();
    initCustomLanguage();   /* NEW */
    initProTools();
    initExport();
    initReset();
    initStepNav();
    checkBackend();

    document.addEventListener("keydown", e => {
      if (state.step !== "editor") return;
      if (e.target.matches("input, select, textarea")) return;
      if (e.code === "Space"){ e.preventDefault(); $("#tpPlay").click(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();
