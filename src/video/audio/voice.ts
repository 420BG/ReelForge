import { writeFile } from "node:fs/promises";
import type { VoiceId } from "@/lib/generator";
import { narrate } from "@/lib/pipeline/tts";
import type { NicheDefinition } from "@/content/niches/registry";
import type { VideoSettings, VoiceStyle } from "@/content/types";
import { probe, runFfmpeg } from "@/video/composition/ffmpeg";
import { httpRetryable, ProviderError } from "@/video/providers/types";

/**
 * Narration for the agent. Uses the SAME providers and env vars as the existing
 * /api/voice route (Pollinations Kokoro, ElevenLabs); that route is not modified.
 */

const KOKORO: Record<VoiceStyle, { female: string; male: string }> = {
  horror: { female: "af_nicole", male: "am_onyx" },
  storytelling: { female: "af_heart", male: "bm_george" },
  calm: { female: "af_sky", male: "am_adam" },
  excited: { female: "af_bella", male: "am_puck" },
  documentary: { female: "bf_emma", male: "bm_daniel" },
  warm: { female: "af_heart", male: "am_michael" },
};
const KOKORO_FALLBACK = "af_heart";

const ELEVEN_SETTINGS: Record<VoiceStyle, { stability: number; similarity_boost: number; style: number }> = {
  horror: { stability: 0.32, similarity_boost: 0.78, style: 0.45 },
  storytelling: { stability: 0.45, similarity_boost: 0.75, style: 0.3 },
  calm: { stability: 0.62, similarity_boost: 0.75, style: 0.1 },
  excited: { stability: 0.3, similarity_boost: 0.75, style: 0.6 },
  documentary: { stability: 0.55, similarity_boost: 0.75, style: 0.18 },
  warm: { stability: 0.5, similarity_boost: 0.8, style: 0.3 },
};

/** ReelForge's free, key-less narrators (StreamElements Polly relay → Google TTS fallback). */
const FREE_VOICES: Record<VoiceStyle, { female: VoiceId; male: VoiceId }> = {
  horror: { female: "lyra", male: "atlas" },
  storytelling: { female: "lyra", male: "atlas" },
  calm: { female: "sage", male: "orion" },
  excited: { female: "nova", male: "orion" },
  documentary: { female: "sage", male: "atlas" },
  warm: { female: "lyra", male: "orion" },
};
const FREE_IDS = ["nova", "atlas", "orion", "lyra", "sage"];

export type VoicePlan = { provider: "free" | "pollinations" | "elevenlabs"; voiceId: string; style: VoiceStyle; gender: "female" | "male"; pace: number };

export function voiceProviderAvailable(settings: VideoSettings): "free" | "pollinations" | "elevenlabs" | null {
  if (settings.voiceProvider === "none") return null;
  if (settings.voiceProvider === "free") return "free";
  if (settings.voiceProvider === "elevenlabs") return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : null;
  if (settings.voiceProvider === "pollinations") return process.env.POLLINATIONS_API_KEY ? "pollinations" : null;
  if (process.env.ELEVENLABS_API_KEY && settings.voiceId && !/^[a-z]{2}_[a-z]+$/.test(settings.voiceId)) return "elevenlabs";
  if (process.env.POLLINATIONS_API_KEY) return "pollinations";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  return "free";
}

let elevenCache: { at: number; voices: { id: string; gender: string }[] } | null = null;

async function elevenVoiceFor(gender: "female" | "male") {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ProviderError("ELEVENLABS_API_KEY missing.", false);
  if (!elevenCache || Date.now() - elevenCache.at > 3_600_000) {
    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&voice_type=default", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!response.ok) throw new ProviderError(`ElevenLabs voices ${response.status}`, httpRetryable(response.status), response.status);
    const data = await response.json();
    elevenCache = { at: Date.now(), voices: (Array.isArray(data.voices) ? data.voices : []).map((voice: { voice_id: string; labels?: { gender?: string } }) => ({ id: voice.voice_id, gender: voice.labels?.gender ?? "" })) };
  }
  const match = elevenCache.voices.find((voice) => voice.gender === gender) ?? elevenCache.voices[0];
  if (!match) throw new ProviderError("No ElevenLabs voices available on this account.", false);
  return match.id;
}

export async function planVoice(settings: VideoSettings, niche: NicheDefinition): Promise<VoicePlan | null> {
  const provider = voiceProviderAvailable(settings);
  if (!provider) return null;
  const gender = settings.voiceGender === "auto" ? niche.voice.gender : settings.voiceGender;
  const style = niche.voice.style;
  if (provider === "free") {
    const voiceId = settings.voiceId && FREE_IDS.includes(settings.voiceId) ? settings.voiceId : FREE_VOICES[style][gender];
    return { provider, voiceId, style, gender, pace: niche.voice.pace };
  }
  if (provider === "pollinations") {
    const voiceId = settings.voiceId && /^[a-z]{2}_[a-z]+$/.test(settings.voiceId) ? settings.voiceId : KOKORO[style][gender];
    return { provider, voiceId, style, gender, pace: niche.voice.pace };
  }
  const voiceId = settings.voiceId && /^[a-zA-Z0-9_-]{8,80}$/.test(settings.voiceId) && !/^[a-z]{2}_[a-z]+$/.test(settings.voiceId) ? settings.voiceId : await elevenVoiceFor(gender);
  return { provider, voiceId, style, gender, pace: niche.voice.pace };
}

async function fetchVoice(plan: VoicePlan, text: string, voiceId: string, workFile: string): Promise<Buffer> {
  if (plan.provider === "free") {
    const { readFile } = await import("node:fs/promises");
    const result = await narrate(text, voiceId as VoiceId, workFile);
    if (!result.provider) throw new ProviderError("Free narration relays are unavailable right now.", true);
    return readFile(workFile);
  }
  let response: Response;
  try {
    if (plan.provider === "elevenlabs") {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: text.slice(0, 600), model_id: "eleven_multilingual_v2", voice_settings: { ...ELEVEN_SETTINGS[plan.style], use_speaker_boost: true } }),
        signal: AbortSignal.timeout(90_000), cache: "no-store",
      });
    } else {
      const url = `https://gen.pollinations.ai/audio/${encodeURIComponent(text.slice(0, 600))}?model=hexgrad%2Fkokoro-82m&voice=${encodeURIComponent(voiceId)}&response_format=mp3`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY ?? ""}` }, signal: AbortSignal.timeout(90_000), cache: "no-store" });
    }
  } catch (error) {
    throw new ProviderError(`Voice provider unreachable (${error instanceof Error ? error.message : "network"}).`, true);
  }
  if (!response.ok) throw new ProviderError(`Voice provider returned ${response.status}.${response.status === 402 ? " Check credits." : ""}`, httpRetryable(response.status), response.status);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("audio/")) throw new ProviderError("Voice provider did not return audio.", true);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 800) throw new ProviderError("Voice provider returned an empty clip.", true);
  return bytes;
}

/** Generates one scene's narration, applies pacing for the niche, and returns the real duration. */
export async function synthesizeNarration(plan: VoicePlan, text: string, outFile: string, workFile: string): Promise<{ duration: number; voiceId: string }> {
  let voiceId = plan.voiceId;
  let bytes: Buffer;
  try {
    bytes = await fetchVoice(plan, text, voiceId, workFile);
  } catch (error) {
    // Unknown Kokoro voice ids come back as 4xx — fall back to the voice the app already uses.
    if (plan.provider === "pollinations" && error instanceof ProviderError && !error.retryable && voiceId !== KOKORO_FALLBACK) {
      voiceId = KOKORO_FALLBACK;
      bytes = await fetchVoice(plan, text, voiceId, workFile);
    } else throw error;
  }
  await writeFile(workFile, bytes);
  const pace = Math.max(0.85, Math.min(1.15, plan.pace));
  await runFfmpeg(["-i", workFile, "-af", `atempo=${pace.toFixed(3)},silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=44100`, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "160k", outFile], 60_000);
  const info = await probe(outFile);
  return { duration: info.duration, voiceId };
}
