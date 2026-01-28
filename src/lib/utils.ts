import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Ensures a base64 image string has the proper data URL prefix.
 * Handles both raw base64 strings and full data URLs.
 */
export function toImageSrc(base64OrDataUrl: string | undefined | null, mimeType = "image/png"): string {
  if (!base64OrDataUrl) return "";
  
  // Already has data URL prefix
  if (base64OrDataUrl.startsWith("data:")) {
    return base64OrDataUrl;
  }
  
  // Raw base64 - add prefix
  return `data:${mimeType};base64,${base64OrDataUrl}`;
}

