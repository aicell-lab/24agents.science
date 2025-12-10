import React, { createContext, useContext, ReactNode } from 'react';
import { useKernelManager } from '../hooks/useKernelManager';
import { KernelInfo, KernelExecutionLog, ExecuteCodeCallbacks } from '../types/kernel';

interface KernelContextType {
  isReady: boolean;
  kernelStatus: 'idle' | 'busy' | 'starting' | 'error';
  kernelInfo: KernelInfo;
  executeCode: ((code: string, callbacks?: ExecuteCodeCallbacks, timeout?: number) => Promise<void>) | null;
  restartKernel: (options?: any) => Promise<void>;
  resetKernelState: () => Promise<void>;
  initializeExecuteCode: (manager: any, kernelInfo: KernelInfo) => void;
  addKernelLogEntry: (entryData: Omit<KernelExecutionLog, 'timestamp'>) => void;
  kernelExecutionLog: KernelExecutionLog[];
  interruptKernel: () => Promise<boolean>;
  destroyCurrentKernel: () => Promise<void>;
  mountFolder: (dirHandle: any) => Promise<void>;
  startKernel: () => Promise<void>;
  clearLogs: () => void;
  activeDatasetId: string | null;
  setActiveDatasetId: (id: string | null) => void;
}

const KernelContext = createContext<KernelContextType | undefined>(undefined);

export const KernelProvider = ({ children }: { children: ReactNode }) => {
  const kernelManager = useKernelManager({
    onKernelReady: () => {
      console.log('Kernel is ready');
    },
    autoStart: false
  });

  return (
    <KernelContext.Provider value={kernelManager}>
      {children}
    </KernelContext.Provider>
  );
};

export const useKernel = () => {
  const context = useContext(KernelContext);
  if (context === undefined) {
    throw new Error('useKernel must be used within a KernelProvider');
  }
  return context;
};
