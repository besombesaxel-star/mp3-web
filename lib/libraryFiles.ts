export function safeBaseName(name: string) {
  const base = name
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  return base || "track";
}

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".wav"] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export function isAcceptedAudioFileName(name: string) {
  const lowered = (name || "").toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lowered.endsWith(ext));
}

export function isAcceptedAudioUpload(file: File) {
  const fileName = file.name || "track.mp3";
  const fileType = (file.type || "").toLowerCase();
  return (
    fileType.includes("audio/mpeg") ||
    fileType.includes("flac") ||
    fileType.includes("wav") ||
    isAcceptedAudioFileName(fileName)
  );
}

export function getAudioExtension(fileName: string, fileType?: string): AudioExtension {
  const lowered = (fileName || "").toLowerCase();
  for (const ext of AUDIO_EXTENSIONS) {
    if (lowered.endsWith(ext)) return ext;
  }
  const type = (fileType || "").toLowerCase();
  if (type.includes("flac")) return ".flac";
  if (type.includes("wav")) return ".wav";
  return ".mp3";
}

export function stripAudioExtension(fileName: string) {
  return fileName.replace(/\.(mp3|flac|wav)$/i, "");
}

export function getAudioContentType(extension: string): string {
  if (extension === ".flac") return "audio/flac";
  if (extension === ".wav") return "audio/wav";
  return "audio/mpeg";
}

export function isAcceptedCoverUpload(file: File) {
  const fileName = (file.name || "").toLowerCase();
  const fileType = file.type || "";

  return (
    fileType.startsWith("image/") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".webp")
  );
}

export function getCoverExtension(name: string) {
  const lowered = name.toLowerCase();
  if (lowered.endsWith(".png")) return ".png";
  if (lowered.endsWith(".webp")) return ".webp";
  return ".jpg";
}

export function getCoverContentType(extension: string): string {
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}
