"use client";

export type SharedGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  connected: boolean;
};

/**
 * Un même HTMLMediaElement ne peut être connecté qu'une seule fois via createMediaElementSource.
 * On mutualise donc (ctx/analyser/source) globalement pour tous les composants.
 */
const graphByMedia = new WeakMap<HTMLMediaElement, SharedGraph>();

export function getOrCreateSharedGraph(media: HTMLMediaElement): SharedGraph | null {
  const existing = graphByMedia.get(media);
  if (existing) return existing;

  const webkitAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const Ctx = window.AudioContext || webkitAudioContext;
  if (!Ctx) return null;

  const ctx: AudioContext = new Ctx();

  // Un analyser partagé (tu peux le reconfigurer dans chaque composant via analyser.fftSize etc.)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  // ⚠️ UNE SEULE FOIS PAR media
  const source = ctx.createMediaElementSource(media);

  const graph: SharedGraph = { ctx, analyser, source, connected: false };
  graphByMedia.set(media, graph);
  return graph;
}

export function ensureConnected(graph: SharedGraph) {
  if (graph.connected) return;
  graph.source.connect(graph.analyser);
  graph.analyser.connect(graph.ctx.destination);
  graph.connected = true;
}
