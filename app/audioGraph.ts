"use client";

export type SharedGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  normGain: GainNode;
  limiter: DynamicsCompressorNode;
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

  // Gain de normalisation (ajusté en continu pour lisser les écarts de volume
  // entre morceaux) suivi d'un limiteur doux qui absorbe les pics quand ce
  // gain dépasse 1, pour éviter toute saturation.
  const normGain = ctx.createGain();
  normGain.gain.value = 1;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const graph: SharedGraph = { ctx, analyser, source, normGain, limiter, connected: false };
  graphByMedia.set(media, graph);
  return graph;
}

export function ensureConnected(graph: SharedGraph) {
  if (graph.connected) return;
  graph.source.connect(graph.normGain);
  graph.normGain.connect(graph.limiter);
  graph.limiter.connect(graph.analyser);
  graph.analyser.connect(graph.ctx.destination);
  graph.connected = true;
}
