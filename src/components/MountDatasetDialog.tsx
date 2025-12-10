import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { set } from 'idb-keyval';
import { useHyphaStore } from '../store/hyphaStore';
import { 
  analyzeDatasetFiles, 
  generateDatasetSummary, 
  generateDatasetId,
  formatBytes 
} from '../utils/datasetUtils';
import { DatasetInfo, DatasetFileAnalysis, DatasetDescriptionMessage } from '../types/dataset';

interface MountDatasetDialogProps {
  open: boolean;
  onClose: () => void;
}

// System prompt for AI description generation
const SYSTEM_PROMPT = `You are an expert at writing technical documentation for datasets. Your task is to generate a comprehensive description for a dataset that will help AI agents understand how to work with it.

Based on the provided file analysis and user description, generate a clear and detailed description that includes:

1. **Overview**: A brief summary of what the dataset contains
2. **File Structure**: Description of the file types and organization
3. **Data Format**: How to read and parse the data files (specific packages, methods)
4. **Required Packages**: Python packages needed to work with this data (e.g., pandas, numpy, PIL, etc.)
5. **Example Code**: Short code snippets showing how to load and access the data
6. **Important Notes**: Any special considerations, encoding issues, or data quirks

Be specific about:
- File paths and naming conventions
- Column names and data types for tabular data
- Image dimensions and formats for image data
- JSON structure for JSON files

Keep the description concise but comprehensive. Use markdown formatting.`;

const MountDatasetDialog: React.FC<MountDatasetDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { server } = useHyphaStore();
  
  // Dialog state
  const [step, setStep] = useState<'input' | 'analyzing' | 'refining' | 'ready'>('input');
  const [name, setName] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Analysis state
  const [fileAnalysis, setFileAnalysis] = useState<DatasetFileAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // AI description state
  const [aiDescription, setAiDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [refinementComment, setRefinementComment] = useState('');
  const [conversationHistory, setConversationHistory] = useState<DatasetDescriptionMessage[]>([]);

  const resetDialog = useCallback(() => {
    setStep('input');
    setName('');
    setUserDescription('');
    setFolderHandle(null);
    setFolderName('');
    setError(null);
    setFileAnalysis(null);
    setIsAnalyzing(false);
    setAiDescription('');
    setIsGenerating(false);
    setRefinementComment('');
    setConversationHistory([]);
  }, []);

  const handleClose = useCallback(() => {
    resetDialog();
    onClose();
  }, [onClose, resetDialog]);

  const handleSelectFolder = async () => {
    try {
      // @ts-expect-error - showDirectoryPicker is not yet in standard types
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      setFolderHandle(handle);
      setFolderName(handle.name);
      
      // Auto-fill name if empty
      if (!name) {
        setName(handle.name);
      }
      
      setError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Failed to select folder. Please try again.');
        console.error('Folder selection error:', err);
      }
    }
  };

  const generateAIDescription = async (summary: string, isRefinement: boolean = false, comment?: string) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Get OpenAI API key from Hypha
      const apiKey = await server?.getEnv?.('OPENAI_API_KEY');
      
      if (!apiKey) {
        throw new Error('OpenAI API key not available. Please contact administrator.');
      }
      
      // Build messages
      const messages: DatasetDescriptionMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT }
      ];
      
      if (isRefinement && conversationHistory.length > 0) {
        // Add previous conversation
        messages.push(...conversationHistory);
        // Add user refinement comment
        messages.push({
          role: 'user',
          content: `Please refine the description based on this feedback:\n\n${comment}`
        });
      } else {
        // Initial generation
        messages.push({
          role: 'user',
          content: `Please generate a description for this dataset:\n\n${summary}`
        });
      }
      
      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      const assistantMessage = data.choices[0]?.message?.content || '';
      
      setAiDescription(assistantMessage);
      
      // Update conversation history
      const newHistory: DatasetDescriptionMessage[] = isRefinement
        ? [
            ...conversationHistory,
            { role: 'user', content: comment || '' },
            { role: 'assistant', content: assistantMessage }
          ]
        : [
            { role: 'user', content: `Please generate a description for this dataset:\n\n${summary}` },
            { role: 'assistant', content: assistantMessage }
          ];
      
      setConversationHistory(newHistory);
      setStep('refining');
      
    } catch (err) {
      console.error('AI generation error:', err);
      setError((err as Error).message || 'Failed to generate description');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyzeAndGenerate = async () => {
    if (!folderHandle || !name.trim() || !userDescription.trim()) {
      setError('Please fill in all fields and select a folder.');
      return;
    }
    
    setStep('analyzing');
    setIsAnalyzing(true);
    setError(null);
    
    try {
      // Analyze the dataset files
      const analysis = await analyzeDatasetFiles(folderHandle);
      setFileAnalysis(analysis);
      
      // Generate summary for AI
      const summary = generateDatasetSummary(analysis, userDescription);
      
      // Generate AI description
      await generateAIDescription(summary);
      
    } catch (err) {
      console.error('Analysis error:', err);
      setError((err as Error).message || 'Failed to analyze dataset');
      setStep('input');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRefine = async () => {
    if (!refinementComment.trim()) return;
    
    const comment = refinementComment;
    setRefinementComment('');
    
    await generateAIDescription('', true, comment);
  };

  const handleMount = async () => {
    if (!folderHandle || !name.trim() || !aiDescription.trim()) {
      setError('Missing required data');
      return;
    }
    
    setStep('ready');
    
    try {
      // Generate unique dataset ID
      const datasetId = generateDatasetId();
      
      // Create dataset info
      const datasetInfo: DatasetInfo = {
        id: datasetId,
        name: name.trim(),
        description: aiDescription,
        createdAt: Date.now()
      };
      
      // Store folder handle in IndexedDB
      await set(`dataset_handle_${datasetId}`, folderHandle);
      
      // Store dataset info in localStorage
      localStorage.setItem(`dataset_${datasetId}`, JSON.stringify(datasetInfo));
      
      // Navigate to the dataset dashboard
      navigate(`/dataset/${datasetId}`, { state: datasetInfo });
      
      handleClose();
      
    } catch (err) {
      console.error('Mount error:', err);
      setError((err as Error).message || 'Failed to mount dataset');
      setStep('refining');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Mount Dataset</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {step === 'input' && (
            <div className="space-y-6">
              {/* Name input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dataset Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Dataset"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              
              {/* Description input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (for AI to enhance)
                </label>
                <textarea
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  placeholder="Describe your dataset: what kind of data it contains, what it's used for, any important details..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-none"
                />
              </div>
              
              {/* Folder picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dataset Folder
                </label>
                <div 
                  onClick={handleSelectFolder}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    folderHandle 
                      ? 'border-green-300 bg-green-50' 
                      : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {folderHandle ? (
                    <div className="flex items-center justify-center gap-3">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{folderName}</p>
                        <p className="text-sm text-gray-500">Click to change folder</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <p className="text-gray-600 font-medium">Click to select folder</p>
                      <p className="text-sm text-gray-400 mt-1">Choose the folder containing your dataset files</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium">
                {isAnalyzing ? 'Analyzing dataset files...' : 'Generating description...'}
              </p>
              <p className="text-sm text-gray-400 mt-2">This may take a moment</p>
            </div>
          )}
          
          {step === 'refining' && (
            <div className="space-y-6">
              {/* File analysis summary */}
              {fileAnalysis && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Dataset Analysis</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Total Files:</span>
                      <span className="ml-2 font-medium">{fileAnalysis.totalFiles}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Size:</span>
                      <span className="ml-2 font-medium">{formatBytes(fileAnalysis.totalSize)}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-gray-500 text-sm">File Types:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Object.entries(fileAnalysis.fileTypes)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                        .map(([ext, count]) => (
                          <span 
                            key={ext}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                          >
                            .{ext} ({count})
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* AI Generated Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI-Generated Description
                </label>
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-60 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                    {aiDescription}
                  </pre>
                </div>
              </div>
              
              {/* Refinement input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refinement Comments (optional)
                </label>
                <textarea
                  value={refinementComment}
                  onChange={(e) => setRefinementComment(e.target.value)}
                  placeholder="Any changes or additions you'd like to make to the description..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-none"
                  disabled={isGenerating}
                />
                <button
                  onClick={handleRefine}
                  disabled={!refinementComment.trim() || isGenerating}
                  className="mt-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                      Refining...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refine Description
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          
          {step === 'ready' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium">Preparing dataset...</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          
          {step === 'input' && (
            <button
              onClick={handleAnalyzeAndGenerate}
              disabled={!folderHandle || !name.trim() || !userDescription.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Analyze & Generate
            </button>
          )}
          
          {step === 'refining' && (
            <button
              onClick={handleMount}
              disabled={isGenerating}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Mount Dataset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MountDatasetDialog;
