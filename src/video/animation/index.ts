import type { NicheDefinition } from "@/content/niches/registry";
import type { AtmosphereFx, CameraMove, TransitionKind, VisualStyle } from "@/content/types";

/** Camera language sent to video models. */
export const CAMERA_PROMPT: Record<CameraMove, string> = {
  static: "locked-off static shot with subtle natural motion in the scene",
  "slow-push-in": "slow cinematic dolly push-in toward the subject",
  "pull-out": "slow dolly pull-back revealing the wider scene",
  "pan-left": "smooth camera pan to the left",
  "pan-right": "smooth camera pan to the right",
  "tilt-up": "slow camera tilt upward",
  "tilt-down": "slow camera tilt downward",
  tracking: "tracking shot following the subject as it moves",
  "dolly-zoom": "dramatic dolly-zoom (vertigo effect) on the subject",
  orbit: "slow orbiting camera arc around the subject",
  handheld: "tense handheld camera with slight shake",
  "crane-up": "rising crane shot lifting above the scene",
};

export const ATMOSPHERE_PROMPT: Record<AtmosphereFx, string> = {
  rain: "falling rain with streaks and splashes",
  fog: "drifting volumetric fog",
  smoke: "curling smoke",
  fire: "flickering firelight and flames",
  lightning: "lightning flashes illuminating the scene",
  snow: "gently falling snow",
  dust: "dust motes floating in light beams",
  particles: "floating glowing particles",
  flicker: "flickering unstable lights",
  shadows: "long moving shadows",
};

export const STYLE_PROMPT: Record<VisualStyle, string> = {
  cinematic: "cinematic film still come to life, anamorphic look, shallow depth of field, rich color grading",
  "dark-cinematic": "dark moody cinematic horror film look, low-key lighting, heavy shadows, desaturated cold tones",
  "animation-3d": "high-end 3D animated film style, expressive stylized characters, soft global illumination",
  anime: "cinematic anime style, detailed backgrounds, dramatic lighting",
  realistic: "photorealistic documentary cinematography, natural lighting",
  storybook: "soft pastel storybook 3D animation, rounded friendly shapes, warm light",
};

/** xfade transition names in ffmpeg. */
export const XFADE: Record<TransitionKind, { name: string; seconds: number }> = {
  cut: { name: "fade", seconds: 0.06 },
  fade: { name: "fade", seconds: 0.45 },
  fadeblack: { name: "fadeblack", seconds: 0.6 },
  dissolve: { name: "dissolve", seconds: 0.5 },
  slideleft: { name: "slideleft", seconds: 0.35 },
  slideup: { name: "slideup", seconds: 0.35 },
  circleopen: { name: "circleopen", seconds: 0.5 },
  wipeleft: { name: "wipeleft", seconds: 0.35 },
  zoomin: { name: "zoomin", seconds: 0.4 },
};

/** Color grade applied on top of every clip so scenes from different generations match. */
export function gradeFilter(grade: NicheDefinition["colorGrade"]) {
  switch (grade) {
    case "horror": return "eq=contrast=1.12:saturation=0.72:brightness=-0.035,colorbalance=bs=0.07:bm=0.04:rs=-0.04,vignette=PI/4.2,noise=alls=9:allf=t";
    case "romance": return "eq=saturation=1.06:contrast=1.03,colorbalance=rs=0.05:rm=0.03:bs=-0.03,vignette=PI/6";
    case "mystery": return "eq=saturation=0.85:contrast=1.08,colorbalance=bs=0.05:rh=0.04,vignette=PI/5,noise=alls=5:allf=t";
    case "punchy": return "eq=contrast=1.15:saturation=1.1,vignette=PI/5";
    case "clean-cool": return "eq=contrast=1.04:saturation=1.02,colorbalance=bs=0.03";
    case "vintage": return "eq=saturation=0.78:contrast=1.05,colorbalance=rs=0.06:gs=0.02:bs=-0.06,vignette=PI/5,noise=alls=6:allf=t";
    case "vivid": return "eq=saturation=1.14:contrast=1.04";
    default: return "null";
  }
}

/** Frame-level effects that are cheap to add in post (both modes). */
export function atmospherePostFilter(fx: AtmosphereFx[]) {
  const filters: string[] = [];
  if (fx.includes("flicker")) filters.push("eq=brightness='-0.06*gt(sin(t*3.1)*sin(t*7.7),0.55)+0.02*sin(t*41)':eval=frame");
  if (fx.includes("lightning")) filters.push("eq=brightness='0.42*between(mod(t,4.7),0.1,0.16)+0.25*between(mod(t,4.7),0.26,0.3)':eval=frame");
  return filters.join(",");
}

/**
 * IMAGE MODE only: turns a still keyframe into camera motion with zoompan.
 * This is clearly labelled "IMAGE MODE" in the UI and never reported as AI video.
 */
export function zoompanFor(camera: CameraMove, frames: number) {
  const n = Math.max(1, frames);
  const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  switch (camera) {
    case "slow-push-in": case "tracking": return `zoompan=z='1+0.16*on/${n}':${center}`;
    case "pull-out": case "crane-up": return `zoompan=z='1.18-0.16*on/${n}':${center}`;
    case "dolly-zoom": return `zoompan=z='1+0.28*pow(on/${n},2)':${center}`;
    case "pan-left": return `zoompan=z='1.15':x='(iw-iw/zoom)*(1-on/${n})':y='ih/2-(ih/zoom/2)'`;
    case "pan-right": case "orbit": return `zoompan=z='1.15':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`;
    case "tilt-up": return `zoompan=z='1.15':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${n})'`;
    case "tilt-down": return `zoompan=z='1.15':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${n}'`;
    case "handheld": return `zoompan=z='1.1':x='iw/2-(iw/zoom/2)+10*sin(on/6)':y='ih/2-(ih/zoom/2)+8*sin(on/9)'`;
    default: return `zoompan=z='1.04+0.03*on/${n}':${center}`;
  }
}
