export {};

declare global {
  interface Window {
    electronAPI?: {
      openFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{
        canceled: boolean;
        filePaths: string[];
      }>;
      saveFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
      openDirectory: () => Promise<{
        canceled: boolean;
        filePaths: string[];
      }>;
      getPath: (name: string) => Promise<string>;
      getPythonPort: () => Promise<number>;
      isPythonRunning: () => Promise<boolean>;
      platform: NodeJS.Platform;
    };
  }
}

