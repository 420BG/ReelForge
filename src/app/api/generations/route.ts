import { db } from "@/db";
import { generations } from "@/db/schema";
import { desc } from "drizzle-orm";
import { generateShort, type NicheId, type VoiceId, type StyleId } from "@/lib/generator";

export const dynamic = "force-dynamic";

const SEEDS: { topic: string; niche: NicheId; voice: VoiceId; style: StyleId; minAgo: number }[] = [
  { topic: "the Fermi paradox", niche: "space", voice: "atlas", style: "cinematic", minAgo: 4 },
  { topic: "compound interest", niche: "money", voice: "orion", style: "neon", minAgo: 11 },
  { topic: "the Mariana Trench", niche: "ocean", voice: "lyra", style: "cinematic", minAgo: 23 },
  { topic: "the spotlight effect", niche: "psychology", voice: "nova", style: "neon", minAgo: 41 },
  { topic: "roman concrete", niche: "history", voice: "atlas", style: "retro", minAgo: 66 },
  { topic: "AGI timelines", niche: "tech", voice: "sage", style: "mono", minAgo: 95 },
];

export async function GET() {
  try {
    let rows = await db
      .select({
        id: generations.id,
        topic: generations.topic,
        niche: generations.niche,
        title: generations.title,
        score: generations.score,
        voice: generations.voice,
        createdAt: generations.createdAt,
      })
      .from(generations)
      .orderBy(desc(generations.createdAt))
      .limit(12);

    if (rows.length === 0) {
      // first boot — seed the gallery so the forge never looks cold
      await db.insert(generations).values(
        SEEDS.map((s) => {
          const short = generateShort({ topic: s.topic, niche: s.niche, voice: s.voice, style: s.style });
          return {
            topic: short.topic,
            niche: short.niche,
            voice: short.voice,
            style: short.style,
            title: short.title,
            score: short.score,
            duration: Math.round(short.duration * 1000),
            scenes: short.scenes,
            createdAt: new Date(Date.now() - s.minAgo * 60_000),
          };
        }),
      );
      rows = await db
        .select({
          id: generations.id,
          topic: generations.topic,
          niche: generations.niche,
          title: generations.title,
          score: generations.score,
          voice: generations.voice,
          createdAt: generations.createdAt,
        })
        .from(generations)
        .orderBy(desc(generations.createdAt))
        .limit(12);
    }

    return Response.json({ items: rows });
  } catch (err) {
    console.error("generations feed failed", err);
    return Response.json({ items: [] }, { status: 200 });
  }
}
