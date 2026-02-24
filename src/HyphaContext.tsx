import React, { createContext, useContext, useEffect, useState } from 'react';
import { HyphaCore } from 'hypha-core';
// Add WinBox type declaration
declare global {
  interface Window {
    WinBox: any;
    HyphaCore: any;
  }
}

// We're not using the HyphaClient type since we couldn't find the module
interface HyphaContextType {
  hyphaClient: any | null;
  setHyphaClient: (client: any | null) => void;
  hyphaCoreAPI: any | null;
  isHyphaCoreReady: boolean;
}

// HyphaCore window configuration type
interface WindowConfig {
  name?: string;
  src: string;
  window_id: string;
  [key: string]: any;
}

const HyphaContext = createContext<HyphaContextType | undefined>(undefined);

// Singleton promise to prevent double initialization in StrictMode
let hyphaInitPromise: Promise<any> | null = null;
let hyphaApiInstance: any | null = null;

export function useHyphaContext() {
  const context = useContext(HyphaContext);
  if (context === undefined) {
    throw new Error('useHyphaContext must be used within a HyphaProvider');
  }
  return context;
}

export function HyphaProvider({ children }: { children: React.ReactNode }) {
  const [hyphaClient, setHyphaClient] = useState<any | null>(null);
  const [hyphaCoreAPI, setHyphaCoreAPI] = useState<any | null>(null);
  const [isHyphaCoreReady, setIsHyphaCoreReady] = useState<boolean>(false);

  // Initialize hypha-core
  useEffect(() => {
    const initHyphaCore = async () => {
      // If we already have the API instance, just use it
      if (hyphaApiInstance) {
        setHyphaCoreAPI(hyphaApiInstance);
        setIsHyphaCoreReady(true);
        return;
      }

      // If initialization is already in progress, wait for it
      if (hyphaInitPromise) {
        try {
          const api = await hyphaInitPromise;
          setHyphaCoreAPI(api);
          setIsHyphaCoreReady(true);
        } catch (err) {
          console.error("Failed to await existing HyphaCore initialization:", err);
        }
        return;
      }

      // Start new initialization
      hyphaInitPromise = (async () => {
        try {
          // Initialize HyphaCore
          const hyphaCore = new HyphaCore();
          // Start hypha-core and get the API
          const api = await hyphaCore.start();
          
          hyphaApiInstance = api;
          setHyphaCoreAPI(api);
          setIsHyphaCoreReady(true);
          console.log("HyphaCore initialized successfully");
          return api;
        } catch (error: any) {
          // Handle "Server already running" specifically
          if (error?.toString().includes("Server already running")) {
            console.log("HyphaCore server already running (reusing existing connection)");
            setIsHyphaCoreReady(true);
            // We might miss the API object here if we can't retrieve it, 
            // but at least we don't crash.
            return null;
          }
          console.error("Failed to initialize HyphaCore:", error);
          throw error;
        }
      })();
    };
    
    // Helper function to load scripts
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (e) => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };
    
    initHyphaCore();
    
    // Cleanup function
    return () => {
      // Add any cleanup code for HyphaCore if needed
    };
  }, []);

  return (
    <HyphaContext.Provider value={{ 
      hyphaClient, 
      setHyphaClient,
      hyphaCoreAPI,
      isHyphaCoreReady
    }}>
      {children}
    </HyphaContext.Provider>
  );
} 