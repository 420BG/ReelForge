import { getNiche } from "@/content/niches/registry";
import type { CharacterProfile, PlanScene, StoryPlan, VisualStyle } from "@/content/types";
import { ATMOSPHERE_PROMPT, CAMERA_PROMPT, STYLE_PROMPT } from "@/video/animation";

/**
 * Storyboard: turns a StoryPlan scene into the exact prompts sent to providers.
 * Character "anchors" (the same appearance text in every shot) are the main tool
 * for consistency with text-to-video models; keyframes + seeds add to it where supported.
 */

export function characterAnchor(character: CharacterProfile) {
  return [
    `${character.name} (${character.ageRange})`,
    character.appearance,
    character.hair && `hair: ${character.hair}`,
    character.face && `face: ${character.face}`,
    character.clothing && `wearing ${character.clothing}`,
  ].filter(Boolean).join(", ");
}

const NEGATIVE = "text, captions, subtitles, watermark, logo, signature, extra limbs, deformed hands, distorted face, blurry, low quality, gore";

export type ScenePrompt = { prompt: string; negativePrompt: string; keyframePrompt: string; seed: number };

export function scenePrompt(plan: StoryPlan, scene: PlanScene, style: VisualStyle, kidsSafe: boolean): ScenePrompt {
  const niche = getNiche(plan.niche);
  const landscape = plan.format === "long";
  const cast = plan.characters.filter((character) => scene.characters.includes(character.id));
  const anchors = cast.map(characterAnchor).join("; ");
  const location = plan.locations?.find((item) => item.id === scene.location);
  const place = location ? `Location: ${location.name} — ${location.description}` : plan.setting ? `Setting: ${plan.setting}` : "";
  const atmosphere = scene.atmosphere.map((fx) => ATMOSPHERE_PROMPT[fx]).join(", ");
  const frame = landscape ? "wide 16:9 cinematic frame" : "vertical 9:16 composition, subject centered for mobile";
  const safety = kidsSafe ? "gentle, preschool-safe, non-scary, soft colors" : niche.id === "horror" ? "atmospheric suspense, implied threat, no gore" : "";
  const parts = [
    STYLE_PROMPT[style],
    plan.visualBible,
    scene.visual,
    anchors && `Characters: ${anchors}`,
    place,
    `Motion: ${scene.animation}`,
    `Camera: ${CAMERA_PROMPT[scene.camera]}${scene.cameraNote ? ` (${scene.cameraNote})` : ""}`,
    atmosphere && `Atmosphere: ${atmosphere}`,
    `Look: ${niche.visualKeywords}`,
    `${frame}, fluid natural motion, no on-screen text`,
    safety,
  ].filter(Boolean);
  // The still image is the base of every scene (and the first frame for image-to-video), so the
  // same style bible, character anchors and location text go into every one of them.
  const keyframeParts = [STYLE_PROMPT[style], plan.visualBible, scene.visual, anchors && `Characters: ${anchors}`, place, atmosphere, niche.visualKeywords, `${frame}, highly detailed, no text, no watermark`, safety].filter(Boolean);
  const seed = cast[0]?.referenceSeed ?? (plan.title.length * 7919 + scene.index * 104729) % 2_000_000_000;
  return { prompt: parts.join(". ").slice(0, 1400), negativePrompt: NEGATIVE, keyframePrompt: keyframeParts.join(". ").slice(0, 1400), seed };
}
