/**
 * Utility functions for dataset file analysis
 */

import { FileMetadata, DatasetFileAnalysis } from '../types/dataset';

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
}

/**
 * Check if a file is a text file based on extension
 */
export function isTextFile(filename: string): boolean {
  const textExtensions = [
    'txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
    'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss',
    'r', 'R', 'rmd', 'ipynb', 'sql', 'sh', 'bash',
    'log', 'ini', 'cfg', 'conf', 'toml'
  ];
  const ext = getFileExtension(filename);
  return textExtensions.includes(ext);
}

/**
 * Check if file is a data file that might have headers
 */
export function isDataFile(filename: string): boolean {
  const dataExtensions = ['csv', 'tsv', 'json', 'parquet', 'xlsx', 'xls'];
  const ext = getFileExtension(filename);
  return dataExtensions.includes(ext);
}

/**
 * Read first few lines of a text file
 */
export async function readFileHead(file: File, maxLines: number = 10): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Read first 64KB max for header detection
    const slice = file.slice(0, 64 * 1024);
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').slice(0, maxLines);
      resolve(lines);
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsText(slice);
  });
}

/**
 * Parse CSV headers from first line
 */
export function parseCSVHeaders(line: string): string[] {
  // Simple CSV parsing - handles quoted fields
  const headers: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      headers.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current) {
    headers.push(current.trim());
  }
  
  return headers;
}

/**
 * Analyze JSON structure from file content
 */
export async function analyzeJSONStructure(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Read first 32KB for structure analysis
    const slice = file.slice(0, 32 * 1024);
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        
        if (Array.isArray(json) && json.length > 0) {
          // Array of objects - get keys from first item
          resolve(Object.keys(json[0] || {}));
        } else if (typeof json === 'object' && json !== null) {
          // Object - get top-level keys
          resolve(Object.keys(json));
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsText(slice);
  });
}

/**
 * Recursively scan a directory handle and collect file metadata
 */
export async function scanDirectory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandle: any,
  basePath: string = ''
): Promise<FileMetadata[]> {
  const files: FileMetadata[] = [];
  
  for await (const entry of dirHandle.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      try {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        
        files.push({
          name: entry.name,
          path: entryPath,
          size: file.size,
          type: file.type || 'application/octet-stream',
          extension: getFileExtension(entry.name),
          lastModified: file.lastModified
        });
      } catch (err) {
        console.warn(`Could not read file ${entryPath}:`, err);
      }
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      const subFiles = await scanDirectory(subDirHandle, entryPath);
      files.push(...subFiles);
    }
  }
  
  return files;
}

/**
 * Analyze a directory and extract metadata for AI description generation
 */
export async function analyzeDatasetFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandle: any,
  maxSampleFiles: number = 20
): Promise<DatasetFileAnalysis> {
  const allFiles = await scanDirectory(dirHandle);
  
  // Calculate statistics
  const fileTypes: Record<string, number> = {};
  const fileSizes: Record<string, number> = {};
  let totalSize = 0;
  
  for (const file of allFiles) {
    const ext = file.extension || 'unknown';
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    fileSizes[ext] = (fileSizes[ext] || 0) + file.size;
    totalSize += file.size;
  }
  
  // Get sample files (prioritize data files)
  const sortedFiles = [...allFiles].sort((a, b) => {
    // Prioritize data files
    const aIsData = isDataFile(a.name);
    const bIsData = isDataFile(b.name);
    if (aIsData && !bIsData) return -1;
    if (!aIsData && bIsData) return 1;
    // Then by size (larger first)
    return b.size - a.size;
  });
  
  const sampleFiles = sortedFiles.slice(0, maxSampleFiles);
  
  // Analyze CSV headers for data files
  const csvHeaders: Record<string, string[]> = {};
  const jsonStructure: Record<string, string[]> = {};
  
  for (const fileMeta of sampleFiles) {
    const ext = fileMeta.extension;
    
    if (ext === 'csv' || ext === 'tsv') {
      try {
        // Get the actual file
        const pathParts = fileMeta.path.split('/');
        let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(pathParts[i]);
        }
        
        const fileHandle = await (currentHandle as FileSystemDirectoryHandle).getFileHandle(pathParts[pathParts.length - 1]);
        const file = await fileHandle.getFile();
        const lines = await readFileHead(file, 1);
        
        if (lines.length > 0) {
          const delimiter = ext === 'tsv' ? '\t' : ',';
          csvHeaders[fileMeta.name] = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
        }
      } catch (err) {
        console.warn(`Could not read headers for ${fileMeta.name}:`, err);
      }
    } else if (ext === 'json') {
      try {
        const pathParts = fileMeta.path.split('/');
        let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(pathParts[i]);
        }
        
        const fileHandle = await (currentHandle as FileSystemDirectoryHandle).getFileHandle(pathParts[pathParts.length - 1]);
        const file = await fileHandle.getFile();
        jsonStructure[fileMeta.name] = await analyzeJSONStructure(file);
      } catch (err) {
        console.warn(`Could not analyze JSON structure for ${fileMeta.name}:`, err);
      }
    }
  }
  
  return {
    totalFiles: allFiles.length,
    totalSize,
    fileTypes,
    fileSizes,
    sampleFiles,
    csvHeaders: Object.keys(csvHeaders).length > 0 ? csvHeaders : undefined,
    jsonStructure: Object.keys(jsonStructure).length > 0 ? jsonStructure : undefined
  };
}

/**
 * Generate a summary of the dataset for AI description generation
 */
export function generateDatasetSummary(
  analysis: DatasetFileAnalysis,
  userDescription: string
): string {
  const lines: string[] = [];
  
  lines.push('## Dataset Overview');
  lines.push(`- Total files: ${analysis.totalFiles}`);
  lines.push(`- Total size: ${formatBytes(analysis.totalSize)}`);
  lines.push('');
  
  lines.push('## File Types');
  const sortedTypes = Object.entries(analysis.fileTypes)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [ext, count] of sortedTypes) {
    const size = analysis.fileSizes[ext] || 0;
    lines.push(`- .${ext}: ${count} files (${formatBytes(size)})`);
  }
  lines.push('');
  
  lines.push('## Sample Files');
  for (const file of analysis.sampleFiles.slice(0, 10)) {
    lines.push(`- ${file.path} (${formatBytes(file.size)})`);
  }
  lines.push('');
  
  if (analysis.csvHeaders && Object.keys(analysis.csvHeaders).length > 0) {
    lines.push('## CSV/TSV Column Headers');
    for (const [filename, headers] of Object.entries(analysis.csvHeaders)) {
      lines.push(`### ${filename}`);
      lines.push(`Columns: ${headers.join(', ')}`);
    }
    lines.push('');
  }
  
  if (analysis.jsonStructure && Object.keys(analysis.jsonStructure).length > 0) {
    lines.push('## JSON Structure');
    for (const [filename, keys] of Object.entries(analysis.jsonStructure)) {
      lines.push(`### ${filename}`);
      lines.push(`Keys: ${keys.join(', ')}`);
    }
    lines.push('');
  }
  
  lines.push('## User Description');
  lines.push(userDescription);
  
  return lines.join('\n');
}

/**
 * Generate a unique dataset ID
 */
export function generateDatasetId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `dataset-${timestamp}-${randomPart}`;
}
