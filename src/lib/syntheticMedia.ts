// Generates a genuine but synthetic broadcast feed entirely in the browser —
// an animated canvas captured as a real video track, plus a soft tone
// captured as a real audio track — so a visitor can see Patchbay actually
// work without OBS, ffmpeg, or a server-side encoder. Used by the "Simulate
// a live broadcast" button (see DemoBroadcaster.tsx).
export type SyntheticMedia = {
  videoTrack: MediaStreamTrack;
  audioTrack: MediaStreamTrack;
  stop: () => void;
};

const WIDTH = 1280;
const HEIGHT = 720;
const HUE_DEGREES_PER_SECOND = 24;

function draw(ctx: CanvasRenderingContext2D, label: string, startedAt: number): void {
  const elapsed = (performance.now() - startedAt) / 1000;
  const hue = (elapsed * HUE_DEGREES_PER_SECOND) % 360;

  ctx.fillStyle = `hsl(${hue}, 70%, 16%)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A moving bar so the frame is visibly never static, even to someone
  // glancing at a still screenshot.
  const barX = (Math.sin(elapsed) * 0.5 + 0.5) * WIDTH;
  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 55%)`;
  ctx.fillRect(barX - 4, 0, 8, HEIGHT);

  ctx.fillStyle = "#f4ede1";
  ctx.font = "bold 64px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, WIDTH / 2, HEIGHT / 2 - 16);

  ctx.fillStyle = "#a89a86";
  ctx.font = "28px ui-monospace, monospace";
  ctx.fillText(new Date().toLocaleTimeString(), WIDTH / 2, HEIGHT / 2 + 44);
}

export function createSyntheticMedia(label: string): SyntheticMedia {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const startedAt = performance.now();
  let frameId = 0;
  const loop = () => {
    draw(ctx, label, startedAt);
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);

  const videoTrack = canvas.captureStream(30).getVideoTracks()[0];

  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  oscillator.frequency.value = 220;
  const gain = audioContext.createGain();
  gain.gain.value = 0.05;
  const destination = audioContext.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  const audioTrack = destination.stream.getAudioTracks()[0];

  return {
    videoTrack,
    audioTrack,
    stop: () => {
      cancelAnimationFrame(frameId);
      videoTrack.stop();
      oscillator.stop();
      void audioContext.close();
    },
  };
}
