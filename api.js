/* ══════════════════════════════════════════════════════════
   ClipForge AI — API Layer
   ══════════════════════════════════════════════════════════ */

const BACKEND_URL = "https://video-editer-backend.onrender.com";
const IS_DEMO = BACKEND_URL.includes("YOUR_RENDER_URL_HERE");

const DEMO_VIDEOS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4"
];

const DEMO_TITLES = [
  "The Mindset Shift That Changes Everything",
  "Why Most People Never Start (And How To Fix It)",
  "This 30-Second Rule Builds Unstoppable Focus",
  "The One Question That Unlocks Your Best Self",
  "How To Turn Fear Into Your Superpower"
];

function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
function randomBetween(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function makeId(){ return "clip_" + Math.random().toString(36).slice(2, 9); }

async function request(path, options = {}){
  if (IS_DEMO) throw new Error("DEMO_MODE");
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!res.ok){
    let msg = `Request failed (${res.status})`;
    try { const data = await res.json(); if (data && data.error) msg = data.error; } catch(_){}
    throw new Error(msg);
  }
  return res.json();
}

const API = {
  BACKEND_URL,
  IS_DEMO,

  async ping(){
    if (IS_DEMO){ await delay(300); return { ok: true, mode: "demo" }; }
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
      return { ok: res.ok, mode: "live" };
    } catch(_){ return { ok: false, mode: "offline" }; }
  },

  async fetchVideoInfo(url){
    if (IS_DEMO){
      await delay(800);
      return {
        id: makeId(), type: "youtube", url,
        title: "Joe Rogan — The Art of Focus (Full Episode)",
        channel: "Mindset Lab",
        duration: 7320,
        thumbnail: "https://picsum.photos/seed/clipforge-source/640/360"
      };
    }
    return request("/api/video/info", { method: "POST", body: JSON.stringify({ url }) });
  },

  async uploadVideo(file){
    if (IS_DEMO){
      await delay(1000);
      return {
        id: makeId(), type: "upload",
        title: file.name.replace(/\.[^.]+$/, ""),
        channel: "Local upload",
        duration: 0,
        thumbnail: "https://picsum.photos/seed/clipforge-local/640/360"
      };
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BACKEND_URL}/api/video/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  async generateClips(payload){
    if (IS_DEMO){
      await delay(1400);
      const count = payload.reels === "auto" ? randomBetween(3, 5) : Number(payload.reels);
      const duration = payload.duration === "custom" ? payload.customDuration : Number(payload.duration);
      return {
        clips: Array.from({ length: count }, (_, i) => ({
          id: makeId(),
          index: i,
          title: DEMO_TITLES[i % DEMO_TITLES.length],
          duration,
          viralScore: randomBetween(78, 98),
          aspectRatio: payload.aspect,
          videoUrl: DEMO_VIDEOS[i % DEMO_VIDEOS.length],
          thumbnail: `https://picsum.photos/seed/clipforge-${i}/640/360`,
          tags: ["Hook","Story","Insight"].slice(0, randomBetween(2,3))
        }))
      };
    }
    return request("/api/clips/generate", { method: "POST", body: JSON.stringify(payload) });
  },

  async processTool(tool, params){
    if (IS_DEMO){
      await delay(400);
      const out = { tool, ok: true, params };
      if (tool === "voice"){
        const map = { "Robotic":1.0, "Deep Bass":0.78, "Chipmunk":1.55, "Echo Chamber":1.0, "Narrator":0.92, "Villain":0.72, "Normal":1.0 };
        out.playbackRate = map[params.style] || 1.0;
      }
      return out;
    }
    return request("/api/tools/process", { method: "POST", body: JSON.stringify({ tool, params }) });
  },

  async exportReel(params){
    if (IS_DEMO){
      await delay(1500);
      return {
        ok: true,
        downloadUrl: params.videoUrl,
        thumbnailUrl: params.thumbnailUrl || null,
        quality: params.quality,
        format: params.format
      };
    }
    return request("/api/export", { method: "POST", body: JSON.stringify(params) });
  }
};

window.API = API;
