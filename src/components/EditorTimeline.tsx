"use client";

import { AudioLines, Captions, Copy, GripVertical, History, Music2, Redo2, Scissors, Undo2 } from "lucide-react";
import { getEditorSettings, getTimeline, getTotalDuration } from "@/lib/timeline";
import { CHARACTERS, type StudioProject } from "@/lib/types";

type Props = {
  project: StudioProject;
  selectedIndex: number;
  playhead: number;
  onSeek: (seconds: number) => void;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
};

export default function EditorTimeline({ project, selectedIndex, playhead, onSeek, onSelect, onMove, onDuplicate, onUndo, onRedo, canUndo, canRedo, disabled }: Props) {
  const clips = getTimeline(project);
  const total = getTotalDuration(project);
  const settings = getEditorSettings(project);
  const ticks = Array.from({ length: Math.floor(total / 5) + 1 }, (_, index) => index * 5);
  if (ticks[ticks.length - 1] !== Math.ceil(total)) ticks.push(Math.ceil(total));
  return (
    <section className="edit-timeline panel" aria-label="Video timeline">
      <div className="timeline-head">
        <div className="timeline-heading"><span className="timeline-title-icon"><Scissors size={17} /></span><div><p className="tiny-eyebrow">PRECISION EDITING</p><h2>Story timeline <span>{Math.round(total * 10) / 10}s total</span></h2></div></div>
        <div className="timeline-actions">
          <span className="timeline-help">Drag clips to reorder</span>
          <button onClick={onUndo} disabled={!canUndo || disabled} title="Undo (Ctrl+Z)" aria-label="Undo edit"><Undo2 size={17} /></button>
          <button onClick={onRedo} disabled={!canRedo || disabled} title="Redo (Ctrl+Shift+Z)" aria-label="Redo edit"><Redo2 size={17} /></button>
          <span className="timeline-action-divider" />
          <button onClick={onDuplicate} disabled={disabled || project.scenes.length >= 8} title="Duplicate selected scene" aria-label="Duplicate selected scene"><Copy size={16} /></button>
        </div>
      </div>
      <div className="timeline-workspace">
        <div className="timeline-labels"><div className="timeline-label-spacer" /><div><History size={14} /> SCENES</div><div><AudioLines size={14} /> VOICES</div><div><Captions size={14} /> CAPTIONS</div><div><Music2 size={14} /> MUSIC</div></div>
        <div className="timeline-content">
          <div className="timeline-ruler">
            {ticks.map((second) => <span key={second} style={{ left: `${Math.min(100, second / Math.max(1, total) * 100)}%` }}>{second}s</span>)}
            <input aria-label="Scrub video timeline" type="range" min="0" max={total} step="0.1" value={Math.min(playhead, total)} onChange={(event) => onSeek(Number(event.target.value))} />
          </div>
          <div className="timeline-lanes">
            <div className="timeline-clip-row">
              {clips.map((clip) => {
                const scene = project.scenes[clip.index];
                const emoji = CHARACTERS.find((entry) => entry.value === scene.character)?.emoji || "✨";
                return <button
                  key={scene.id}
                  draggable={!disabled}
                  onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(clip.index)); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                  onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(from)) onMove(from, clip.index); }}
                  onClick={() => onSelect(clip.index)}
                  className={`timeline-clip timeline-palette-${scene.palette} ${selectedIndex === clip.index ? "active" : ""}`}
                  style={{ flexGrow: clip.duration }}
                  title={`Scene ${clip.index + 1}: ${scene.heading} — ${clip.duration}s. Drag to reorder.`}
                >
                  <span className="timeline-clip-top"><GripVertical size={12} /><span>SCENE {String(clip.index + 1).padStart(2, "0")}</span><small>{Math.round(clip.duration * 10) / 10}s</small></span>
                  <span className="timeline-clip-bottom"><span className="timeline-character">{emoji}</span><strong>{scene.heading}</strong></span>
                </button>;
              })}
            </div>
            <div className="timeline-voice-row">{clips.map((clip) => <div key={clip.index} className={`timeline-voice-block ${project.scenes[clip.index].audioData ? "has-audio" : ""}`} style={{ flexGrow: clip.duration }} onClick={() => onSelect(clip.index)} title={project.scenes[clip.index].audioData ? `Scene ${clip.index + 1}: voice attached` : `Scene ${clip.index + 1}: no saved voice`}><span>{project.scenes[clip.index].audioData ? "▂▅▃▆▄▃▇▅▂▆▃▅▄▇▃" : "+ Add voice"}</span></div>)}</div>
            <div className="timeline-caption-row">{clips.map((clip) => <div key={clip.index} style={{ flexGrow: clip.duration }} title={project.scenes[clip.index].caption}><span>CC</span> {project.scenes[clip.index].caption || "Add caption"}</div>)}</div>
            <div className="timeline-music-row"><span className="timeline-music-wave">▁▃▅▂▄▆▃▅▂▄▇▃▅▂▄▅▁▃▅▂▄▆▃▅▂▄▇▃▅▂▄▅</span><strong>{settings.music === "off" ? "Music off" : `${settings.music} melody`}</strong></div>
            <span className="timeline-playhead" style={{ left: `${Math.min(100, playhead / Math.max(.01, total) * 100)}%` }} aria-hidden="true"><i /></span>
          </div>
        </div>
      </div>
      <div className="timeline-foot"><span>Use the ruler to scrub · drag scenes to change the story order</span><span>{project.scenes.length} clips · 9:16 vertical</span></div>
    </section>
  );
}
