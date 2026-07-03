const DEVICE_ID_KEY = "mp3_device_id";
const DEVICE_LABEL_KEY = "mp3_device_label";

function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Appareil";
  const ua = navigator.userAgent;

  let os = "Appareil";
  if (/iphone/i.test(ua)) os = "iPhone";
  else if (/ipad/i.test(ua)) os = "iPad";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os/i.test(ua)) os = "Mac";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return browser ? `${browser} sur ${os}` : os;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function getDeviceLabel(): string {
  if (typeof window === "undefined") return "Appareil";
  try {
    let label = localStorage.getItem(DEVICE_LABEL_KEY);
    if (!label) {
      label = guessDeviceLabel();
      localStorage.setItem(DEVICE_LABEL_KEY, label);
    }
    return label;
  } catch {
    return guessDeviceLabel();
  }
}
