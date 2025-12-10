import { KernelManager } from 'web-python-kernel';

export type KernelManagerType = KernelManager;

export interface KernelInfo {
  kernelId?: string;
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface KernelExecutionLog {
  id?: string;
  timestamp: number;
  type: string;
  content?: string;
  short_content?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ExecuteCodeCallbacks {
  onOutput?: (output: { type: string; content: string; short_content?: string }) => void;
  onStatus?: (status: string) => void;
}
