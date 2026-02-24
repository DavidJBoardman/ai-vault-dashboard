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
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return { success: false, error: error.detail || `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data && typeof data === "object" && "success" in data && "data" in data) {
      return {
        success: data.success,
        data: data.data as T,
        error: data.error,
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

