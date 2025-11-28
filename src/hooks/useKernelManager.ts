/**
 * Hook for managing kernel state and operations using web-python-kernel
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { KernelManager, KernelMode, KernelLanguage, KernelEvents } from 'web-python-kernel';
import { KernelManagerType, KernelInfo, KernelExecutionLog, ExecuteCodeCallbacks } from '../utils/agentLabTypes';
import { createKernelResetCode } from '../utils/kernelUtils';

// Simple toast replacement for standalone usage
const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'loading' | 'info' = 'info') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
};

interface UseKernelManagerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server?: any; // Keep for API compatibility but won't be used
  clearRunningState?: () => void;
  onKernelReady?: (executeCode: (code: string, callbacks?: ExecuteCodeCallbacks, timeout?: number) => Promise<void>) => void;
  autoStart?: boolean;
}

export const useKernelManager = ({ clearRunningState, onKernelReady, autoStart = false }: UseKernelManagerProps) => {
  const [isReady, setIsReady] = useState(false);
  const [kernelStatus, setKernelStatus] = useState<'idle' | 'busy' | 'starting' | 'error'>('starting');
  const [executeCode, setExecuteCode] = useState<((code: string, callbacks?: ExecuteCodeCallbacks, timeout?: number) => Promise<void>) | null>(null);
  const [kernelInfo, setKernelInfo] = useState<KernelInfo>({});
  const [kernelExecutionLog, setKernelExecutionLog] = useState<KernelExecutionLog[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);

  // Add ref to store executeCode function to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const executeCodeRef = useRef<any>(null);
  // Add ref to store the web-python-kernel manager and kernel ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kernelManagerRef = useRef<any>(null);
  const currentKernelIdRef = useRef<string | null>(null);
  // Add ref to prevent multiple initializations
  const isInitializingRef = useRef(false);
  // Add ref to store onKernelReady callback to prevent dependency issues
  const onKernelReadyRef = useRef(onKernelReady);

  // Buffers for stdout and stderr to handle chunked output
  const stdoutBufferRef = useRef<string>('');
  const stderrBufferRef = useRef<string>('');

  // Update the onKernelReady ref when it changes
  useEffect(() => {
    onKernelReadyRef.current = onKernelReady;
  }, [onKernelReady]);

  // Function to update kernel log
  const addKernelLogEntry = useCallback((entryData: Omit<KernelExecutionLog, 'timestamp'>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newEntry: any = {
      ...entryData,
      timestamp: Date.now(),
    };
    setKernelExecutionLog(prevLog => [...prevLog, newEntry]);
  }, []);

  const clearLogs = useCallback(() => {
    setKernelExecutionLog([]);
  }, []);

  // Helper to process buffer and emit lines
  const processBuffer = useCallback((
    bufferRef: React.MutableRefObject<string>, 
    type: 'stdout' | 'stderr', 
    callbacks?: ExecuteCodeCallbacks
  ) => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    // Split by newline
    const lines = buffer.split('\n');
    
    const remainder = lines.pop() || '';
    
    // Emit all complete lines
    lines.forEach(line => {
      if (line.length > 0) {
        const output = {
          type,
          content: line,
          short_content: line
        };
        addKernelLogEntry(output);
        if (callbacks?.onOutput) callbacks.onOutput(output);
      }
    });
    
    bufferRef.current = remainder;
  }, [addKernelLogEntry]);

  // Function to dynamically load web-python-kernel module
  const loadWebPythonKernel = useCallback(async () => {
    if (kernelManagerRef.current) {
      return kernelManagerRef.current;
    }

    try {
      console.log('[Web Python Kernel] Loading kernel module...');
      
      // Create kernel manager with local worker URL
      const workerUrl = `/kernel.worker.js`;

      const manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'auto',
        workerUrl, 
        pool: {
          enabled: false,
          poolSize: 0,
          autoRefill: false
        }
      });

      kernelManagerRef.current = { manager, KernelMode, KernelLanguage, KernelEvents };
      return kernelManagerRef.current;
    } catch (error) {
      console.error('[Web Python Kernel] Failed to load kernel module:', error);
      throw error;
    }
  }, []);

  // Create executeCode function that wraps the kernel execution
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createExecuteCodeFunction = useCallback((manager: any, kernelId: string) => {
    return async (code: string, callbacks?: ExecuteCodeCallbacks, _timeout?: number) => {
      let hasError = false;

      try {
        setKernelStatus('busy');

        const stream = manager.executeStream(kernelId, code);

        for await (const event of stream) {
          // Handle different event types
          switch (event.type) {
            case 'stream':
              if (event.data.name === 'stdout') {
                stdoutBufferRef.current += event.data.text;
                processBuffer(stdoutBufferRef, 'stdout', callbacks);
              } else if (event.data.name === 'stderr') {
                stderrBufferRef.current += event.data.text;
                processBuffer(stderrBufferRef, 'stderr', callbacks);
              }
              break;

            case 'execute_result':
              if (event.data && event.data.data) {
                const textPlain = event.data.data['text/plain'];

                // Don't display None results (standard Jupyter behavior)
                if (textPlain && textPlain !== 'None') {
                  const output = {
                    type: 'result',
                    content: textPlain,
                    short_content: textPlain
                  };
                  addKernelLogEntry(output);
                  if (callbacks?.onOutput) callbacks.onOutput(output);
                } else if (!textPlain) {
                  // Fallback to JSON stringify if text/plain is missing
                  const result = JSON.stringify(event.data.data);
                  const output = {
                    type: 'result',
                    content: result,
                    short_content: result
                  };
                  addKernelLogEntry(output);
                  if (callbacks?.onOutput) callbacks.onOutput(output);
                }
              }
              break;

            case 'display_data':
              if (event.data && event.data.data) {
                if (event.data.data['image/png']) {
                  const output = {
                    type: 'image',
                    content: `data:image/png;base64,${event.data.data['image/png']}`,
                    short_content: '[Image]'
                  };
                  addKernelLogEntry(output);
                  if (callbacks?.onOutput) callbacks.onOutput(output);
                } else if (event.data.data['text/html']) {
                  const output = {
                    type: 'html',
                    content: event.data.data['text/html'],
                    short_content: '[HTML]'
                  };
                  addKernelLogEntry(output);
                  if (callbacks?.onOutput) callbacks.onOutput(output);
                } else if (event.data.data['text/plain']) {
                  const plainText = event.data.data['text/plain'];
                  const output = {
                    type: 'result',
                    content: plainText,
                    short_content: plainText
                  };
                  addKernelLogEntry(output);
                  if (callbacks?.onOutput) callbacks.onOutput(output);
                }
              }
              break;

            case 'execute_error':
            case 'error': {
              hasError = true;
              // Output error messages using onOutput callback
              const errorMsg = event.data
                ? `${event.data.ename || 'Error'}: ${event.data.evalue || 'Unknown error'}`
                : 'Execution failed';
              
              const errorOutput = {
                type: 'error',
                content: errorMsg,
                short_content: errorMsg
              };
              addKernelLogEntry(errorOutput);
              if (callbacks?.onOutput) callbacks.onOutput(errorOutput);

              if (event.data?.traceback) {
                event.data.traceback.forEach((line: string) => {
                  const tracebackOutput = {
                    type: 'stderr',
                    content: line,
                    short_content: line
                  };
                  addKernelLogEntry(tracebackOutput);
                  if (callbacks?.onOutput) callbacks.onOutput(tracebackOutput);
                });
              }
              break;
            }
          }
        }

        // Flush remaining buffers
        if (stdoutBufferRef.current) {
          const line = stdoutBufferRef.current;
          if (line.length > 0) {
             const output = {
              type: 'stdout',
              content: line,
              short_content: line
            };
            addKernelLogEntry(output);
            if (callbacks?.onOutput) callbacks.onOutput(output);
          }
          stdoutBufferRef.current = '';
        }
        if (stderrBufferRef.current) {
          const line = stderrBufferRef.current;
          if (line.length > 0) {
             const output = {
              type: 'stderr',
              content: line,
              short_content: line
            };
            addKernelLogEntry(output);
            if (callbacks?.onOutput) callbacks.onOutput(output);
          }
          stderrBufferRef.current = '';
        }

        setKernelStatus('idle');

        // Signal completion via onStatus callback
        if (callbacks?.onStatus) {
          if (hasError) {
            callbacks.onStatus('Error');
          } else {
            callbacks.onStatus('Completed');
          }
        }

      } catch (error) {
        setKernelStatus('idle');
        console.error('[Web Python Kernel] Execution error:', error);

        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorOutput = {
          type: 'error',
          content: errorMsg,
          short_content: errorMsg
        };
        addKernelLogEntry(errorOutput);
        
        if (callbacks?.onOutput) {
          callbacks.onOutput(errorOutput);
        }

        // Signal error via onStatus callback
        if (callbacks?.onStatus) {
          callbacks.onStatus('Error');
        }
      }
    };
  }, [addKernelLogEntry, processBuffer]);

  // Function to initialize the executeCode function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initializeExecuteCode = useCallback((manager: any, kernelInfo: KernelInfo) => {
    const kernelId = kernelInfo.kernelId || kernelInfo.id;
    if (!kernelId) {
      console.error('[Web Python Kernel] Cannot initialize executeCode: no kernel ID');
      return;
    }

    const executeCodeFn = createExecuteCodeFunction(manager, kernelId);

    setExecuteCode(() => executeCodeFn);
    executeCodeRef.current = executeCodeFn;

    // Call onKernelReady callback
    onKernelReadyRef.current?.(executeCodeFn);
  }, [createExecuteCodeFunction]);

  // Define startKernel (was initializeKernel)
  const startKernel = useCallback(async () => {
    // Prevent multiple concurrent initializations
    if (isInitializingRef.current) {
      console.log('[Web Python Kernel] Initialization already in progress, skipping...');
      return;
    }

    // Mark as initializing
    isInitializingRef.current = true;

    const initTimeout = setTimeout(() => {
      console.error('[Web Python Kernel] Initialization timeout after 180 seconds');
      setKernelStatus('error');
      setIsReady(false);
      showToast('Kernel initialization timed out. Please try restarting.', 'error');
      isInitializingRef.current = false;
    }, 180000); // 180 second timeout

    try {
      setKernelStatus('starting');
      console.log('[Web Python Kernel] Initializing web-python-kernel...');

      // Load the kernel module
      const { manager, KernelMode, KernelLanguage, KernelEvents } = await loadWebPythonKernel();

      console.log('[Web Python Kernel] Creating kernel...');

      // Create a new kernel
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON,
        autoSyncFs: true,
      });

      console.log('[Web Python Kernel] Created kernel:', kernelId);

      // Store kernel ID
      currentKernelIdRef.current = kernelId;

      // Set up event listeners
      manager.onKernelEvent(kernelId, KernelEvents.KERNEL_BUSY, () => {
        setKernelStatus('busy');
      });

      manager.onKernelEvent(kernelId, KernelEvents.KERNEL_IDLE, () => {
        setKernelStatus('idle');
      });

      // Clear the timeout since we succeeded
      clearTimeout(initTimeout);

      // Update state
      const newKernelInfo = { kernelId, id: kernelId };
      setKernelInfo(newKernelInfo);
      setKernelStatus('idle');
      setIsReady(true);

      // Initialize the executeCode function
      initializeExecuteCode(manager, newKernelInfo);

      console.log('[Web Python Kernel] Kernel initialization completed successfully');

      // Reset initialization flag
      isInitializingRef.current = false;
    } catch (error) {
      clearTimeout(initTimeout);
      console.error('[Web Python Kernel] Initialization error:', error);
      setKernelStatus('error');
      setIsReady(false);

      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`Kernel initialization failed: ${errorMessage}`, 'error');

      // Reset initialization flag on error
      isInitializingRef.current = false;
    }
  }, [loadWebPythonKernel, initializeExecuteCode]);

  // Kernel initialization
  useEffect(() => {
    if (autoStart) {
      startKernel();
    }
  }, [autoStart, startKernel]);

  // Function to destroy current kernel
  const destroyCurrentKernel = useCallback(async () => {
    const manager = kernelManagerRef.current?.manager;
    const kernelId = currentKernelIdRef.current;

    if (!manager || !kernelId) return;

    try {
      console.log('[Web Python Kernel] Destroying current kernel:', kernelId);
      await manager.destroyKernel(kernelId);
      currentKernelIdRef.current = null;
    } catch (error) {
      console.warn('[Web Python Kernel] Error destroying kernel:', error);
    }
  }, []);

  // Function to interrupt kernel execution
  const interruptKernel = useCallback(async () => {
    const manager = kernelManagerRef.current?.manager;
    const kernelId = currentKernelIdRef.current;

    if (!manager || !kernelId) {
      showToast('No active kernel to interrupt', 'warning');
      return false;
    }

    try {
      showToast('Interrupting kernel execution...', 'loading');
      console.log('[Web Python Kernel] Interrupting kernel:', kernelId);
      const success = await manager.interruptKernel(kernelId);

      if (success) {
        showToast('Kernel execution interrupted', 'success');
      } else {
        showToast('Failed to interrupt kernel execution', 'error');
      }

      return success;
    } catch (error) {
      console.error('[Web Python Kernel] Error interrupting kernel:', error);
      showToast('Error interrupting kernel execution', 'error');
      return false;
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restartKernel = useCallback(async (options?: any) => {
    let manager = kernelManagerRef.current?.manager;
    let { KernelMode, KernelLanguage, KernelEvents } = kernelManagerRef.current || {};
    
    if (!manager) {
      try {
        const loaded = await loadWebPythonKernel();
        manager = loaded.manager;
        KernelMode = loaded.KernelMode;
        KernelLanguage = loaded.KernelLanguage;
        KernelEvents = loaded.KernelEvents;
      } catch (error) {
        showToast('Failed to load kernel manager', 'error');
        return;
      }
    }

    const kernelId = currentKernelIdRef.current;

    if (!manager || !KernelMode || !KernelLanguage) {
      showToast('Kernel manager not initialized', 'error');
      return;
    }

    showToast('Restarting kernel...', 'loading');

    try {
      setKernelStatus('starting');

      // Destroy current kernel if it exists
      if (kernelId) {
        try {
          await manager.destroyKernel(kernelId);
        } catch (error) {
          console.warn('[Web Python Kernel] Error destroying old kernel:', error);
        }
      }

      // Create a new kernel
      const newKernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON,
        autoSyncFs: true,
        ...options
      });

      console.log('[Web Python Kernel] Created new kernel:', newKernelId);

      // Store kernel ID
      currentKernelIdRef.current = newKernelId;

      // Re-setup event listeners
      manager.onKernelEvent(newKernelId, KernelEvents.KERNEL_BUSY, () => {
        setKernelStatus('busy');
      });

      manager.onKernelEvent(newKernelId, KernelEvents.KERNEL_IDLE, () => {
        setKernelStatus('idle');
      });

      // Update state
      const newKernelInfo = { kernelId: newKernelId, id: newKernelId };
      setKernelInfo(newKernelInfo);
      setKernelStatus('idle');
      setIsReady(true);

      // Initialize the executeCode function
      initializeExecuteCode(manager, newKernelInfo);

      // Clear any running cell states after successful restart
      if (clearRunningState) {
        clearRunningState();
        console.log('[Web Python Kernel] Cleared running cell states after restart');
      }

      showToast('Kernel restarted successfully', 'success');

    } catch (error) {
      console.error('Failed to restart kernel:', error);
      setKernelStatus('error');
      setIsReady(false);
      showToast(`Failed to restart kernel: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [initializeExecuteCode, clearRunningState, loadWebPythonKernel]);

  const resetKernelState = useCallback(async () => {
    if (!isReady) {
      // If kernel isn't ready, perform a full restart
      console.warn('Kernel not ready, performing full restart instead of reset.');
      await restartKernel();
      return;
    }

    showToast('Resetting kernel state...', 'loading');
    try {
      setKernelStatus('busy');

      const resetCode = createKernelResetCode();

      // Use our executeCode function from ref to run the reset command
      const currentExecuteCode = executeCodeRef.current;
      if (currentExecuteCode) {
        await currentExecuteCode(resetCode, {
          onOutput: (output: { type: string; content: string; short_content?: string }) => {
            console.log('[Web Python Kernel Reset]', output);
          },
          onStatus: (status: string) => {
            console.log('[Web Python Kernel Reset] Status:', status);
          }
        });
      }

      // Update status
      setKernelStatus('idle');

      showToast('Kernel state reset successfully', 'success');
    } catch (error) {
      console.error('Failed to reset kernel state:', error);
      setKernelStatus('error');
      showToast('Failed to reset kernel state', 'error');
    }
  }, [isReady, restartKernel]);

  // Function to mount a local folder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountFolder = useCallback(async (dirHandle: any) => {
    const manager = kernelManagerRef.current?.manager;
    const kernelId = currentKernelIdRef.current;

    if (!manager || !kernelId) {
      throw new Error('Kernel not initialized');
    }

    // Get the kernel instance
    const kernel = manager.getKernel(kernelId);
    
    if (!kernel || !kernel.kernel.mountFS) {
       throw new Error('Kernel does not support file system mounting');
    }

    console.log('[Web Python Kernel] Mounting directory handle to /data...');
    await kernel.kernel.mountFS('/data', dirHandle, 'readwrite');
    console.log('[Web Python Kernel] Directory mounted successfully');
  }, []);

  return {
    isReady,
    kernelStatus,
    kernelInfo,
    executeCode,
    restartKernel,
    resetKernelState,
    initializeExecuteCode,
    addKernelLogEntry,
    kernelExecutionLog,
    interruptKernel,
    destroyCurrentKernel,
    mountFolder,
    startKernel,
    clearLogs,
    activeDatasetId,
    setActiveDatasetId
  };
};
