/**
 * Types and interfaces for dataset mounting and management
 */

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastAccessed?: number;
}

export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  extension: string;
  lastModified: number;
}

export interface DatasetFileAnalysis {
  totalFiles: number;
  totalSize: number;
  fileTypes: Record<string, number>; // extension -> count
  fileSizes: Record<string, number>; // extension -> total size
  sampleFiles: FileMetadata[];
  csvHeaders?: Record<string, string[]>; // filename -> headers
  jsonStructure?: Record<string, string[]>; // filename -> top-level keys
}

export interface RequestLogEntry {
  timestamp: string;
  status: string;
  message?: string;
  detail?: string;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  user: string;
  method: string;
  status: string;
  message?: string;
  detail?: string;
  code?: string;
  history: RequestLogEntry[];
}

export interface DatasetDescriptionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PublishedDataset {
  id: string;
  artifactId: string;
  name: string;
  description: string;
  datasetId: string;
  createdAt: number;
  workspace?: string;
  clientId?: string;
  serviceId?: string;
}
