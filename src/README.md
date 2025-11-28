# Kernel Integration for 24agents.science

This folder contains the necessary files to implement dataset mounting and kernel starting functionality.

## Installation

1.  Install the `web-python-kernel` package:
    ```bash
    npm install web-python-kernel
    ```

2.  Copy the `src` folder contents to your project's `src` folder, merging with existing folders.

3.  **IMPORTANT**: You must copy the following files from the `safe-data-share` project's `public` folder to your project's `public` folder:
    - `public/kernel.worker.js`
    - `public/web-python-kernel.mjs`
    - `public/pypi/` (folder and its contents)

    These files are required for the web worker to function correctly.

## Usage

1.  Wrap your application (or the part that needs the kernel) with `KernelProvider`:
    ```tsx
    import { KernelProvider } from './src/contexts/KernelContext';

    function App() {
      return (
        <KernelProvider>
          <YourComponent />
        </KernelProvider>
      );
    }
    ```

2.  In your component, use `useKernel` to access the kernel:
    ```tsx
    import { useKernel } from './src/contexts/KernelContext';
    import { DATASET_STARTUP_SCRIPT } from './src/lib/datasetStartup';

    function YourComponent() {
      const { 
        startKernel, 
        mountFolder, 
        executeCode, 
        isReady, 
        kernelStatus 
      } = useKernel();

      const handleStart = async () => {
        // 1. Start the kernel
        await startKernel();
      };

      const handleMount = async () => {
        // 2. Pick a folder
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        
        // 3. Mount it
        await mountFolder(dirHandle);
        
        // 4. Run startup script (optional)
        await executeCode(DATASET_STARTUP_SCRIPT);
      };

      return (
        <div>
          <button onClick={handleStart} disabled={isReady}>Start Kernel</button>
          <button onClick={handleMount} disabled={!isReady}>Mount Dataset</button>
          <div>Status: {kernelStatus}</div>
        </div>
      );
    }
    ```

## Notes

- The `dataset_startup_script.py` has been simplified to remove the privacy agent integration.
- Ensure your `vite.config.ts` (or equivalent) supports importing files with `?raw` suffix (standard in Vite).
