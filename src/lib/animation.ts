import { getEditorSettings, resolvePlayhead, sceneDefaults } from "@/lib/timeline";
import type { CameraMotion, CaptionStyle, Character, CharacterMotion, Expression, Palette, Prop, StoryScene, StudioProject } from "@/lib/types";

export type VoiceEnvelope = { levels: Float32Array; duration: number };

const COLORS: Record<Palette, { sky: string; horizon: string; hill: string; ground: string; accent: string }> = {
  meadow: { sky: "#ffdfb9", horizon: "#fff0d8", hill: "#b8d5ab", ground: "#82b994", accent: "#f5a678" },
  ocean: { sky: "#91dce2", horizon: "#c9f2e8", hill: "#57babd", ground: "#2e9daa", accent: "#ffad9e" },
  space: { sky: "#66619e", horizon: "#aa95c9", hill: "#635b9d", ground: "#4b4c80", accent: "#f8c78f" },
  forest: { sky: "#c9e2c2", horizon: "#f1ebcb", hill: "#90bd9b", ground: "#5ca484", accent: "#f8be82" },
  sunset: { sky: "#f8bdb1", horizon: "#ffe8ca", hill: "#b9b5aa", ground: "#8cae9c", accent: "#f7cf91" },
  night: { sky: "#55597f", horizon: "#9a80a6", hill: "#71688e", ground: "#575c79", accent: "#f5d593" },
  candy: { sky: "#eed0df", horizon: "#fff0dc", hill: "#c9b3d5", ground: "#9bbda9", accent: "#f5b59b" },
};
const FUR: Record<Character, string> = { fox: "#dc8257", bunny: "#c9b5df", bear: "#b98b6e", turtle: "#8cbd9a", dino: "#93c7a1", cat: "#eebd91", astronaut: "#789dc4" };
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const ease = (n: number) => 1 - Math.pow(1 - clamp(n), 3);

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill();
}
function triangle(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
}
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= clamp(alpha);
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + size * .18, y - size * .18, x + size, y);
  ctx.quadraticCurveTo(x + size * .18, y + size * .18, x, y + size);
  ctx.quadraticCurveTo(x - size * .18, y + size * .18, x - size, y);
  ctx.quadraticCurveTo(x - size * .18, y - size * .18, x, y - size);
  ctx.fill(); ctx.restore();
}
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number, fill: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 2 + x) * .12); ctx.scale(s, s);
  ctx.strokeStyle = "#548c70"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(8, 22, 0, 36); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; oval(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 7, 11, fill, a - Math.PI / 2); }
  circle(ctx, 0, 0, 6, "#f6c676"); ctx.restore();
}
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha = .75) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha *= alpha;
  oval(ctx, -28, 5, 34, 16, "#fff9f0"); oval(ctx, 3, -6, 30, 24, "#fff9f0"); oval(ctx, 35, 5, 29, 16, "#fff9f0");
  rounded(ctx, -50, 0, 103, 18, 9, "#fff9f0"); ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, palette: Palette, time: number) {
  const c = COLORS[palette] || COLORS.meadow;
  const gradient = ctx.createLinearGradient(0, 0, 0, 960);
  gradient.addColorStop(0, c.sky); gradient.addColorStop(.73, c.horizon); gradient.addColorStop(1, c.ground);
  ctx.fillStyle = gradient; ctx.fillRect(-70, -80, 680, 1120);
  if (palette === "space" || palette === "night") {
    for (let i = 0; i < 49; i++) {
      const x = (i * 137 + 31) % 540; const y = (i * 79 + 43) % 680;
      circle(ctx, x, y, i % 5 === 0 ? 3 : 1.5, "#fff8dc");
      if (i % 6 === 0) sparkle(ctx, x, y, 7 + i % 4, "#fff8dc", .45 + .42 * Math.sin(time * 3 + i));
    }
    circle(ctx, 412, 153, palette === "space" ? 72 : 56, "#ffe6aa");
    if (palette === "space") { oval(ctx, 420, 167, 102, 20, "#e8b7b0", -.25); circle(ctx, 412, 153, 59, "#ffe1aa"); }
    else circle(ctx, 437, 133, 53, c.sky);
  } else if (palette === "ocean") {
    ctx.save(); ctx.globalAlpha *= .12; triangle(ctx, 70, -60, 174, -60, 292, 760, "#ffffff"); triangle(ctx, 260, -60, 340, -60, 472, 800, "#ffffff"); ctx.restore();
    for (let i = 0; i < 29; i++) {
      const x = (i * 113 + 38 + Math.sin(time + i) * 6) % 560;
      const y = ((i * 131 + 760 - time * (12 + i % 5 * 3)) % 790 + 790) % 790;
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4 + i % 4 * 3, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    if (palette !== "forest") {
      circle(ctx, 410, 174, 67 + Math.sin(time * 1.6) * 2, palette === "sunset" ? "#ffe5ae" : "#fff1b8");
      ctx.save(); ctx.globalAlpha *= .18; circle(ctx, 410, 174, 91 + Math.sin(time) * 6, "#fff6d2"); ctx.restore();
    }
    cloud(ctx, 98 + time * 7 % 170, 178, 1.14);
    cloud(ctx, 380 - time * 5 % 125, 303, .77, .55);
  }
  ctx.fillStyle = c.hill; ctx.beginPath(); ctx.moveTo(-70, 660);
  ctx.quadraticCurveTo(120, 570 + Math.sin(time * .8) * 5, 275, 638);
  ctx.quadraticCurveTo(432, 705, 610, 583); ctx.lineTo(610, 1040); ctx.lineTo(-70, 1040); ctx.fill();
  ctx.fillStyle = c.ground; ctx.beginPath(); ctx.moveTo(-70, 773);
  ctx.quadraticCurveTo(105, 672, 265, 745); ctx.quadraticCurveTo(425, 798, 610, 704);
  ctx.lineTo(610, 1040); ctx.lineTo(-70, 1040); ctx.fill();
  if (palette === "ocean") {
    for (let i = 0; i < 9; i++) {
      const x = i * 78 + 4;
      ctx.strokeStyle = i % 2 ? "#efab9c" : "#9bd7b7"; ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, 834); ctx.quadraticCurveTo(x - 15 + Math.sin(time * 1.5 + i) * 8, 773, x + 5, 737 - i % 3 * 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 790); ctx.lineTo(x + 15, 767); ctx.stroke();
    }
  } else if (palette === "forest") {
    for (let i = 0; i < 5; i++) {
      const x = i * 130 - 35 + Math.sin(time * .9 + i) * 2;
      rounded(ctx, x + 36, 406 + i % 2 * 35, 18, 320, 9, "#8f9f7d");
      circle(ctx, x + 44, 400 + i % 2 * 35, 68, "#8eba93"); circle(ctx, x + 9, 430 + i % 2 * 35, 47, "#a2c9a1");
    }
  } else if (palette !== "night" && palette !== "space") {
    for (let i = 0; i < 13; i++) flower(ctx, (i * 97 + 16) % 550, 716 + i * 31 % 79, .5 + i % 3 * .16, time, i % 4 === 0 ? "#ffc8bc" : "#fff9e9");
  }
}

function drawFace(ctx: CanvasRenderingContext2D, time: number, expression: Expression, mouth: number, size = 1) {
  const blinkPhase = ((time + 1.4) % 3.7 + 3.7) % 3.7;
  const blinking = blinkPhase < .15 || (expression === "sleepy" && Math.sin(time * 1.1) > .82);
  const pupilX = Math.sin(time * 1.2) * 2.5;
  for (const side of [-1, 1]) {
    const x = side * 24 * size;
    if (blinking) {
      ctx.strokeStyle = "#4c414b"; ctx.lineWidth = 3.5 * size; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 7 * size, -89 * size); ctx.quadraticCurveTo(x, -84 * size, x + 7 * size, -89 * size); ctx.stroke();
    } else {
      oval(ctx, x, -91 * size, expression === "surprised" ? 8 * size : 6.5 * size, expression === "surprised" ? 10 * size : 8 * size, "#fff8ef");
      circle(ctx, x + pupilX * size, -89 * size, 4.5 * size, "#393943");
      circle(ctx, x - 1.2 * size + pupilX * size, -92 * size, 1.7 * size, "#fff");
    }
  }
  if (expression === "curious" || expression === "surprised") {
    ctx.strokeStyle = "#69535b"; ctx.lineWidth = 3 * size; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-32 * size, -111 * size); ctx.quadraticCurveTo(-25 * size, -119 * size - (expression === "surprised" ? 7 : 0), -16 * size, -112 * size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16 * size, -112 * size); ctx.quadraticCurveTo(25 * size, -119 * size - (expression === "surprised" ? 7 : 0), 32 * size, -111 * size); ctx.stroke();
  }
  oval(ctx, -47 * size, -72 * size, 14 * size, 8 * size, "rgba(239,137,137,.32)");
  oval(ctx, 47 * size, -72 * size, 14 * size, 8 * size, "rgba(239,137,137,.32)");
  circle(ctx, 0, -78 * size, 5 * size, "#765b5b");
  if (mouth > .12 || expression === "surprised") {
    const openness = Math.max(mouth, expression === "surprised" ? .4 : 0);
    oval(ctx, 0, -61 * size, (8 + openness * 7) * size, (4 + openness * 13) * size, "#8e5962");
    if (openness > .45) oval(ctx, 0, (-55 + openness * 2) * size, 5 * size, 3 * size, "#f3a3a9");
  } else {
    ctx.strokeStyle = "#765b5b"; ctx.lineWidth = 3 * size; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, -74 * size, expression === "sleepy" ? 9 * size : 15 * size, .16, Math.PI - .16); ctx.stroke();
  }
}

function drawCharacter(ctx: CanvasRenderingContext2D, scene: StoryScene, time: number, mouth: number, index: number) {
  const motion: CharacterMotion = scene.motion || sceneDefaults(index).motion || "bounce";
  const expression: Expression = scene.expression || sceneDefaults(index).expression || "happy";
  const character = scene.character; const main = FUR[character] || FUR.fox;
  const step = Math.sin(time * (motion === "walk" ? 7.2 : 3.3));
  const bob = motion === "float" ? Math.sin(time * 2) * 17 : motion === "dance" ? Math.abs(step) * -17 : motion === "walk" ? Math.abs(step) * -9 : Math.sin(time * 2.7) * 9;
  const horizontal = motion === "walk" ? Math.sin(time * 1.05) * 33 : motion === "dance" ? Math.sin(time * 3) * 13 : 0;
  const tilt = motion === "dance" ? Math.sin(time * 3.1) * .13 : motion === "float" ? Math.sin(time * 1.4) * .065 : Math.sin(time * 1.8) * .026;
  ctx.save(); ctx.translate(250 + horizontal, 525 + bob); ctx.rotate(tilt); ctx.scale(1.1, 1.1);
  ctx.save(); ctx.rotate(-tilt); oval(ctx, -horizontal, 152 - bob, 113, 15, "rgba(46,72,63,.15)"); ctx.restore();
  ctx.shadowColor = "rgba(45,55,60,.15)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
  if (character === "fox" || character === "cat") {
    ctx.save(); ctx.translate(83, 55); ctx.rotate(-.32 + Math.sin(time * 3) * .18);
    oval(ctx, 48, 0, 79, 33, main); oval(ctx, 102, -2, 24, 30, character === "fox" ? "#fff0d7" : main); ctx.restore();
  }
  if (character === "dino") { ctx.save(); ctx.translate(80, 62); ctx.rotate(Math.sin(time * 3) * .13); triangle(ctx, 0, -36, 99, 12, 0, 43, main); ctx.restore(); }
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 56, 91);
    if (motion === "walk" || motion === "dance") ctx.rotate(side * step * .32);
    oval(ctx, 0, 22, 28, 31, main); ctx.restore();
  }
  if (character === "fox" || character === "cat") {
    triangle(ctx, -87, -107, -70, -209, -7, -123, main); triangle(ctx, 87, -107, 70, -209, 7, -123, main);
    triangle(ctx, -68, -119, -61, -174, -32, -131, "#f6b6a4"); triangle(ctx, 68, -119, 61, -174, 32, -131, "#f6b6a4");
  }
  if (character === "bunny") {
    for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * 46, -113); ctx.rotate(side * .1 + Math.sin(time * 3 + side) * .1);
      oval(ctx, 0, -62, 26, 87, main); oval(ctx, 0, -67, 11, 64, "#eeb9c7"); ctx.restore(); }
  }
  if (character === "bear" || character === "astronaut") {
    for (const side of [-1, 1]) { circle(ctx, side * 75, -105, 34, main); circle(ctx, side * 75, -105, 17, "#e6b5a4"); }
  }
  if (character === "dino") {
    for (let i = 0; i < 5; i++) triangle(ctx, -65 + i * 33, -111 - i % 2 * 13, -48 + i * 33, -153 - i % 2 * 13, -24 + i * 33, -109, "#80aeb5");
  }
  if (character === "turtle") { oval(ctx, 0, 46, 116, 86, "#659e83"); oval(ctx, 0, 46, 90, 64, "#afd0a1"); }
  oval(ctx, 0, 37, character === "turtle" ? 79 : 87, 99, main);
  if (character === "fox") {
    rounded(ctx, -62, 34, 124, 96, 22, "#648bb2"); rounded(ctx, -66, 14, 22, 91, 11, "#648bb2"); rounded(ctx, 44, 14, 22, 91, 11, "#648bb2");
    rounded(ctx, -28, 72, 56, 32, 12, "#83a2c5"); circle(ctx, -55, 42, 5, "#f6dfba"); circle(ctx, 55, 42, 5, "#f6dfba");
  }
  if (character === "astronaut") { oval(ctx, 0, 28, 77, 79, "#d7e7e8"); rounded(ctx, -23, 29, 46, 26, 9, "#f5b7a1"); }
  if (character === "dino") oval(ctx, 10, 50, 55, 69, "#cde2b6");
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 80, -4);
    const waving = (motion === "wave" && side === 1) || (motion === "dance");
    ctx.rotate(side * (waving ? .85 + Math.sin(time * 8) * .26 : .34 + step * .18));
    oval(ctx, 0, 34, 23, 55, main); oval(ctx, 0, 74, 24, 22, main);
    ctx.restore();
  }
  oval(ctx, 0, -91, character === "turtle" ? 82 : 92, character === "dino" ? 84 : 88, main);
  if (character === "fox" || character === "cat") { oval(ctx, -37, -45, 41, 31, "#fff0d7", -.14); oval(ctx, 37, -45, 41, 31, "#fff0d7", .14); }
  if (character === "bear") oval(ctx, 0, -53, 41, 32, "#ead2b5");
  if (character === "astronaut") {
    ctx.shadowBlur = 0; ctx.strokeStyle = "#e5f3f0"; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(0, -91, 107, 0, Math.PI * 2); ctx.stroke(); oval(ctx, 0, -92, 91, 87, "rgba(222,243,248,.16)");
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  drawFace(ctx, time, expression, mouth, character === "turtle" ? .86 : 1);
  if (character === "dino") { circle(ctx, 62, -105, 7, "#7aab94"); circle(ctx, 70, -84, 5, "#7aab94"); }
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, time: number) {
  ctx.save(); ctx.translate(414 + Math.sin(time * 1.5) * 16, 480 + Math.sin(time * 2.6) * 16); ctx.rotate(Math.sin(time * 1.7) * .1);
  ctx.shadowColor = "rgba(45,43,64,.15)"; ctx.shadowBlur = 14;
  switch (prop) {
    case "butterfly":
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side * (.72 + Math.abs(Math.sin(time * 13)) * .3), 1);
        oval(ctx, 19, -12, 24, 30, side === 1 ? "#f7b6a8" : "#f9c882", .45);
        oval(ctx, 15, 19, 16, 21, side === 1 ? "#f6bdad" : "#f6d49e", -.4); ctx.restore();
      }
      rounded(ctx, -3, -23, 6, 52, 4, "#825f65"); break;
    case "flower": flower(ctx, 0, 0, 1.8, time, "#fff5ee"); break;
    case "balloon":
      ctx.strokeStyle = "#776979"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 29); ctx.quadraticCurveTo(16 + Math.sin(time * 2) * 8, 91, 0, 126); ctx.stroke();
      oval(ctx, 0, -7, 42, 51, "#f2a9ae"); triangle(ctx, -9, 32, 9, 32, 0, 47, "#f2a9ae"); break;
    case "book": rounded(ctx, -49, -35, 98, 76, 9, "#ecaa94"); rounded(ctx, -42, -28, 85, 62, 6, "#fff1d6");
      ctx.strokeStyle = "#d79481"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(0, 34); ctx.stroke(); break;
    case "rocket":
      oval(ctx, 0, -9, 30, 68, "#f2eee1"); triangle(ctx, -27, -48, 27, -48, 0, -96, "#f3aa9e");
      circle(ctx, 0, -21, 15, "#8bc2cb"); triangle(ctx, -23, 31, -45, 60, -20, 52, "#f3aa9e"); triangle(ctx, 23, 31, 45, 60, 20, 52, "#f3aa9e"); break;
    case "shell": oval(ctx, 0, 13, 49, 38, "#f5c6b2");
      for (let i = -2; i <= 2; i++) { ctx.strokeStyle = "#dfab9e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 45); ctx.lineTo(i * 19, -14 + Math.abs(i) * 8); ctx.stroke(); } break;
    case "star": ctx.save(); ctx.scale(1 + Math.sin(time * 4) * .1, 1 + Math.sin(time * 4) * .1);
      sparkle(ctx, 0, 0, 47, "#ffe0a0"); circle(ctx, -10, 0, 3, "#866b63"); circle(ctx, 10, 0, 3, "#866b63"); ctx.restore(); break;
    default: break;
  }
  ctx.restore();
}

function drawFloatingDetails(ctx: CanvasRenderingContext2D, palette: Palette, time: number) {
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137 + Math.sin(time * .7 + i) * 18) % 610 + 610) % 610 - 35;
    const y = ((i * 97 + 900 - time * (9 + i % 4 * 6)) % 950 + 950) % 950;
    if (palette === "ocean") {
      ctx.strokeStyle = "rgba(255,255,255,.52)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 3 + i % 3 * 2, 0, Math.PI * 2); ctx.stroke();
    } else if (palette === "space" || palette === "night") sparkle(ctx, x, y, 4 + i % 3 * 2, "#fff9d8", .46 + .3 * Math.sin(time + i));
    else if (i % 3 === 0) { ctx.save(); ctx.globalAlpha *= .45; oval(ctx, x, y, 5, 8, i % 2 ? "#fff5df" : "#fbc9b9", Math.sin(time + i)); ctx.restore(); }
  }
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let tail = lines[maxLines - 1];
    while (ctx.measureText(`${tail}…`).width > width && tail.length) tail = tail.slice(0, -1);
    lines[maxLines - 1] = `${tail.trimEnd()}…`;
  }
  return lines;
}

function drawCaptions(ctx: CanvasRenderingContext2D, scene: StoryScene, index: number, total: number, time: number, duration: number, style: CaptionStyle) {
  const appear = ease((time + .18) / .36);
  ctx.save();
  rounded(ctx, 29, 37, 172, 36, 18, "rgba(255,253,247,.91)");
  circle(ctx, 50, 55, 7, "#ef9a79");
  ctx.fillStyle = "#504b53"; ctx.font = "700 17px Arial, sans-serif"; ctx.fillText("littleloop stories", 65, 61);
  ctx.globalAlpha *= appear;
  ctx.translate(0, (1 - appear) * 54);
  if (style === "comic") {
    ctx.shadowColor = "rgba(40,45,52,.17)"; ctx.shadowBlur = 25; ctx.shadowOffsetY = 8;
    rounded(ctx, 33, 738, 474, 145, 36, "#fffdfa"); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    triangle(ctx, 220, 879, 259, 879, 232, 913, "#fffdfa");
    rounded(ctx, 52, 748, 123, 27, 13, "#ffd5b5");
    ctx.fillStyle = "#a66e57"; ctx.font = "700 14px Arial, sans-serif"; ctx.fillText((scene.heading || "A little story").toUpperCase().slice(0, 19), 62, 767);
    ctx.fillStyle = "#29364b"; ctx.font = "700 32px Arial, sans-serif";
    wrap(ctx, scene.caption || "Our story begins...", 410, 2).forEach((line, i) => ctx.fillText(line, 59, 822 + i * 39));
  } else if (style === "subtitles") {
    const gradient = ctx.createLinearGradient(0, 703, 0, 930);
    gradient.addColorStop(0, "rgba(32,39,60,0)"); gradient.addColorStop(1, "rgba(32,39,60,.82)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 703, 540, 245);
    ctx.textAlign = "center"; ctx.font = "700 35px Arial, sans-serif";
    ctx.lineWidth = 8; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(34,43,61,.72)"; ctx.fillStyle = "#fff";
    wrap(ctx, scene.caption || "Our story begins...", 450, 3).forEach((line, i) => { ctx.strokeText(line, 270, 809 + i * 41); ctx.fillText(line, 270, 809 + i * 41); });
    ctx.textAlign = "left";
  } else {
    ctx.shadowColor = "rgba(40,45,52,.16)"; ctx.shadowBlur = 25; ctx.shadowOffsetY = 8;
    rounded(ctx, 25, 725, 490, 173, 28, "#fffcf7"); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = "#c57f66"; ctx.font = "700 17px Arial, sans-serif";
    ctx.fillText((scene.heading || "A little story").toUpperCase().slice(0, 38), 58, 766);
    ctx.fillStyle = "#2e3341"; ctx.font = "700 34px Arial, sans-serif";
    wrap(ctx, scene.caption || "Our story begins...", 415, 2).forEach((line, i) => ctx.fillText(line, 58, 819 + i * 40));
  }
  ctx.restore();
  rounded(ctx, 26, 920, 488, 5, 3, "rgba(255,255,255,.48)");
  rounded(ctx, 26, 920, 488 * (index + clamp(time / Math.max(1, duration))) / Math.max(1, total), 5, 3, "#fff9e6");
  ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.font = "600 15px Arial, sans-serif"; ctx.fillText(`${index + 1} / ${total}`, 461, 952);
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number) {
  const scale = Math.max(610 / width, 1050 / height);
  const w = width * scale; const h = height * scale;
  ctx.drawImage(image, (540 - w) / 2, (960 - h) / 2, w, h);
  const wash = ctx.createLinearGradient(0, 550, 0, 950); wash.addColorStop(0, "rgba(28,45,50,0)"); wash.addColorStop(1, "rgba(28,45,50,.18)");
  ctx.fillStyle = wash; ctx.fillRect(0, 550, 540, 410);
}

function syncSceneVideo(video: HTMLVideoElement, localTime: number, sceneDuration: number) {
  if (video.readyState < 2) return false;
  if (video.paused && video.ended === false) void video.play().catch(() => {});
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : sceneDuration;
  const desired = localTime % Math.max(0.1, duration);
  if (video.seekable.length && Math.abs(video.currentTime - desired) > 0.28) {
    try { video.currentTime = desired; } catch { /* Browser may reject seeks while a previous one is pending. */ }
  }
  return true;
}

function getMouthLevel(scene: StoryScene, time: number, duration: number, voice?: VoiceEnvelope | null) {
  const position = time - .18;
  if (position < 0) return 0;
  if (voice) {
    const rate = Math.min(1.35, Math.max(1, voice.duration / Math.max(1.2, duration - .5)));
    const index = Math.floor(position * rate * 30);
    return voice.levels[index] ?? 0;
  }
  if (!scene.narration || position > Math.min(duration - .35, scene.narration.split(/\s+/).length / 2.4)) return 0;
  return .23 + .38 * Math.abs(Math.sin(position * 14) * Math.cos(position * 5));
}

function paintScene(ctx: CanvasRenderingContext2D, scene: StoryScene, index: number, total: number, time: number, duration: number, image: HTMLImageElement | null, voice: VoiceEnvelope | null, captionStyle: CaptionStyle, video: HTMLVideoElement | null = null) {
  const camera: CameraMotion = scene.camera || sceneDefaults(index).camera || "push-in";
  const percent = clamp(time / Math.max(.1, duration));
  const zoom = camera === "push-in" ? 1.025 + percent * .095 : camera === "steady" ? 1 : 1.055;
  const pan = camera === "pan-left" ? 20 - 40 * percent : camera === "pan-right" ? -20 + 40 * percent : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 540, 960); ctx.clip();
  ctx.save(); ctx.translate(270 + pan, 480); ctx.scale(zoom, zoom); ctx.translate(-270, -480);
  const videoReady = video ? syncSceneVideo(video, time, duration) : false;
  if (video && videoReady) {
    drawImageCover(ctx, video, video.videoWidth || 540, video.videoHeight || 960);
  } else if (image?.complete && image.naturalWidth) {
    drawImageCover(ctx, image, image.naturalWidth, image.naturalHeight);
  } else {
    drawBackground(ctx, scene.palette, time);
  }
  const usesFootage = Boolean(scene.videoUrl);
  if (!usesFootage) {
    drawProp(ctx, scene.prop, time);
    if (scene.showCharacter !== false) drawCharacter(ctx, scene, time, getMouthLevel(scene, time, duration, voice), index);
  }
  ctx.restore();
  drawFloatingDetails(ctx, scene.palette, time);
  drawCaptions(ctx, scene, index, total, time, duration, captionStyle);
  ctx.restore();
}

export function drawTimelineFrame(ctx: CanvasRenderingContext2D, project: StudioProject, seconds: number, images: (HTMLImageElement | null)[] = [], voices: (VoiceEnvelope | null)[] = [], videos: (HTMLVideoElement | null)[] = []) {
  const position = resolvePlayhead(project, seconds);
  const { index, local, duration } = position;
  if (!project.scenes.length) return position;
  const scene = project.scenes[index];
  const settings = getEditorSettings(project);
  ctx.save(); ctx.setTransform(ctx.canvas.width / 540, 0, 0, ctx.canvas.height / 960, 0, 0);
  ctx.clearRect(0, 0, 540, 960);
  const transition = scene.transition || sceneDefaults(index).transition;
  const mix = index > 0 && transition !== "cut" && local < .55 ? ease(local / .55) : 1;
  if (mix < 1) {
    const previous = project.scenes[index - 1];
    const previousDuration = resolvePlayhead(project, position.clip!.start - .001).duration;
    paintScene(ctx, previous, index - 1, project.scenes.length, previousDuration - .15, previousDuration, images[index - 1] || null, voices[index - 1] || null, settings.captionStyle, videos[index - 1] || null);
  }
  ctx.save();
  if (mix < 1 && transition === "slide") ctx.translate((1 - mix) * 540, 0);
  else if (mix < 1 && transition === "pop") { ctx.globalAlpha *= mix; ctx.translate(270, 480); ctx.scale(.83 + .17 * mix, .83 + .17 * mix); ctx.translate(-270, -480); }
  else if (mix < 1) ctx.globalAlpha *= mix;
  paintScene(ctx, scene, index, project.scenes.length, local, duration, images[index] || null, voices[index] || null, settings.captionStyle, videos[index] || null);
  ctx.restore(); ctx.restore();
  return position;
}

export function drawFrame(ctx: CanvasRenderingContext2D, scene: StoryScene, index: number, total: number, time = 0, image?: HTMLImageElement | null) {
  ctx.save(); ctx.setTransform(ctx.canvas.width / 540, 0, 0, ctx.canvas.height / 960, 0, 0);
  ctx.clearRect(0, 0, 540, 960);
  paintScene(ctx, scene, index, total, time, 6, image || null, null, "storybook");
  ctx.restore();
}

export async function loadSceneImage(scene: StoryScene): Promise<HTMLImageElement | null> {
  const url = scene.artUrl || scene.videoPosterUrl;
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export async function loadSceneVideo(scene: StoryScene): Promise<HTMLVideoElement | null> {
  const sourceUrl = scene.videoUrl;
  if (!sourceUrl) return null;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.onloadeddata = () => { void video.play().then(() => finish(video)).catch(() => finish(video)); };
    video.onerror = () => finish(null);
    video.src = sourceUrl;
    setTimeout(() => finish(video.readyState >= 2 ? video : null), 12000);
  });
}

export async function loadProjectImages(scenes: StoryScene[]) {
  return Promise.all(scenes.map(loadSceneImage));
}

export async function loadProjectVideos(scenes: StoryScene[]) {
  return Promise.all(scenes.map(loadSceneVideo));
}
