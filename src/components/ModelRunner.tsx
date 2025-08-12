import React, { useState, useEffect } from 'react';
import { useHyphaContext } from '../HyphaContext';
import { useHyphaStore } from '../store/hyphaStore';
import { ImagejJsController } from '../utils/viewerControl';
import { 
  ModelRunnerEngine, 
  getRdfTensorUrl, 
  rdfHasTensor, 

} from '../utils/modelRun';
import { imjoyToTfjs, inferImgAxesViaSpec, mapAxes, parseAxes, isImg2Img, processForShow } from '../utils/imgProcess';
import ModelTester from './ModelTester';

// Extend the ModelRunnerEngine type to properly type the runTiles method
interface ExtendedModelRunnerEngine extends ModelRunnerEngine {
  runTiles: (
    tensor: any,
    inputSpec: any,
    outputSpec: any,
    tileSizes: any,
    tileOverlaps: any,
    additionalParameters?: any,
    reportFunc?: (msg: string) => void,
    enableTiling?: boolean
  ) => Promise<any>;
  init: (token?: string | null, serviceId?: string) => Promise<void>;
}

// Define interfaces for RDF structure
interface AxisSpec {
  type: 'batch' | 'channel' | 'space';
  id?: string;
  size?: {
    min: number;
    step?: number;
  };
  halo?: number;
  channel_names?: string[];
  scale?: number;
  concatenable?: boolean;
}

interface ModelInputSpec {
  axes: string | AxisSpec[];
  data_type?: string;
  shape?: {
    min: number[];
    step?: number[];
  };
  data?: {
    type: string;
  };
  test_tensor?: {
    source: string;
    sha256?: string;
  };
  sample_tensor?: {
    source: string;
    sha256?: string;
  };
  id?: string;
}

interface ModelOutputSpec {
  axes: string | AxisSpec[];
  halo?: number[];
  test_tensor?: {
    source: string;
    sha256?: string;
  };
  sample_tensor?: {
    source: string;
    sha256?: string;
  };
  id?: string;
}

interface ModelRDF {
  id: string;
  name: string;
  description?: string;
  inputs: ModelInputSpec[];
  outputs: ModelOutputSpec[];
  test_inputs?: string[];
  test_outputs?: string[];
  sample_inputs?: string[];
  sample_outputs?: string[];
  [key: string]: any; // Allow other properties
}

// Helper function to check if an object has a property
const rdfHas = (rdf: ModelRDF | null, key: string): boolean => {
  return rdfHasTensor(rdf, key);
};

interface ModelRunnerProps {
  artifactId?: string;
  isStaged?: boolean;
  isDisabled?: boolean;
  className?: string;
  onRunStateChange?: (isRunning: boolean) => void;
  createContainerCallback?: (containerId: string) => string;
  modelUrl?: string;
}

const ModelRunner: React.FC<ModelRunnerProps> = ({ 
  artifactId, 
  isStaged = false,
  isDisabled = false, 
  className = '',
  onRunStateChange,
  createContainerCallback,
  modelUrl
}) => {
  const { hyphaCoreAPI, isHyphaCoreReady } = useHyphaContext();
  const { isLoggedIn } = useHyphaStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [viewerControl, setViewerControl] = useState<ImagejJsController | null>(null);
  const [runner, setRunner] = useState<ExtendedModelRunnerEngine | null>(null);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [isError, setIsError] = useState<boolean>(false);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [inputLoaded, setInputLoaded] = useState<boolean>(false);
  const [tilingEnabled, setTilingEnabled] = useState<boolean>(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  
  // Advanced settings
  const [tileSize, setTileSize] = useState<number>(512);
  const [serverUrl, setServerUrl] = useState<string>("https://hypha.aicell.io");
  const [serviceId, setServiceId] = useState<string>("24agents-science/model-runner");
  const [token, setToken] = useState<string>("");
  
  // Button states
  const [buttonEnabledRun, setButtonEnabledRun] = useState<boolean>(false);
  const [buttonEnabledInput, setButtonEnabledInput] = useState<boolean>(false);
  const [buttonEnabledOutput, setButtonEnabledOutput] = useState<boolean>(false);
  const [modelInitialized, setModelInitialized] = useState<boolean>(false);

  // Auto-initialize when component mounts
  useEffect(() => {
    if (artifactId && hyphaCoreAPI && isHyphaCoreReady && isLoggedIn && !isRunning && !isLoading) {
      setupRunner();
    }
  }, [artifactId, hyphaCoreAPI, isHyphaCoreReady, isLoggedIn]);

  // Add spinner animation CSS
  useEffect(() => {
    const styleId = 'model-runner-spinner-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes modelRunnerSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  const setInfoPanel = (message: string, waiting: boolean = false, error: boolean = false) => {
    setInfoMessage(message);
    setIsWaiting(waiting);
    setIsError(error);
  };

  const updateButtonStates = (enabled: boolean, modelRunner = runner) => {
    if (!modelRunner?.rdf) {
      setButtonEnabledRun(false);
      setButtonEnabledInput(false);
      setButtonEnabledOutput(false);
    } else {
      setButtonEnabledRun(enabled);
      setButtonEnabledInput(enabled && (
        rdfHas(modelRunner.rdf as ModelRDF, "test_inputs") || 
        rdfHas(modelRunner.rdf as ModelRDF, "sample_inputs")
      ));
      setButtonEnabledOutput(enabled && (
        rdfHas(modelRunner.rdf as ModelRDF, "test_outputs") || 
        rdfHas(modelRunner.rdf as ModelRDF, "sample_outputs")
      ));
    }
  };

  // Initialize button states - all disabled before model initialization
  useEffect(() => {
    if (!modelInitialized) {
      setButtonEnabledRun(false);
      setButtonEnabledInput(false);
      setButtonEnabledOutput(false);
    }
  }, [modelInitialized]);

  const initModel = async (modelId: string, modelRunner = runner) => {
    if (!modelRunner) return;
    
    setInfoPanel(`Initializing model ${modelId}...`, true);
    updateButtonStates(false, modelRunner);
    
    try {
      await modelRunner.loadModel(modelId);
      // Update any model parameters if needed
      // This would be similar to the parametersStore.$patch in the Vue example
      
      setModelInitialized(true);
      updateButtonStates(true, modelRunner);
      setInfoPanel("");
    } catch (e) {
      setInfoPanel(`Failed to load model ${modelId}.`, false, true);
      console.error(e);
    }
  };

  const runModel = async () => {
    if (!artifactId || !hyphaCoreAPI || !isHyphaCoreReady || !runner || !viewerControl) {
      console.error('Cannot run model: Missing dependencies');
      return;
    }

    setIsLoading(true);
    setButtonEnabledRun(false);
    setInfoPanel("Running the model...", true);

    try {
      // Get the input image from the viewer
      const img = await viewerControl.getImage();
      
      // Get the RDF specs
      const rdf = runner.rdf as ModelRDF;
      const inputSpec = rdf.inputs[0];
      const outputSpec = rdf.outputs[0];
      
      // Infer the image axes and reshape the tensor to match input spec
      const imgAxes = inferImgAxesViaSpec(img._rshape, inputSpec.axes, true);
      console.log("Input image axes:", imgAxes);
      console.log("Reshaping image to match the input spec");
      
      // Convert image to tensor and reshape
      const tensor = imjoyToTfjs(img);
      const reshapedTensor = mapAxes(tensor, imgAxes, parseAxes(inputSpec));
      
      // Use custom tile size if tiling is enabled, otherwise use defaults
      let tileSizes = runner.getDefaultTileSizes();
      const tileOverlaps = runner.getDefaultTileOverlaps();
      
      // Override tile sizes if tiling is enabled and custom size is set
      if (tilingEnabled && tileSize > 0) {
        // Apply custom tile size to spatial dimensions (x, y)
        if ('x' in tileSizes) tileSizes.x = tileSize;
        if ('y' in tileSizes) tileSizes.y = tileSize;
      }
      
      // Create parameters store object with default values
      const parametersStore = {
        tileSizes,
        tileOverlaps,
        additionalParameters: undefined as any
      };
      
      // Run the model with or without tiling
      const outTensor = await runner.runTiles(
        reshapedTensor,
        inputSpec,
        outputSpec,
        parametersStore.tileSizes,
        parametersStore.tileOverlaps,
        parametersStore.additionalParameters,
        (msg: string) => setInfoPanel(msg, true),
        tilingEnabled
      );
      
      // Display the results
      if (runner.isImg2Img()) {
        // Image segmentation/transformation model
        const imgsForShow = processForShow(outTensor, outputSpec.axes);
        await viewerControl.showImgs(imgsForShow, "output");
      } else {
        // Classification model
        await viewerControl.showTableFromTensor(outTensor, "output");
      }
      
      setInfoPanel("Model execution completed successfully!");
    } catch (error) {
      console.error('Failed to run model:', error);
      setInfoPanel("Failed to run the model. See console for details.", false, true);
    } finally {
      setIsLoading(false);
      setButtonEnabledRun(true);
    }
  };

  const setupRunner = async () => {
    if (!artifactId || !hyphaCoreAPI || !isHyphaCoreReady) {
      console.error('Cannot setup runner: Missing artifactId or hyphaCoreAPI is not ready');
      return;
    }

    setIsLoading(true);

    try {
      // Extract model ID from the full artifactId
      const modelId = artifactId.split('/').pop() || '';
      
      // Create a unique window ID
      const windowId = `model-runner-${modelId}-${Date.now()}`;
      
      // First update the state - call the container creation callback
      let containerId = windowId;
      if (createContainerCallback) {
        containerId = createContainerCallback(windowId);
      }
      
      // Small delay to let React update the DOM with the new container element
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Store the window ID for future operations
      setCurrentWindowId(containerId);
      
      // Start both ImageJ and model initialization in parallel
      const imageJPromise = hyphaCoreAPI.createWindow({
        name: `Run Model: ${modelId}`,
        src: "https://ij.imjoy.io/",
        window_id: containerId
      });
      
      const modelRunnerPromise = (async () => {
        const modelRunner = new ModelRunnerEngine(serverUrl) as ExtendedModelRunnerEngine;
        await modelRunner.init(token.trim() || null, serviceId);
        return modelRunner;
      })();
      
      // Wait for both ImageJ and model runner to be ready
      const [imagej, modelRunner] = await Promise.all([imageJPromise, modelRunnerPromise]);
      
      // Set up viewer and runner
      const viewer = new ImagejJsController(imagej);
      setViewerControl(viewer);
      setRunner(modelRunner);
      
      // Initialize the model (load the RDF and prepare for execution)
      await initModel(modelId, modelRunner);
      
      console.log(`Created window ${containerId} for model ${modelId}`);
      
      setIsRunning(true);
      setIsLoading(false);
      
      // Notify parent component if callback provided
      if (onRunStateChange) {
        onRunStateChange(true);
      }

    } catch (error) {
      console.error('Failed to setup runner:', error);
      const errorMessage = error instanceof Error && error.message.includes('Container element') 
        ? "Failed to create container element. Please make sure the container callback is properly implemented."
        : "Failed to setup the model runner. See console for details.";
      setInfoPanel(errorMessage, false, true);
      setIsLoading(false);
    }
  };

  const loadTestInput = async () => {
    if (!runner || !viewerControl) return;
    
    setInfoPanel("Loading test input...", true);
    
    try {
      const rdf = runner.rdf as ModelRDF;
      if (rdfHas(rdf, "test_inputs")) {
        const testInputUrl = getRdfTensorUrl(rdf, 'test_inputs');
        if (testInputUrl) {
          await viewerControl.viewFromUrl(
            testInputUrl,
            rdf.inputs[0],
            rdf.outputs[0]
          );
          setInputLoaded(true);
          setInfoPanel("Test input loaded successfully!");
          return;
        }
      } else if (rdfHas(rdf, "sample_inputs")) {
        const sampleInputUrl = getRdfTensorUrl(rdf, 'sample_inputs');
        if (sampleInputUrl) {
          await viewerControl.viewFromUrl(
            sampleInputUrl,
            rdf.inputs[0],
            rdf.outputs[0]
          );
          setInputLoaded(true);
          setInfoPanel("Sample input loaded successfully!");
          return;
        }
      } else {
        setInfoPanel("No test or sample input found in this model.", false, true);
        return;
      }
    } catch (err) {
      console.error("Failed to load the test input:", err);
      
      // Extract meaningful error message
      const errorMessage = err instanceof Error ? err.message : String(err);
      const detailedError = `Failed to load test input: ${errorMessage}`;
      
      try {
        const rdf = runner.rdf as ModelRDF;
        if (rdfHas(rdf, "sample_inputs")) {
          console.log("Attempting to load sample input as fallback...");
          const sampleInputUrl = getRdfTensorUrl(rdf, 'sample_inputs');
          if (sampleInputUrl) {
            await viewerControl.viewFromUrl(
              sampleInputUrl,
              rdf.inputs[0], 
              rdf.outputs[0]
            );
            setInputLoaded(true);
            setInfoPanel("Sample input loaded successfully (test input failed)!");
            return;
          }
        }
      } catch (sampleError) {
        console.error("Failed to load sample input:", sampleError);
        const sampleErrorMessage = sampleError instanceof Error ? sampleError.message : String(sampleError);
        setInfoPanel(`Failed to load any input images. Test input error: ${errorMessage}. Sample input error: ${sampleErrorMessage}`, false, true);
        return;
      }
      
      // If we get here, show the original error
      setInfoPanel(detailedError, false, true);
    }
  };

  const loadTestOutput = async () => {
    if (!runner || !viewerControl) return;
    
    setInfoPanel("Loading test output...", true);
    
    try {
      const rdf = runner.rdf as ModelRDF;
      if (rdfHas(rdf, "test_outputs")) {
        const testOutputUrl = getRdfTensorUrl(rdf, 'test_outputs');
        if (testOutputUrl) {
          await viewerControl.viewFromUrl(
            testOutputUrl,
            rdf.inputs[0],
            rdf.outputs[0],
            "output"
          );
          setInfoPanel("Test output loaded successfully!");
          return;
        }
      } else if (rdfHas(rdf, "sample_outputs")) {
        const sampleOutputUrl = getRdfTensorUrl(rdf, 'sample_outputs');
        if (sampleOutputUrl) {
          await viewerControl.viewFromUrl(
            sampleOutputUrl,
            rdf.inputs[0],
            rdf.outputs[0],
            "output"
          );
          setInfoPanel("Sample output loaded successfully!");
          return;
        }
      } else {
        setInfoPanel("No test or sample output found in this model.", false, true);
        return;
      }
    } catch (err) {
      console.error("Failed to load the test output:", err);
      
      // Extract meaningful error message
      const errorMessage = err instanceof Error ? err.message : String(err);
      const detailedError = `Failed to load test output: ${errorMessage}`;
      
      try {
        const rdf = runner.rdf as ModelRDF;
        if (rdfHas(rdf, "sample_outputs")) {
          console.log("Attempting to load sample output as fallback...");
          const sampleOutputUrl = getRdfTensorUrl(rdf, 'sample_outputs');
          if (sampleOutputUrl) {
            await viewerControl.viewFromUrl(
              sampleOutputUrl,
              rdf.inputs[0],
              rdf.outputs[0],
              "output"
            );
            setInfoPanel("Sample output loaded successfully (test output failed)!");
            return;
          }
        }
      } catch (sampleError) {
        console.error("Failed to load sample output:", sampleError);
        const sampleErrorMessage = sampleError instanceof Error ? sampleError.message : String(sampleError);
        setInfoPanel(`Failed to load any output images. Test output error: ${errorMessage}. Sample output error: ${sampleErrorMessage}`, false, true);
        return;
      }
      
      // If we get here, show the original error
      setInfoPanel(detailedError, false, true);
    }
  };

  const handleReloadApp = async () => {
    if (!currentWindowId || !hyphaCoreAPI || !isHyphaCoreReady) {
      console.error('Cannot reload app: Missing windowId or hyphaCoreAPI is not ready');
      return;
    }

    setIsReloading(true);
    setIsError(false); // Clear error state when reloading

    try {
      // Extract model ID from the full artifactId
      const modelId = artifactId?.split('/').pop() || '';
      
      // Create a new window ID
      const newWindowId = `model-runner-${modelId}-${Date.now()}`;
      
      // delete the dom element with the id currentWindowId
      const domElement = document.getElementById(currentWindowId);
      if (domElement) {
        // clear the content of the dom element
        domElement.innerHTML = '';
        // set the id of the dom element to the new window id
        domElement.id = newWindowId;
      }
      
      // Call the container creation callback
      let containerId = newWindowId;
      if (createContainerCallback) {
        containerId = createContainerCallback(newWindowId);
      }
      
      // Small delay to let React update the DOM with the new container element
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Store the new window ID
      setCurrentWindowId(containerId);
      
      // Create a new window
      await hyphaCoreAPI.createWindow({
        name: `Run Model: ${modelId}`,
        src: "https://ij.imjoy.io/",
        window_id: containerId
      });
      
      console.log(`Reloaded app in window ${containerId}`);
      
      setIsReloading(false);
      setInputLoaded(false);
      setInfoPanel("Application reloaded successfully!", false, false);
    } catch (error) {
      console.error('Failed to reload app:', error);
      const errorMessage = error instanceof Error && error.message.includes('Container element') 
        ? "Failed to create container element. Please make sure the container callback is properly implemented."
        : "Failed to reload the application. See console for details.";
      setInfoPanel(errorMessage, false, true);
      setIsReloading(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Control buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={loadTestInput}
          disabled={!buttonEnabledInput || isWaiting || !isLoggedIn}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors
            ${!buttonEnabledInput || isWaiting || !isLoggedIn
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {!isLoggedIn ? 'Login to Load Sample' : 'Load Sample Image'}
        </button>
        
        <button
          onClick={runModel}
          disabled={!buttonEnabledRun || isWaiting || !isLoggedIn}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
            ${!buttonEnabledRun || isWaiting || !isLoggedIn
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-700'
            }`}
        >
          {isWaiting ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 718-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
          )}
          {!isLoggedIn ? 'Login to Run Model' : 'Run Model'}
        </button>
        
        <button
          onClick={loadTestOutput}
          disabled={!buttonEnabledOutput || isWaiting || !isLoggedIn}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors
            ${!buttonEnabledOutput || isWaiting || !isLoggedIn
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {!isLoggedIn ? 'Login to Show Reference' : 'Show Reference Output'}
        </button>
        
        {/* Advanced Settings Toggle */}
        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-300"
        >
          <svg 
            className={`w-4 h-4 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Advanced Options
        </button>

        {/* Model Tester */}
        <ModelTester
          artifactId={artifactId}
          isStaged={isStaged}
          isDisabled={false}
          skipCache={false}
          className="flex-shrink-0"
        />
      </div>

      {/* Advanced Settings Panel */}
      {showAdvancedSettings && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h4 className="font-medium text-gray-900 text-sm">Advanced Settings</h4>
          
          {/* Tiling Settings */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={tilingEnabled}
                onChange={(e) => setTilingEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                aria-label="Enable tiling for large images"
              />
              Enable Tiling
            </label>
            
            {tilingEnabled && (
              <div className="ml-6 space-y-2">
                <label htmlFor="tile-size" className="block text-sm font-medium text-gray-700">
                  Tile Size (pixels)
                </label>
                <input
                  id="tile-size"
                  type="number"
                  value={tileSize}
                  onChange={(e) => setTileSize(parseInt(e.target.value) || 512)}
                  min="64"
                  max="2048"
                  step="64"
                  className="w-24 px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-xs text-gray-500 block">
                  Recommended: 256-1024 pixels
                </span>
              </div>
            )}
          </div>
          
          {/* Server Settings */}
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <h5 className="font-medium text-gray-800 text-sm">Server Configuration</h5>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Server URL
              </label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://hypha.aicell.io"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service ID
              </label>
              <input
                type="text"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="24agents-science/model-runner"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token (optional)
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Authentication token"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-xs text-gray-500">
                Leave empty for public services, needed for connecting to private BioEngine instances
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Status Message - moved below buttons */}
      {(infoMessage || isLoading || isWaiting || !modelInitialized) && (
        <div className={`mt-4 px-4 py-3 rounded-lg border transition-all duration-300 ${
          isError 
            ? 'bg-red-50 border-red-200 text-red-800' 
            : isWaiting || isLoading || !modelInitialized
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Show spinner for loading states */}
              {(isWaiting || isLoading || (!modelInitialized && artifactId && hyphaCoreAPI && isHyphaCoreReady && isLoggedIn)) && (
                <div className="flex-shrink-0">
                  <div 
                    style={{
                      animation: 'modelRunnerSpin 1s linear infinite',
                      display: 'inline-block'
                    }}
                  >
                    <svg 
                      className="w-5 h-5" 
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4" 
                        strokeDasharray="31.416" 
                        strokeDashoffset="31.416"
                        opacity="0.3"
                      />
                      <circle 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4" 
                        strokeDasharray="31.416" 
                        strokeDashoffset="23.562"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              )}
              
              {/* Status text */}
              <div className="text-base font-medium">
                {infoMessage || 
                  (!modelInitialized && artifactId && hyphaCoreAPI && isHyphaCoreReady && isLoggedIn 
                    ? "Initializing model..." 
                    : !isLoggedIn 
                      ? "Please log in to use the model runner"
                      : !hyphaCoreAPI || !isHyphaCoreReady
                        ? "Connecting to Hypha..."
                        : "Ready"
                  )}
              </div>
            </div>

            {/* Reload button - only show when there's an error */}
            {isError && (
              <button
                onClick={handleReloadApp}
                disabled={isReloading}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-colors
                  ${isReloading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                  }`}
                title="Reload the application"
              >
                {isReloading ? (
                  <div 
                    style={{
                      animation: 'modelRunnerSpin 1s linear infinite',
                      display: 'inline-block'
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4" 
                        strokeDasharray="31.416" 
                        strokeDashoffset="31.416"
                        opacity="0.3"
                      />
                      <circle 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4" 
                        strokeDasharray="31.416" 
                        strokeDashoffset="23.562"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isReloading ? 'Reloading...' : 'Reload App'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelRunner; 