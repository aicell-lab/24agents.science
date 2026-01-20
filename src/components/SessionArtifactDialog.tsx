import { useState, useEffect, useRef } from "react";
import { useHyphaStore } from "../store/hyphaStore";

interface SessionArtifactDialogProps {
  sessionId: string;
  sessionName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

export default function SessionArtifactDialog({
  sessionId,
  sessionName,
  isOpen,
  onClose,
}: SessionArtifactDialogProps) {
  const { server } = useHyphaStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileItem[]>>({});
  const [dragCounter, setDragCounter] = useState(0);
  const [artifactManager, setArtifactManager] = useState<any>(null);
  const [currentArtifact, setCurrentArtifact] = useState<any>(null);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Get artifact manager service
  useEffect(() => {
    const getAM = async () => {
      if (server) {
        try {
          const am = await server.getService("public/artifact-manager", { case_conversion: "camel" });
          setArtifactManager(am);
        } catch (err) {
          console.error("Failed to get artifact manager:", err);
        }
      }
    };
    getAM();
  }, [server]);

  // Load artifact info and files when dialog opens
  useEffect(() => {
    const loadArtifact = async () => {
      if (isOpen && artifactManager) {
        try {
          const artifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
          setCurrentArtifact(artifact);
          await loadFiles("");
        } catch (err) {
          console.error("Failed to load artifact:", err);
        }
      }
    };
    loadArtifact();
  }, [isOpen, artifactManager, sessionId]);

  const canUpload = currentArtifact?.staging !== null;

  const getAllFilePaths = (fileList: FileItem[], parentPath: string = ""): string[] => {
    const paths: string[] = [];
    for (const file of fileList) {
      const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;
      paths.push(fullPath);
      if (file.type === 'directory' && expandedDirs[fullPath]) {
        paths.push(...getAllFilePaths(expandedDirs[fullPath], fullPath));
      }
    }
    return paths;
  };

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const selectAllFiles = () => {
    const allPaths = getAllFilePaths(files);
    setSelectedFiles(new Set(allPaths));
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const handleBatchDelete = async () => {
    if (!artifactManager || selectedFiles.size === 0) return;

    const confirmMsg = `Delete ${selectedFiles.size} selected item(s)? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setOperationLoading('batch-delete');
    try {
      const sortedPaths = Array.from(selectedFiles).sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        return depthB - depthA;
      });

      for (const filePath of sortedPaths) {
        try {
          await artifactManager.removeFile({
            artifact_id: sessionId,
            file_path: filePath,
            _rkwargs: true
          });
        } catch (err) {
          console.error(`Failed to delete ${filePath}:`, err);
        }
      }

      setSelectedFiles(new Set());
      setIsSelectionMode(false);
      await loadFiles("");
      setExpandedDirs({});
      setStatusMessage({ type: 'success', text: `Deleted ${selectedFiles.size} item(s)` });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to batch delete:", err);
      setStatusMessage({ type: 'error', text: `Failed to delete: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setOperationLoading(null);
    }
  };

  const loadFiles = async (path: string = "") => {
    if (!artifactManager) return [];

    setLoading(true);
    try {
      const fileList = await artifactManager.listFiles({
        artifact_id: sessionId,
        dir_path: path || undefined,
        stage: true,
        _rkwargs: true
      });

      if (path === "") {
        setFiles(fileList || []);
      }
      return fileList || [];
    } catch (err) {
      console.error("Failed to load files:", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    if (!artifactManager) return;

    try {
      const url = await artifactManager.getFile({
        artifact_id: sessionId,
        file_path: filePath,
        _rkwargs: true
      });
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to download file:", err);
      setStatusMessage({ type: 'error', text: `Failed to download: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleDelete = async (filePath: string, fileType: string) => {
    if (!artifactManager) return;

    const confirmMsg = fileType === 'directory'
      ? `Delete folder "${filePath}" and all its contents?`
      : `Delete file "${filePath}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await artifactManager.removeFile({
        artifact_id: sessionId,
        file_path: filePath,
        _rkwargs: true
      });

      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to delete:", err);
      setStatusMessage({ type: 'error', text: `Failed to delete: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleStageArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    try {
      setOperationLoading('stage');
      await artifactManager.edit(sessionId, { stage: true, _rkwargs: true });

      const updatedArtifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);
      setStatusMessage({ type: 'success', text: 'Artifact staged for editing' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to stage artifact:", err);
      setStatusMessage({ type: 'error', text: `Failed to stage: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleCommitArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    try {
      setOperationLoading('commit');
      await artifactManager.commit(sessionId, { _rkwargs: true });

      const updatedArtifact = await artifactManager.read(sessionId, { stage: false, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      await loadFiles("");
      setExpandedDirs({});
      setStatusMessage({ type: 'success', text: 'Changes committed successfully' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to commit artifact:", err);
      setStatusMessage({ type: 'error', text: `Failed to commit: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleDiscardArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    if (!window.confirm("Discard all staged changes? This cannot be undone.")) return;

    try {
      setOperationLoading('discard');
      await artifactManager.discard(sessionId, { _rkwargs: true });

      const updatedArtifact = await artifactManager.read(sessionId, { stage: false, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      await loadFiles("");
      setExpandedDirs({});
      setStatusMessage({ type: 'success', text: 'Changes discarded' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to discard artifact:", err);
      setStatusMessage({ type: 'error', text: `Failed to discard: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleUpload = async (files: FileList, targetPath: string = "") => {
    if (!artifactManager || !files.length) return;

    if (!canUpload) {
      setStatusMessage({ type: 'error', text: 'Stage the artifact first to upload files' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setStatusMessage({ type: 'info', text: `Uploading ${files.length} file(s)...` });

    try {
      const fileArray = Array.from(files);
      let completedCount = 0;

      for (const file of fileArray) {
        const filePath = targetPath ? `${targetPath}/${file.name}` : file.name;

        const putUrl = await artifactManager.putFile({
          artifact_id: sessionId,
          file_path: filePath,
          _rkwargs: true
        });

        await fetch(putUrl, {
          method: 'PUT',
          body: file,
        });

        completedCount++;
        setUploadProgress((completedCount / fileArray.length) * 100);
      }

      await loadFiles("");
      setExpandedDirs({});
      setStatusMessage({ type: 'success', text: `Uploaded ${files.length} file(s)` });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.error("Failed to upload:", err);
      setStatusMessage({ type: 'error', text: `Upload failed: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCreateFolder = async (parentPath: string = "") => {
    if (!canUpload) {
      setStatusMessage({ type: 'error', text: 'Stage the artifact first to create folders' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    const folderName = window.prompt("Enter folder name:");
    if (!folderName || !artifactManager) return;

    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    try {
      const putUrl = await artifactManager.putFile({
        artifact_id: sessionId,
        file_path: `${folderPath}/.gitkeep`,
        _rkwargs: true
      });

      await fetch(putUrl, {
        method: 'PUT',
        body: new Blob([''], { type: 'text/plain' }),
      });

      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to create folder:", err);
      setStatusMessage({ type: 'error', text: `Failed to create folder: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
  };

  const handleDrop = async (e: React.DragEvent, targetPath: string = "") => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files, targetPath);
    }
  };

  const handleCreateZip = async () => {
    if (!server) return;

    try {
      const serverUrl = server.config.public_base_url || server.config.server_url;
      const parts = sessionId.split('/');
      if (parts.length !== 2) {
        throw new Error('Invalid session ID format');
      }
      const [workspace, artifactAlias] = parts;
      const zipUrl = `${serverUrl}/${workspace}/artifacts/${artifactAlias}/create-zip-file`;

      window.open(zipUrl, "_blank");
    } catch (err) {
      console.error("Failed to create zip:", err);
      setStatusMessage({ type: 'error', text: `Failed to create zip: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const toggleDirectory = async (fullPath: string) => {
    if (expandedDirs[fullPath]) {
      const newExpanded = { ...expandedDirs };
      delete newExpanded[fullPath];
      setExpandedDirs(newExpanded);
    } else {
      const children = await loadFiles(fullPath);
      setExpandedDirs({ ...expandedDirs, [fullPath]: children });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-gray-900 truncate">{sessionName}</h2>
              <p className="text-xs text-gray-400 font-mono truncate">{sessionId}</p>
            </div>
            {/* Status Badge */}
            {canUpload ? (
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-amber-200">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                Staged
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-emerald-200">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Committed
              </span>
            )}
          </div>

          {/* Stage/Commit Actions */}
          <div className="flex items-center gap-2 ml-4">
            {canUpload ? (
              <>
                <button
                  onClick={handleCommitArtifact}
                  disabled={operationLoading === 'commit'}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {operationLoading === 'commit' ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Commit
                </button>
                <button
                  onClick={handleDiscardArtifact}
                  disabled={operationLoading === 'discard'}
                  className="px-3 py-1.5 bg-white text-orange-600 text-xs font-medium rounded-lg hover:bg-orange-50 disabled:opacity-50 flex items-center gap-1.5 transition-colors border border-orange-200"
                >
                  {operationLoading === 'discard' ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  Discard
                </button>
              </>
            ) : (
              <button
                onClick={handleStageArtifact}
                disabled={operationLoading === 'stage'}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                {operationLoading === 'stage' ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
                Stage for Editing
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        {uploading && (
          <div className="w-full bg-gray-100 h-1">
            <div
              className="bg-gradient-to-r from-indigo-500 to-blue-500 h-1 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-sm flex items-center gap-2 ${
            statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' :
            statusMessage.type === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            {statusMessage.type === 'success' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {statusMessage.type === 'error' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {statusMessage.type === 'info' && (
              <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Area */}
        <>
          {/* File Toolbar */}
            <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !canUpload}
                className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Files
              </button>

              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={uploading || !canUpload}
                className="px-3 py-2 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors border border-gray-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Upload Folder
              </button>

              <button
                onClick={() => handleCreateFolder("")}
                disabled={uploading || !canUpload}
                className="px-3 py-2 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors border border-gray-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                New Folder
              </button>

              <div className="h-6 w-px bg-gray-200 mx-1"></div>

              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) {
                    setSelectedFiles(new Set());
                  }
                }}
                className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
                  isSelectionMode
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                {isSelectionMode ? 'Cancel' : 'Select'}
              </button>

              {isSelectionMode && (
                <>
                  <button
                    onClick={selectAllFiles}
                    className="px-2.5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllFiles}
                    disabled={selectedFiles.size === 0}
                    className="px-2.5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  >
                    None
                  </button>
                  {selectedFiles.size > 0 && (
                    <span className="text-xs text-gray-500">
                      {selectedFiles.size} selected
                    </span>
                  )}
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedFiles.size === 0 || operationLoading === 'batch-delete'}
                    className="px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {operationLoading === 'batch-delete' ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    Delete
                  </button>
                </>
              )}

              <div className="flex-1"></div>

              <button
                onClick={handleCreateZip}
                className="px-3 py-2 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors border border-gray-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download ZIP
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: "", directory: "" } as any)}
                className="hidden"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
              />
            </div>

            {/* File Tree Area */}
            <div
              className="flex-1 overflow-y-auto p-4 relative"
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, "")}
            >
              {dragCounter > 0 && (
                <div className="absolute inset-4 bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-xl flex items-center justify-center z-10 pointer-events-none">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto text-indigo-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-lg font-medium text-indigo-600">Drop files here</p>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <svg className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-gray-500">Loading files...</p>
                  </div>
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-gray-900 mb-1">No files yet</p>
                  <p className="text-sm text-gray-500">Upload files or drag and drop to get started</p>
                </div>
              ) : (
                <FileTreeComponent
                  files={files}
                  expandedDirs={expandedDirs}
                  onToggle={toggleDirectory}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onUpload={handleUpload}
                  onCreateFolder={handleCreateFolder}
                  onDrop={handleDrop}
                  parentPath=""
                  isSelectionMode={isSelectionMode}
                  selectedFiles={selectedFiles}
                  onToggleSelection={toggleFileSelection}
                />
              )}
            </div>
          </>

        {/* Upload Progress Indicator */}
        {uploading && (
          <div className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-lg border border-gray-200 flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-medium text-gray-700">Uploading...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// File Tree Component
function FileTreeComponent({
  files,
  expandedDirs,
  onToggle,
  onDownload,
  onDelete,
  onUpload,
  onCreateFolder,
  onDrop,
  parentPath,
  isSelectionMode,
  selectedFiles,
  onToggleSelection,
}: {
  files: FileItem[];
  expandedDirs: Record<string, FileItem[]>;
  onToggle: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string, type: string) => void;
  onUpload: (files: FileList, path: string) => void;
  onCreateFolder: (path: string) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  parentPath: string;
  isSelectionMode: boolean;
  selectedFiles: Set<string>;
  onToggleSelection: (path: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {files.map((file) => {
        const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;
        const isExpanded = !!expandedDirs[fullPath];
        const isDirectory = file.type === 'directory';
        const isSelected = selectedFiles.has(fullPath);

        return (
          <div key={fullPath}>
            <div
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'
              }`}
              onClick={() => isSelectionMode && onToggleSelection(fullPath)}
            >
              {/* Checkbox for selection mode */}
              {isSelectionMode && (
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-gray-300 hover:border-indigo-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(fullPath);
                  }}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )}

              {isDirectory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(fullPath);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {isDirectory ? (
                  <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <span className="text-sm text-gray-700 truncate font-medium">{file.name}</span>
                {file.size !== undefined && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                )}
              </div>

              {!isSelectionMode && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isDirectory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(fullPath);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(fullPath, file.type);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {isExpanded && expandedDirs[fullPath] && (
              <div className="ml-6 pl-3 border-l-2 border-gray-100">
                <FileTreeComponent
                  files={expandedDirs[fullPath]}
                  expandedDirs={expandedDirs}
                  onToggle={onToggle}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onUpload={onUpload}
                  onCreateFolder={onCreateFolder}
                  onDrop={onDrop}
                  parentPath={fullPath}
                  isSelectionMode={isSelectionMode}
                  selectedFiles={selectedFiles}
                  onToggleSelection={onToggleSelection}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
