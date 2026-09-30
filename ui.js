/* ══════════════════════════════════════════════════════════
   ClipForge AI — UI Controller
   DOM manipulation · step transitions · 0→100% animations
   ══════════════════════════════════════════════════════════ */

(function(){
  "use strict";

  /* ── State ── */
  const state = {
    step: "input",
    source: null,          // { id, type, url, title, thumbnail, duration }
    config: {
      aspect: "9:16",
      duration: "30",       // "15" | "30" | "60" | "custom"
      customMin: 0,
      customSec: 45,
      reels: "3"
    },
    clips: [],
    activeClip: null,
    export: { quality: "1080", format: "mp4" },
    thumbnails: {}          // clipId -> thumbnail url
  };

  /* ── Shorthand ── */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ══════════════════════════════════════════════════════════
     TOASTS
     ══════════════════════════════════════════════════════════ */
  function toast(message, type = "info"){
    const stack = $("#toastStack");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const ico = type === "ok" ? "✔" : type === "err" ? "✕" : "ℹ";
    el.innerHTML = `<span class="toast-ico">${ico}</span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* ══════════════════════════════════════════════════════════
     STEP / VIEW NAVIGATION
     ══════════════════════════════════════════════════════════ */
  const STEPS = ["input", "results", "editor", "export"];

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Expose for step nav buttons */
  function enableStepsFrom(index){
    STEPS.forEach((s, i) => {
      const btn = $(`.step[data-step="${s}"]`);
      if (i <= index) btn.disabled = false;
    });
  }

  /* ══════════════════════════════════════════════════════════
     TABS (Link / Upload)
     ══════════════════════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════════════════════
     SEGMENTED CONTROLS
     ══════════════════════════════════════════════════════════ */
  function initSegmented(){
    $$(".segmented").forEach(group => {
      const field = group.dataset.field;
      $$(".seg", group).forEach(seg => {
        seg.addEventListener("click", () => {
          $$(".seg", group).forEach(s => s.classList.remove("is-active"));
          seg.classList.add("is-active");
          const value = seg.dataset.value;
          state.config[field] = value;

          if (field === "duration"){
            const cd = $("#customDuration");
            if (value === "custom"){
              cd.classList.remove("is-hidden");
            } else {
              cd.classList.add("is-hidden");
            }
          }
        });
      });
    });

    /* Custom duration inputs */
    $("#customMin").addEventListener("input", e => {
      state.config.customMin = clampInt(e.target.value, 0, 59);
    });
    $("#customSec").addEventListener("input", e => {
      state.config.customSec = clampInt(e.target.value, 0, 59);
    });
  }

  function clampInt(v, min, max){
    let n = parseInt(v, 10);
    if (isNaN(n)) n = 0;
    return Math.max(min, Math.min(max, n));
  }

  function getEffectiveDuration(){
    if (state.config.duration === "custom"){
      return state.config.customMin * 60 + state.config.customSec;
    }
    return parseInt(state.config.duration, 10);
  }

  /* ══════════════════════════════════════════════════════════
     SOURCE LOADING
     ══════════════════════════════════════════════════════════ */
  function initSourceInputs(){
    /* YouTube link */
    $("#btnLoadLink").addEventListener("click", async () => {
      const url = $("#youtubeUrl").value.trim();
      if (!url){
        toast("Please paste a YouTube link", "err");
        return;
      }
      if (!/youtube\.com|youtu\.be/i.test(url)){
        toast("That doesn't look like a YouTube URL", "err");
        return;
      }
      await loadSourceFromUrl(url);
    });

    $("#youtubeUrl").addEventListener("keydown", e => {
      if (e.key === "Enter") $("#btnLoadLink").click();
    });

    /* File upload */
    const fileInput = $("#fileInput");
    const dropzone = $("#dropzone");

    fileInput.addEventListener("change", e => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
    });

    ["dragenter","dragover"].forEach(ev =>
      dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.add("is-drag");
      })
    );
    ["dragleave","drop"].forEach(ev =>
      dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.remove("is-drag");
      })
    );
    dropzone.addEventListener("drop", e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  async function loadSourceFromUrl(url){
    const btn = $("#btnLoadLink");
    btn.disabled = true;
    btn.textContent = "Loading…";
    try {
      const info = await API.fetchVideoInfo(url);
      setSource({
        id: info.id,
        type: "youtube",
        url,
        title: info.title,
        channel: info.channel,
        duration: info.duration,
        thumbnail: info.thumbnail
      });
      toast("Video loaded", "ok");
    } catch(err){
      toast(err.message || "Failed to load video", "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Load Video";
    }
  }

  async function handleFile(file){
    const dz = $("#dropzone");
    const old = dz.innerHTML;
    dz.innerHTML = `<div class="dz-icon">⏳</div><strong>Uploading ${escapeHtml(file.name)}…</strong><span>Please wait</span>`;
    try {
      const info = await API.uploadVideo(file);
      const localUrl = URL.createObjectURL(file);
      setSource({
        id: info.id || "local",
        type: "upload",
        url: localUrl,
        title: info.title || file.name,
        channel: "Local file",
        duration: info.duration || 0,
        thumbnail: info.thumbnail || ""
      });
      toast("Video ready", "ok");
    } catch(err){
      toast(err.message || "Upload failed", "err");
    } finally {
      dz.innerHTML = old;
      $("#fileInput").value = "";
    }
  }

  function setSource(source){
    state.source = source;

    /* Preview */
    const thumb = $("#previewThumb");
    if (source.thumbnail){
      thumb.src = source.thumbnail;
      thumb.style.display = "";
    } else {
      thumb.removeAttribute("src");
      thumb.style.display = "none";
    }
    $("#previewBadge").textContent = source.type === "youtube" ? "YouTube" : "Local";
    $("#previewDuration").textContent = formatTime(source.duration);
    $("#previewTitle").textContent = source.title || "Untitled";
    $("#previewSub").textContent = source.channel || "Ready to analyse";

    $("#sourcePreview").classList.remove("is-hidden");
    $("#configPanel").classList.remove("is-hidden");
    $("#generateWrap").classList.remove("is-hidden");

    /* Scroll to config */
    setTimeout(() => {
      $("#configPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  function initChangeSource(){
    $("#btnChangeSource").addEventListener("click", () => {
      $("#sourcePreview").classList.add("is-hidden");
      $("#configPanel").classList.add("is-hidden");
      $("#generateWrap").classList.add("is-hidden");
      state.source = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ══════════════════════════════════════════════════════════
     GENERATE CLIPS (0 → 100% progress)
     ══════════════════════════════════════════════════════════ */
  function initGenerate(){
    const btn = $("#btnGenerate");
    btn.addEventListener("click", async () => {
      if (!state.source){
        toast("Load a source video first", "err");
        return;
      }

      const dur = getEffectiveDuration();
      if (dur < 5 || dur > 180){
        toast("Clip duration must be between 5s and 3 minutes", "err");
        return;
      }

      const payload = {
        sourceId: state.source.id,
        sourceUrl: state.source.url,
        aspect: state.config.aspect,
        duration: state.config.duration,
        customDuration: dur,
        reels: state.config.reels
      };

      btn.disabled = true;
      btn.querySelector(".gen-label").textContent = "Generating…";
      $("#genProgress").classList.remove("is-hidden");

      const stop = animateProgress("#genFill", "#genPct", "#genStage", [
        "Analysing audio…",
        "Detecting hooks…",
        "Scoring virality…",
        "Cutting clips…",
        "Reframing for " + state.config.aspect + "…"
      ], 3200);

      try {
        const res = await API.generateClips(payload);
        stop(100);
        await waitFor(320);

        state.clips = (res.clips || []).map((c, i) => ({ ...c, index: i }));
        renderClipGallery();

        enableStepsFrom(STEPS.indexOf("results"));
        setStep("results");
        toast(`Generated ${state.clips.length} clip${state.clips.length === 1 ? "" : "s"}`, "ok");
      } catch(err){
        stop(0);
        toast(err.message || "Generation failed", "err");
      } finally {
        btn.disabled = false;
        btn.querySelector(".gen-label").textContent = "✨ Generate Clips";
        $("#genProgress").classList.add("is-hidden");
        $("#genFill").style.width = "0%";
        $("#genPct").textContent = "0%";
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     ANIMATION HELPERS
     ══════════════════════════════════════════════════════════ */
  function animateProgress(fillSel, pctSel, stageSel, stages, durationMs){
    const fill = $(fillSel);
    const pct  = $(pctSel);
    const stage = $(stageSel);
    const start = performance.now();
    let raf;
    let cancelled = false;

    function frame(now){
      if (cancelled) return;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      const val = Math.round(eased * 96); // hold under 100 until done
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

  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  function waitFor(ms){ return new Promise(r => setTimeout(r, ms)); }

  /* ══════════════════════════════════════════════════════════
     CLIP GALLERY
     ══════════════════════════════════════════════════════════ */
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
          <span class="clip-rank-badge">#${i + 1}</span>
          <div class="viral-ring" style="--score:${clip.viralScore}">
            <b>${clip.viralScore}%</b>
            <small>🔥 Viral</small>
          </div>
          <video src="${clip.videoUrl}" muted playsinline preload="metadata"
                 poster="${clip.thumbnail || ""}"></video>
          <span class="clip-duration-badge">${formatTime(clip.duration)}</span>
        </div>
        <div class="clip-info">
          <h4>${escapeHtml(clip.title)}</h4>
          <div class="clip-tags">
            ${(clip.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join("")}
          </div>
          <div class="clip-actions">
            <button class="btn btn-ghost btn-sm" data-action="preview">▶ Preview</button>
            <button class="btn btn-primary btn-sm" data-action="edit">✎ Edit in Pro</button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    /* Event delegation */
    grid.onclick = e => {
      const card = e.target.closest(".clip-card");
      if (!card) return;
      const clip = state.clips.find(c => c.id === card.dataset.clipId);
      if (!clip) return;

      const action = e.target.closest("[data-action]");
      if (!action) return;

      if (action.dataset.action === "edit"){
        openEditor(clip);
      } else if (action.dataset.action === "preview"){
        const video = card.querySelector("video");
        if (video.paused){ video.play(); action.textContent = "❚❚ Pause"; }
        else { video.pause(); action.textContent = "▶ Preview"; }
      }
    };
  }

  function initBackToInput(){
    $("#btnBackToInput").addEventListener("click", () => setStep("input"));
  }

  /* ══════════════════════════════════════════════════════════
     PRO EDITOR
     ══════════════════════════════════════════════════════════ */
  function initEditor(){
    const video = $("#editorVideo");
    const playBtn = $("#tpPlay");
    const muteBtn = $("#tpMute");
    const track = $("#tpTrack");
    const fill = $("#tpFill");
    const cur = $("#tpCurrent");
    const total = $("#tpTotal");

    /* Play / Pause */
    playBtn.addEventListener("click", () => {
      if (video.paused){ video.play(); playBtn.textContent = "❚❚"; }
      else { video.pause(); playBtn.textContent = "▶"; }
    });

    /* Mute */
    muteBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? "🔇" : "🔊";
    });

    /* Progress */
    video.addEventListener("timeupdate", () => {
      const t = video.currentTime || 0;
      const d = video.duration || 0;
      cur.textContent = formatTime(t);
      total.textContent = formatTime(d || getEffectiveDuration());
      const pct = d ? (t / d) * 100 : 0;
      fill.style.width = pct + "%";
      const ph = $("#tlPlayhead");
      if (ph) ph.style.left = pct + "%";
    });

    /* Seek */
    track.addEventListener("click", e => {
      const rect = track.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (video.duration) video.currentTime = pct * video.duration;
    });

    /* Timeline ruler seek */
    $("#tlRuler").addEventListener("click", e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (video.duration) video.currentTime = pct * video.duration;
    });

    /* Editor navigation */
    $("#btnGoExport").addEventListener("click", () => {
      prepareExport();
      enableStepsFrom(STEPS.indexOf("export"));
      setStep("export");
    });
  }

  function openEditor(clip){
    state.activeClip = clip;
    $("#editorClipLabel").textContent = `Clip #${clip.index + 1}`;
    $("#editorVideo").src = clip.videoUrl;
    $("#editorVideo").load();
    $("#editorVideo").muted = false;

    buildTimeline(clip);
    applyAspect(clip.aspectRatio || state.config.aspect);

    /* Reset caption layer */
    $("#captionLayer").classList.add("is-hidden");
    $("#toggleCaptions").checked = false;
    $("#toggleStudio").checked = false;
    $("#thumbResult").classList.add("is-hidden");

    enableStepsFrom(STEPS.indexOf("editor"));
    setStep("editor");
    toast(`Editing clip #${clip.index + 1}`, "info");
  }

  function applyAspect(aspect){
    const map = { "9:16": "9/16", "1:1": "1/1", "16:9": "16/9" };
    const frame = $("#playerFrame");
    frame.style.aspectRatio = map[aspect] || "9/16";
    frame.style.maxHeight = "60vh";
    frame.style.margin = "0 auto";
    frame.style.width = "100%";
  }

  /* ══════════════════════════════════════════════════════════
     TIMELINE
     ══════════════════════════════════════════════════════════ */
  function buildTimeline(clip){
    const labels = $("#tlLabels");
    const laneGroup = $("#tlLaneGroup");
    const ruler = $("#tlRuler");

    /* Labels */
    const lanes = [
      { id: "video",   name: "V1" },
      { id: "audio",   name: "A1" },
      { id: "caption", name: "C1" },
      { id: "effect",  name: "FX" }
    ];
    labels.innerHTML = `<div style="height:22px;border-bottom:1px solid var(--line)"></div>` +
      lanes.map(l => `<div class="tl-label">${l.name}</div>`).join("");

    /* Ruler ticks */
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

    /* Lanes */
    laneGroup.innerHTML = lanes.map(l => `<div class="tl-lane" data-lane="${l.id}"></div>`).join("");

    const videoLane = laneGroup.querySelector('[data-lane="video"]');
    const audioLane = laneGroup.querySelector('[data-lane="audio"]');
    const captionLane = laneGroup.querySelector('[data-lane="caption"]');
    const effectLane = laneGroup.querySelector('[data-lane="effect"]');

    videoLane.innerHTML = `<div class="tl-clip video" style="left:0;width:100%">${escapeHtml(clip.title.slice(0, 40))}</div>`;
    audioLane.innerHTML  = `<div class="tl-clip audio" style="left:0;width:100%">Audio</div>`;

    /* Captions & effects start hidden — toggled by tools */
    captionLane.innerHTML = "";
    effectLane.innerHTML  = "";
  }

  function addTimelineBlock(laneId, label, className){
    const lane = $(`[data-lane="${laneId}"]`);
    if (!lane) return;
    const block = document.createElement("div");
    block.className = `tl-clip ${className}`;
    block.style.left = "0";
    block.style.width = "100%";
    block.textContent = label;
    lane.innerHTML = "";
    lane.appendChild(block);
  }

  function removeTimelineBlock(laneId){
    const lane = $(`[data-lane="${laneId}"]`);
    if (lane) lane.innerHTML = "";
  }

  /* ══════════════════════════════════════════════════════════
     PRO TOOLS + PROCESSING OVERLAY (0 → 100%)
     ══════════════════════════════════════════════════════════ */
  function initProTools(){
    /* Buttons */
    $$("[data-tool]").forEach(el => {
      if (el.tagName === "BUTTON"){
        el.addEventListener("click", () => runTool(el.dataset.tool, el.dataset.label));
      } else if (el.type === "checkbox"){
        el.addEventListener("change", () => {
          const label = el.dataset.tool === "captions" ? "Hormozi captions" : "Studio Sound";
          const enabled = el.checked;
          runTool(el.dataset.tool, enabled ? `Enabling ${label}` : `Disabling ${label}`, !enabled);
        });
      }
    });
  }

  async function runTool(tool, label, isUndo){
    if (!state.activeClip){
      toast("Open a clip in the editor first", "err");
      return;
    }

    /* Update UI immediately for toggles */
    if (tool === "captions"){
      $("#captionLayer").classList.toggle("is-hidden", isUndo);
      if (isUndo) removeTimelineBlock("caption");
      else addTimelineBlock("caption", "3D Captions", "caption");
    }
    if (tool === "studio"){
      if (isUndo) removeTimelineBlock("effect");
      else addTimelineBlock("effect", "Studio Sound", "effect");
    }
    if (tool === "broll") addTimelineBlock("effect", "B-Roll", "effect");
    if (tool === "sfx")   addTimelineBlock("effect", "Meme SFX", "effect");
    if (tool === "voice") addTimelineBlock("audio", "Voice FX", "audio");
    if (tool === "dub")   addTimelineBlock("audio", "Dubbed", "audio");

    /* Show live overlay */
    await showProcessingOverlay(label, async () => {
      const params = collectToolParams(tool);
      return API.processTool(tool, params);
    });

    /* Handle thumbnail result */
    if (tool === "thumbnail"){
      const url = `https://picsum.photos/seed/thumb-${Date.now()}/640/360`;
      state.thumbnails[state.activeClip.id] = url;
      const wrap = $("#thumbResult");
      $("#thumbResultImg").src = url;
      wrap.classList.remove("is-hidden");
      toast("Thumbnail generated", "ok");
    } else if (!isUndo){
      toast(`${label} — applied`, "ok");
    }
  }

  function collectToolParams(tool){
    const base = { clipId: state.activeClip && state.activeClip.id };
    switch(tool){
      case "dub":
        return { ...base, from: $("#dubFrom").value, to: $("#dubTo").value };
      case "voice":
        return { ...base, style: $("#voiceStyle").value };
      case "captions":
        return { ...base, enabled: $("#toggleCaptions").checked };
      case "studio":
        return { ...base, enabled: $("#toggleStudio").checked };
      default:
        return base;
    }
  }

  /* Live 0 → 100% processing overlay on the player */
  function showProcessingOverlay(label, asyncWork){
    const overlay = $("#processingOverlay");
    const ring = $("#procRing");
    const pctEl = $("#procPct");
    const title = $("#procTitle");
    const sub = $("#procSub");

    title.textContent = label + "…";
    sub.textContent = "Live AI processing — no page reload";
    overlay.classList.remove("is-hidden");

    return new Promise(resolve => {
      const start = performance.now();
      const duration = 2400;
      let raf;
      let finished = false;

      function frame(now){
        if (finished) return;
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        const val = Math.round(eased * 99);
        ring.style.setProperty("--p", val);
        pctEl.textContent = val + "%";
        if (t < 1) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      (async () => {
        try { await asyncWork(); }
        catch(_){ /* swallow in demo */ }

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

  /* ══════════════════════════════════════════════════════════
     EXPORT
     ══════════════════════════════════════════════════════════ */
  function initExport(){
    $("#btnBackToEditor").addEventListener("click", () => setStep("editor"));

    $("#qualitySelect").addEventListener("change", e => {
      state.export.quality = e.target.value;
    });
    $("#formatSelect").addEventListener("change", e => {
      state.export.format = e.target.value;
    });

    $("#btnDownload").addEventListener("click", async () => {
      if (!state.activeClip){
        toast("No clip selected", "err");
        return;
      }
      const btn = $("#btnDownload");
      btn.disabled = true;
      $("#exportProgress").classList.remove("is-hidden");

      const stop = animateProgress("#exportFill", "#exportPct", "#exportStage", [
        "Encoding video…",
        "Muxing audio…",
        "Bundling thumbnail…",
        "Finalising…"
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

        /* Trigger download */
        triggerDownload(res.downloadUrl, `clipforge-${state.activeClip.id}.${state.export.format}`);
        if (res.thumbnailUrl) {
          setTimeout(() => triggerDownload(res.thumbnailUrl, `clipforge-${state.activeClip.id}-thumb.jpg`), 700);
        }

        toast("Download started", "ok");
      } catch(err){
        stop(0);
        toast(err.message || "Export failed", "err");
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
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ══════════════════════════════════════════════════════════
     RESET
     ══════════════════════════════════════════════════════════ */
  function initReset(){
    $("#btnReset").addEventListener("click", () => {
      state.source = null;
      state.clips = [];
      state.activeClip = null;
      state.thumbnails = {};
      state.config = {
        aspect: "9:16",
        duration: "30",
        customMin: 0,
        customSec: 45,
        reels: "3"
      };

      /* Reset UI */
      $("#youtubeUrl").value = "";
      $("#sourcePreview").classList.add("is-hidden");
      $("#configPanel").classList.add("is-hidden");
      $("#generateWrap").classList.add("is-hidden");
      $("#customDuration").classList.add("is-hidden");
      $("#clipGrid").innerHTML = "";
      $("#editorVideo").removeAttribute("src");
      $("#exportVideo").removeAttribute("src");

      /* Reset segmented selections to defaults */
      $$(".segmented").forEach(group => {
        const field = group.dataset.field;
        const def = field === "aspect" ? "9:16" : field === "duration" ? "30" : "3";
        $$(".seg", group).forEach(s => {
          s.classList.toggle("is-active", s.dataset.value === def);
        });
      });

      enableStepsFrom(0);
      setStep("input");
      toast("Project reset", "info");
    });
  }

  /* ══════════════════════════════════════════════════════════
     STEP NAV CLICKS
     ══════════════════════════════════════════════════════════ */
  function initStepNav(){
    $$(".step").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const step = btn.dataset.step;
        if (step === "editor" && !state.activeClip){
          toast("Open a clip in the editor first", "err");
          return;
        }
        if (step === "export") prepareExport();
        setStep(step);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     BACKEND STATUS
     ══════════════════════════════════════════════════════════ */
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
    if (res.ok){
      pill.classList.add("is-online");
      label.textContent = "Backend online";
      footer.textContent = "Live Backend";
    } else {
      pill.classList.add("is-offline");
      label.textContent = "Backend offline";
      footer.textContent = "Offline";
    }
  }

  /* ══════════════════════════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════════════════════════ */
  function formatTime(seconds){
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  }

  /* ══════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════ */
  function boot(){
    /* Guard against missing API */
    if (!window.API){
      console.error("api.js failed to load — API object missing");
      return;
    }

    initTabs();
    initSegmented();
    initSourceInputs();
    initChangeSource();
    initGenerate();
    initBackToInput();
    initEditor();
    initProTools();
    initExport();
    initReset();
    initStepNav();

    checkBackend();

    /* Keyboard shortcut: space to play/pause in editor */
    document.addEventListener("keydown", e => {
      if (state.step !== "editor") return;
      if (e.target.matches("input, select, textarea")) return;
      if (e.code === "Space"){
        e.preventDefault();
        $("#tpPlay").click();
      }
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
