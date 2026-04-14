export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const getBaseUrl = async (): Promise<string> => {
  if (typeof window !== "undefined" && window.electronAPI) {
    const port = await window.electronAPI.getPythonPort();
    return `http://127.0.0.1:${port}`;
  }
  return "http://127.0.0.1:8765";
};

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const baseUrl = await getBaseUrl();
    const headers = new Headers(options.headers);

    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return { success: false, error: error.detail || `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data && typeof data === "object" && "success" in data) {
      const envelope = data as Record<string, unknown>;
      const { success, error, data: nestedData, ...rest } = envelope;
      const payload = "data" in envelope
        ? nestedData
        : (Object.keys(rest).length > 0 ? rest : undefined);

      return {
        success: Boolean(success),
        data: payload as T | undefined,
        error: typeof error === "string" ? error : undefined,
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
