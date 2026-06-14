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

export function isAcceptedMp3Upload(file: File) {
  const fileName = file.name || "track.mp3";
  const fileType = file.type || "";
  return fileType.includes("audio/mpeg") || fileName.toLowerCase().endsWith(".mp3");
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
