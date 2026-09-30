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
  const cast = plan.characters.filter((character) => scene.characters.includes(character.id));
  const anchors = cast.map(characterAnchor).join("; ");
  const atmosphere = scene.atmosphere.map((fx) => ATMOSPHERE_PROMPT[fx]).join(", ");
  const parts = [
    STYLE_PROMPT[style],
    scene.visual,
    anchors && `Characters: ${anchors}`,
    `Motion: ${scene.animation}`,
    `Camera: ${CAMERA_PROMPT[scene.camera]}${scene.cameraNote ? ` (${scene.cameraNote})` : ""}`,
    atmosphere && `Atmosphere: ${atmosphere}`,
    `Look: ${niche.visualKeywords}`,
    "vertical 9:16 composition, subject centered for mobile, fluid natural motion, no on-screen text",
    kidsSafe ? "gentle, preschool-safe, non-scary, soft colors" : niche.id === "horror" ? "atmospheric suspense, implied threat, no gore" : "",
  ].filter(Boolean);
  const keyframeParts = [STYLE_PROMPT[style], scene.visual, anchors && `Characters: ${anchors}`, atmosphere, niche.visualKeywords, "vertical 9:16 frame, cinematic composition, no text, no watermark"].filter(Boolean);
  const seed = cast[0]?.referenceSeed ?? (plan.title.length * 7919 + scene.index * 104729) % 2_000_000_000;
  return { prompt: parts.join(". ").slice(0, 1400), negativePrompt: NEGATIVE, keyframePrompt: keyframeParts.join(". ").slice(0, 1200), seed };
}
