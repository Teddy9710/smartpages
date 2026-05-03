/**
 * Type definitions for Smart Page Scribe Chrome Extension
 */

/** Recording states for the extension */
type RecordingState = 'IDLE' | 'RECORDING' | 'PAUSED' | 'STOPPED';

/** A single recorded step in a session */
interface RecordedStep {
  type: string;
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
  screenshot?: string;
  description?: string;
}

/** A recording session */
interface RecordingSession {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  steps: RecordedStep[];
  state: RecordingState;
}

/** Extension configuration stored in chrome.storage */
interface ExtensionConfig {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
  maxTokens: number;
}

/** Document item from the API */
interface DocumentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: number;
}

/** Upload history item */
interface UploadHistoryItem {
  filename: string;
  size: number;
  success: boolean;
  type: 'github' | 'local';
  date: string;
  error?: string;
}

/** API response wrapper */
interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  documents?: T[];
}

/** Custom extension error */
interface ExtensionError extends Error {
  code: string;
}

/** DOM element creation properties */
interface CreateElementProperties {
  className?: string;
  id?: string;
  textContent?: string;
  innerHTML?: string;
  onclick?: (event: Event) => void;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}
