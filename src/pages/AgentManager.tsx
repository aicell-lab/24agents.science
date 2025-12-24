import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useHyphaStore } from "../store/hyphaStore";

interface AgentInfo {
  agent_id: string;
  name: string;
  description?: string;
  agent_options: AgentOptions;
  created_at?: string;
  updated_at?: string;
}

interface SessionInfo {
  session_id: string;
  agent_id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface AgentOptions {
  system_prompt?: string;
  model?: string;
  max_turns?: number;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  permission_mode?: string;
  env?: Record<string, string>;
}

interface LogEntry {
  id: string;
  timestamp: number;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error' | 'info' | 'done';
  content: string;
  details?: any;
}

// Log Entry Icons - consistent 4x4 size
const LogIcons = {
  user: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  assistant: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  tool_use: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  tool_result: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  system: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  result: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  done: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
};

// Log Entry Component for consistent rendering
function LogEntryItem({ log, isExpanded, onToggle }: { log: LogEntry; isExpanded: boolean; onToggle: () => void }) {
  const getLogStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'user': return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', label: 'text-blue-400' };
      case 'assistant': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', label: 'text-emerald-400' };
      case 'tool_use': return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: 'text-purple-400', label: 'text-purple-400' };
      case 'tool_result': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', label: 'text-amber-400' };
      case 'error': return { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', label: 'text-red-400' };
      case 'result': return { bg: 'bg-teal-500/10', border: 'border-teal-500/30', icon: 'text-teal-400', label: 'text-teal-400' };
      case 'done': return { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: 'text-green-400', label: 'text-green-400' };
      case 'system': return { bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: 'text-gray-400', label: 'text-gray-400' };
      default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: 'text-gray-400', label: 'text-gray-400' };
    }
  };

  const style = getLogStyle(log.type);
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  const Icon = LogIcons[log.type] || LogIcons.info;

  const getLabel = (type: LogEntry['type']) => {
    switch (type) {
      case 'user': return 'You';
      case 'assistant': return 'Agent';
      case 'tool_use': return 'Tool';
      case 'tool_result': return 'Result';
      case 'error': return 'Error';
      case 'result': return 'Complete';
      case 'done': return 'Done';
      case 'system': return 'System';
      default: return 'Info';
    }
  };

  // Format user-friendly content based on log type
  const getFormattedContent = () => {
    const details = log.details;

    switch (log.type) {
      case 'user':
        return details?.content || log.content;

      case 'assistant':
        return details?.content || log.content;

      case 'tool_use':
        const toolName = details?.name || 'Unknown';
        const toolInput = details?.input;
        let inputSummary = '';
        if (toolInput) {
          if (typeof toolInput === 'string') {
            inputSummary = toolInput.length > 100 ? toolInput.substring(0, 100) + '...' : toolInput;
          } else if (typeof toolInput === 'object') {
            const keys = Object.keys(toolInput);
            inputSummary = keys.length > 0 ? `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}` : '{}';
          }
        }
        return (
          <div>
            <span className="font-semibold text-purple-300">{toolName}</span>
            {inputSummary && <div className="text-xs text-gray-400 mt-1">Input: {inputSummary}</div>}
          </div>
        );

      case 'tool_result':
        const resultContent = details?.content;
        let resultPreview = '';
        if (resultContent) {
          if (typeof resultContent === 'string') {
            resultPreview = resultContent.length > 200 ? resultContent.substring(0, 200) + '...' : resultContent;
          } else {
            resultPreview = JSON.stringify(resultContent).substring(0, 200) + '...';
          }
        }
        const isError = details?.is_error;
        return (
          <div>
            {isError && <span className="text-red-400 font-semibold">Error: </span>}
            <span className={isError ? 'text-red-300' : 'text-amber-200'}>{resultPreview || 'Tool completed'}</span>
          </div>
        );

      case 'result':
        const summary = details?.summary || log.content;
        const turnsUsed = details?.turns_used;
        const status = details?.status;
        return (
          <div>
            <div className="text-teal-200">{summary}</div>
            <div className="text-xs text-gray-400 mt-1">
              {status && <span className="capitalize">{status}</span>}
              {turnsUsed && <span> • {turnsUsed} turns</span>}
            </div>
          </div>
        );

      case 'error':
        const errorMsg = details?.error || log.content;
        return <span className="text-red-300 font-medium">{errorMsg}</span>;

      case 'system':
        const subtype = details?.subtype || '';
        const data = details?.data;
        return (
          <div>
            <span className="text-gray-300">{subtype || 'System message'}</span>
            {data && <div className="text-xs text-gray-500 mt-1">{JSON.stringify(data).substring(0, 100)}</div>}
          </div>
        );

      case 'done':
        return <span className="text-green-300 font-medium">Task completed successfully</span>;

      default:
        return log.content || JSON.stringify(details).substring(0, 200);
    }
  };

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}>
      <div
        className={`flex items-start gap-3 p-3 ${hasDetails ? 'cursor-pointer hover:bg-white/5' : ''}`}
        onClick={() => hasDetails && onToggle()}
      >
        {/* Icon */}
        <div className={`flex-shrink-0 mt-0.5 ${style.icon}`}>
          {Icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${style.label}`}>
              {getLabel(log.type)}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            {hasDetails && (
              <svg
                className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
            {getFormattedContent()}
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      {hasDetails && isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-7">
          <div className="p-2 bg-black/20 rounded text-xs font-mono text-gray-400 overflow-x-auto">
            <div className="text-gray-300 font-semibold mb-2">Raw Details:</div>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// Create Agent Dialog Component
function CreateAgentDialog({
  isOpen,
  onClose,
  onSubmit,
  editingAgent
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; agent_options: AgentOptions }) => void;
  editingAgent?: AgentInfo | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [maxTurns, setMaxTurns] = useState(10);
  const [allowedTools, setAllowedTools] = useState("Read,Write,Edit,Bash,Glob,Grep");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name || "");
      setDescription(editingAgent.description || "");
      setSystemPrompt(editingAgent.agent_options?.system_prompt || "");
      setModel(editingAgent.agent_options?.model || "claude-sonnet-4-20250514");
      setMaxTurns(editingAgent.agent_options?.max_turns || 10);
      setAllowedTools(editingAgent.agent_options?.allowed_tools?.join(",") || "Read,Write,Edit,Bash,Glob,Grep");
    } else {
      // Reset form for new agent
      setName("");
      setDescription("");
      setSystemPrompt("You are a helpful AI assistant for scientific research.");
      setModel("claude-sonnet-4-20250514");
      setMaxTurns(10);
      setAllowedTools("Read,Write,Edit,Bash,Glob,Grep");
    }
  }, [editingAgent, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        agent_options: {
          system_prompt: systemPrompt.trim(),
          model,
          max_turns: maxTurns,
          allowed_tools: allowedTools.split(",").map(t => t.trim()).filter(Boolean),
        }
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-cyan-50">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {editingAgent ? "Edit Agent" : "Create New Agent"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agent Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Data Analysis Agent"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this agent does"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instructions for the agent's behavior and capabilities..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Latest)</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Faster)</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus (Most Capable)</option>
              </select>
            </div>

            {/* Max Turns */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Turns
              </label>
              <input
                type="number"
                value={maxTurns}
                onChange={(e) => setMaxTurns(parseInt(e.target.value) || 10)}
                min={1}
                max={100}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of conversation turns before stopping
              </p>
            </div>

            {/* Allowed Tools */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allowed Tools
              </label>
              <input
                type="text"
                value={allowedTools}
                onChange={(e) => setAllowedTools(e.target.value)}
                placeholder="Comma-separated list of tools"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Available: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {editingAgent ? "Updating..." : "Creating..."}
                </span>
              ) : (
                editingAgent ? "Update Agent" : "Create Agent"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Agent Info Component
function AgentInfoPanel({
  agent,
  onEdit,
  onDelete,
  logs,
  isExecuting,
  onExecuteTask,
  taskInput,
  setTaskInput,
  onClearLogs,
  sessions,
  selectedSession,
  onSessionSelect,
  onCreateSession,
  onDeleteSession,
  isStatefulMode,
  onToggleStatefulMode,
  isLoadingHistory,
  copiedAgentId,
  setCopiedAgentId
}: {
  agent: AgentInfo;
  onEdit: () => void;
  onDelete: () => void;
  logs: LogEntry[];
  isExecuting: boolean;
  onExecuteTask: () => void;
  taskInput: string;
  setTaskInput: (val: string) => void;
  onClearLogs: () => void;
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  onSessionSelect: (session: SessionInfo | null) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  isStatefulMode: boolean;
  onToggleStatefulMode: () => void;
  isLoadingHistory: boolean;
  copiedAgentId: boolean;
  setCopiedAgentId: (val: boolean) => void;
}) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Compact Agent Header - Horizontal Layout */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-white to-indigo-50">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Agent Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-900 truncate">{agent.name}</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400 font-mono truncate">{agent.agent_id}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(agent.agent_id);
                    setCopiedAgentId(true);
                    setTimeout(() => setCopiedAgentId(false), 2000);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy agent ID"
                >
                  {copiedAgentId ? (
                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Center-Left: Edit/Delete Agent Buttons */}
          <div className="flex gap-1 border-r border-gray-300 pr-2">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Edit Agent"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete Agent"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Center: Agent Settings (Horizontal) */}
          <div className="hidden lg:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-gray-200">
              <span className="text-gray-500">Model:</span>
              <span className="font-medium text-gray-700">{agent.agent_options?.model?.split('-').slice(-2).join('-') || "Default"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-gray-200">
              <span className="text-gray-500">Turns:</span>
              <span className="font-medium text-gray-700">{agent.agent_options?.max_turns || 10}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-gray-200">
              <span className="text-gray-500">Tools:</span>
              <span className="font-medium text-gray-700">{agent.agent_options?.allowed_tools?.length || 0}</span>
            </div>
          </div>

          {/* Right: Session Controls */}
          <div className="flex items-center gap-2">
            {/* Session Mode Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1 bg-white rounded border border-gray-200">
              <span className={`text-xs ${!isStatefulMode ? 'font-medium text-gray-700' : 'text-gray-400'}`}>Stateless</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isStatefulMode}
                  onChange={onToggleStatefulMode}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-gray-300 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
                <div className="absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform peer-checked:translate-x-3"></div>
              </div>
              <span className={`text-xs ${isStatefulMode ? 'font-medium text-indigo-700' : 'text-gray-400'}`}>Stateful</span>
            </label>

            {/* Session Selector (only when stateful) */}
            {isStatefulMode && (
              <>
                <select
                  value={selectedSession?.session_id || ""}
                  onChange={(e) => {
                    const session = sessions.find(s => s.session_id === e.target.value);
                    onSessionSelect(session || null);
                  }}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white max-w-[200px]"
                >
                  <option value="">New Session</option>
                  {sessions.map(session => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onCreateSession}
                  className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  title="Create New Session"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {selectedSession && (
                  <button
                    onClick={() => onDeleteSession(selectedSession.session_id)}
                    className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    title="Delete Session"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Log Window */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 bg-gray-800 text-white text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Execution Log</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-700 rounded">
              {logs.length}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isLoadingHistory && (
              <span className="flex items-center gap-2 text-blue-400">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading history...
              </span>
            )}
            {isExecuting && (
              <span className="flex items-center gap-2 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Running...
              </span>
            )}
            {logs.length > 0 && !isExecuting && !isLoadingHistory && (
              <button
                onClick={onClearLogs}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Clear logs"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div
          ref={logContainerRef}
          className="flex-1 bg-gray-900 p-4 overflow-y-auto"
          style={{ minHeight: '200px' }}
        >
          {isLoadingHistory ? (
            <div className="text-blue-400 text-center py-12">
              <svg className="w-12 h-12 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-sm font-medium">Loading conversation history...</p>
              <p className="text-xs mt-1 text-gray-500">Please wait</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-gray-500 text-center py-12">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium">No execution logs yet</p>
              <p className="text-xs mt-1 text-gray-600">Enter a task below to start</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <LogEntryItem
                  key={log.id}
                  log={log}
                  isExpanded={expandedLogs.has(log.id)}
                  onToggle={() => toggleLogExpanded(log.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Task Input */}
        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isExecuting && taskInput.trim()) {
                  onExecuteTask();
                }
              }}
              placeholder="Enter a task for the agent to execute..."
              disabled={isExecuting}
              className="flex-1 px-4 py-3 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400 disabled:opacity-50"
            />
            <button
              onClick={onExecuteTask}
              disabled={isExecuting || !taskInput.trim()}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isExecuting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Execute
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Agent Manager Page
export default function AgentManager() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoggedIn, server, login } = useHyphaStore();

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [copiedAgentId, setCopiedAgentId] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [agentManagerService, setAgentManagerService] = useState<any>(null);

  // Task execution state
  const [taskInput, setTaskInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Session management state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [isStatefulMode, setIsStatefulMode] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Get the agent manager service
  const getAgentManagerService = useCallback(async () => {
    if (!server) return null;
    try {
      const svc = await server.getService("hypha-agents/claude-agent-manager", {"mode": "last"});
      setAgentManagerService(svc);
      return svc;
    } catch (err) {
      console.error("Failed to get agent manager service:", err);
      return null;
    }
  }, [server]);

  // Extract session name from session ID
  const extractSessionName = (sessionId: string): string => {
    // Session IDs are like "hypha-agents/alluring-recreation-pick-suspiciously"
    // We want to extract the readable part after the last "/"
    const parts = sessionId.split('/');
    return parts[parts.length - 1];
  };

  // Load agents
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const svc = agentManagerService || await getAgentManagerService();
      if (!svc) {
        console.error("Agent manager service not available");
        return;
      }
      const agentList = await svc.list_agents();
      setAgents(agentList || []);
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setLoading(false);
    }
  }, [agentManagerService, getAgentManagerService]);

  // Load sessions for selected agent
  const loadSessions = useCallback(async (agentId: string) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    try {
      const sessionList = await svc.list_sessions({ agent_id: agentId, _rkwargs: true });

      // Process sessions to ensure they have display names
      const processedSessions = (sessionList || []).map((session: SessionInfo) => {
        // If session doesn't have a name, extract it from session_id
        if (!session.name || session.name === "New Session") {
          return {
            ...session,
            name: extractSessionName(session.session_id)
          };
        }
        return session;
      });

      setSessions(processedSessions);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setSessions([]);
    }
  }, [agentManagerService, getAgentManagerService]);

  // Create a new session
  const handleCreateSession = async (agentId: string, sessionName?: string) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) {
      alert("Agent manager service not available");
      return null;
    }

    try {
      const session = await svc.create_session({
        agent_id: agentId,
        name: sessionName || "New Session",
        description: "",
        _rkwargs: true
      });

      // Extract readable name from session_id
      const extractedName = extractSessionName(session.session_id);

      // Reload sessions to get the updated list with proper names
      await loadSessions(agentId);

      // Return session with extracted name
      return {
        ...session,
        name: extractedName
      };
    } catch (err) {
      console.error("Failed to create session:", err);
      alert(`Failed to create session: ${err}`);
      return null;
    }
  };

  // Delete a session
  const handleDeleteSession = async (sessionId: string, agentId: string) => {
    if (!window.confirm("Are you sure you want to delete this session and its conversation history?")) return;

    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    try {
      await svc.delete_session({ session_id: sessionId, _rkwargs: true });
      if (selectedSession?.session_id === sessionId) {
        setSelectedSession(null);
        setLogs([]);
      }
      await loadSessions(agentId);
    } catch (err) {
      console.error("Failed to delete session:", err);
      alert(`Failed to delete session: ${err}`);
    }
  };

  // Load conversation history for a session
  const loadConversationHistory = async (sessionId: string) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    setIsLoadingHistory(true);
    try {
      const history = await svc.get_conversation_history({ session_id: sessionId, _rkwargs: true });

      console.log('Loading conversation history for session:', sessionId);
      console.log('History received:', history);

      // Convert history to log entries
      const historyLogs: LogEntry[] = [];

      if (Array.isArray(history) && history.length > 0) {
        for (const turn of history) {
          // Add each event from the turn
          if (Array.isArray(turn.events)) {
            for (const event of turn.events) {
              // Extract content based on event type
              let content = '';
              if (event.content) {
                content = event.content;
              } else if (event.summary) {
                content = event.summary;
              } else if (event.name) {
                // For tool_use events
                content = `Using tool: ${event.name}`;
              } else {
                content = JSON.stringify(event);
              }

              historyLogs.push({
                id: `${turn.timestamp}-${Math.random().toString(36).substring(2, 9)}`,
                timestamp: turn.timestamp * 1000, // Convert to milliseconds
                type: event.type as LogEntry['type'],
                content: content,
                details: event
              });
            }
          }
        }
      }

      console.log('Converted to log entries:', historyLogs);
      setLogs(historyLogs);
    } catch (err) {
      console.error("Failed to load conversation history:", err);
      // Don't clear logs on error - keep existing ones
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Initialize service and load agents when logged in
  useEffect(() => {
    if (isLoggedIn && server) {
      loadAgents();
    }
  }, [isLoggedIn, server, loadAgents]);

  // Load sessions when agent is selected
  useEffect(() => {
    if (selectedAgent) {
      loadSessions(selectedAgent.agent_id);
    } else {
      setSessions([]);
      setSelectedSession(null);
    }
  }, [selectedAgent, loadSessions]);

  // Handle URL query parameter for agent selection
  useEffect(() => {
    const agentIdFromUrl = searchParams.get('agent');

    // Only auto-select if we have agents loaded and URL has agent parameter
    if (agentIdFromUrl && agents.length > 0 && !selectedAgent) {
      const agentToSelect = agents.find(a => a.agent_id === agentIdFromUrl);

      if (agentToSelect) {
        // Fetch and select the agent
        (async () => {
          setLoadingAgent(true);
          try {
            const svc = agentManagerService || await getAgentManagerService();
            if (svc) {
              const fullAgent = await svc.get_agent({ agent_id: agentIdFromUrl, _rkwargs: true });
              setSelectedAgent(fullAgent);
            } else {
              setSelectedAgent(agentToSelect);
            }
          } catch (err) {
            console.error('Failed to load agent from URL:', err);
            setSelectedAgent(agentToSelect);
          } finally {
            setLoadingAgent(false);
          }
        })();
      }
    }
  }, [searchParams, agents, selectedAgent, agentManagerService, getAgentManagerService]);

  // Create agent
  const handleCreateAgent = async (data: { name: string; description: string; agent_options: AgentOptions }) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) {
      alert("Agent manager service not available");
      return;
    }

    try {
      let updatedAgentId: string | null = null;

      if (editingAgent) {
        // Update existing agent
        await svc.update_agent({
          agent_id: editingAgent.agent_id,
          name: data.name,
          description: data.description,
          agent_options: data.agent_options,
          _rkwargs: true
        });
        updatedAgentId = editingAgent.agent_id;
      } else {
        // Create new agent
        const newAgent = await svc.create_agent({
          name: data.name,
          description: data.description,
          agent_options: data.agent_options,
          _rkwargs: true
        });
        updatedAgentId = newAgent.agent_id;
      }

      // Reload agents list
      await loadAgents();

      // Update selectedAgent if we edited the currently selected agent
      if (updatedAgentId && selectedAgent?.agent_id === updatedAgentId) {
        // Get the updated agent from the service
        const updatedAgent = await svc.get_agent({ agent_id: updatedAgentId, _rkwargs: true });
        setSelectedAgent(updatedAgent);
      }

      setEditingAgent(null);
    } catch (err) {
      console.error("Failed to create/update agent:", err);
      alert(`Failed to ${editingAgent ? 'update' : 'create'} agent: ${err}`);
    }
  };

  // Delete agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!window.confirm("Are you sure you want to delete this agent?")) return;

    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    try {
      await svc.remove_agent({ agent_id: agentId, _rkwargs: true });
      if (selectedAgent?.agent_id === agentId) {
        setSelectedAgent(null);
      }
      await loadAgents();
    } catch (err) {
      console.error("Failed to delete agent:", err);
      alert(`Failed to delete agent: ${err}`);
    }
  };

  // Execute task
  const handleExecuteTask = async () => {
    if (!selectedAgent || !taskInput.trim() || isExecuting) return;

    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) {
      alert("Agent manager service not available");
      return;
    }

    // If stateful mode but no session, create one first (without prompting)
    let sessionId = selectedSession?.session_id;
    if (isStatefulMode && !sessionId) {
      const newSession = await handleCreateSession(selectedAgent.agent_id);
      if (newSession) {
        sessionId = newSession.session_id;
        setSelectedSession(newSession);
      }
    }

    setIsExecuting(true);
    const task = taskInput.trim();
    setTaskInput("");

    // Add user message to log
    const userLogId = `${Date.now()}-user`;
    setLogs(prev => [...prev, {
      id: userLogId,
      timestamp: Date.now(),
      type: 'user',
      content: task
    }]);

    try {
      const executeParams: any = {
        agent_id: selectedAgent.agent_id,
        task: task,
        _rkwargs: true
      };

      // Add session_id if in stateful mode
      if (sessionId) {
        executeParams.session_id = sessionId;
      }

      const generator = await svc.execute_task(executeParams);

      for await (const event of generator) {
        const logEntry: LogEntry = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          type: event.type as LogEntry['type'],
          content: '',
          details: event
        };

        switch (event.type) {
          case 'assistant':
            logEntry.content = event.content || '';
            break;
          case 'tool_use':
            logEntry.content = `Using tool: ${event.name}`;
            break;
          case 'tool_result':
            logEntry.content = `Tool result: ${typeof event.content === 'string' ? event.content.substring(0, 200) : JSON.stringify(event.content).substring(0, 200)}...`;
            break;
          case 'result':
            logEntry.content = `Task completed. Summary: ${event.summary?.substring(0, 300) || 'No summary'}`;
            break;
          case 'error':
            logEntry.content = `Error: ${event.error || 'Unknown error'}`;
            break;
          case 'system':
            logEntry.content = `System: ${event.subtype || ''} - ${JSON.stringify(event.data || {})}`;
            break;
          default:
            logEntry.content = JSON.stringify(event);
        }

        if (logEntry.content) {
          setLogs(prev => [...prev, logEntry]);
        }

        if (event.type === 'done' || event.type === 'error') {
          break;
        }
      }
    } catch (err) {
      console.error("Task execution error:", err);
      setLogs(prev => [...prev, {
        id: `${Date.now()}-error`,
        timestamp: Date.now(),
        type: 'error',
        content: `Execution failed: ${err}`
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle login
  const handleLogin = async () => {
    try {
      await login('', '');
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 to-indigo-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">My Agents</h2>
            <button
              onClick={() => navigate('/agents')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Back to Agents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Create Agent Button */}
          {isLoggedIn && (
            <button
              onClick={() => {
                setEditingAgent(null);
                setIsCreateDialogOpen(true);
              }}
              className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-cyan-700 shadow-md transform transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Agent
            </button>
          )}
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!isLoggedIn ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-sm">Please login to manage agents</p>
              <button
                onClick={handleLogin}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Login to Hypha
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No agents created yet</p>
              <button
                onClick={() => setIsCreateDialogOpen(true)}
                className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
              >
                Create your first agent
              </button>
            </div>
          ) : (
            agents.map(agent => (
              <button
                key={agent.agent_id}
                onClick={async () => {
                  // Show loading state for agent selection
                  setLoadingAgent(true);
                  setLogs([]); // Clear logs when switching agents

                  try {
                    // Fetch full agent details when selecting
                    const svc = agentManagerService || await getAgentManagerService();
                    if (svc) {
                      const fullAgent = await svc.get_agent({ agent_id: agent.agent_id, _rkwargs: true });
                      setSelectedAgent(fullAgent);
                      // Update URL with agent query parameter
                      setSearchParams({ agent: agent.agent_id });
                    } else {
                      setSelectedAgent(agent);
                      setSearchParams({ agent: agent.agent_id });
                    }
                  } catch (err) {
                    console.error('Failed to fetch agent details:', err);
                    setSelectedAgent(agent); // Fallback to list data
                    setSearchParams({ agent: agent.agent_id });
                  } finally {
                    setLoadingAgent(false);
                  }
                }}
                className={`w-full text-left p-3 rounded-lg border transition-all transform hover:scale-[1.02] ${
                  selectedAgent?.agent_id === agent.agent_id
                    ? 'bg-gradient-to-r from-indigo-50 to-cyan-50 border-indigo-300 shadow-md ring-2 ring-indigo-400 ring-opacity-50'
                    : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow'
                }`}
              >
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{agent.name}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{agent.description || "No description"}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {loadingAgent ? (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-lg font-medium text-gray-700">Loading agent...</p>
              <p className="text-sm text-gray-500 mt-1">Please wait</p>
            </div>
          </div>
        ) : selectedAgent ? (
          <AgentInfoPanel
            agent={selectedAgent}
            onEdit={() => {
              setEditingAgent(selectedAgent);
              setIsCreateDialogOpen(true);
            }}
            onDelete={() => handleDeleteAgent(selectedAgent.agent_id)}
            logs={logs}
            isExecuting={isExecuting}
            onExecuteTask={handleExecuteTask}
            taskInput={taskInput}
            setTaskInput={setTaskInput}
            onClearLogs={() => setLogs([])}
            sessions={sessions}
            selectedSession={selectedSession}
            isLoadingHistory={isLoadingHistory}
            copiedAgentId={copiedAgentId}
            setCopiedAgentId={setCopiedAgentId}
            onSessionSelect={async (session) => {
              setSelectedSession(session);
              if (session) {
                // Load conversation history when session is selected
                await loadConversationHistory(session.session_id);
              } else {
                // Clear logs when no session selected
                setLogs([]);
              }
            }}
            onCreateSession={async () => {
              if (selectedAgent) {
                const newSession = await handleCreateSession(selectedAgent.agent_id);
                if (newSession) {
                  setSelectedSession(newSession);
                  setLogs([]);
                }
              }
            }}
            onDeleteSession={async (sessionId) => {
              if (selectedAgent) {
                await handleDeleteSession(sessionId, selectedAgent.agent_id);
              }
            }}
            isStatefulMode={isStatefulMode}
            onToggleStatefulMode={() => {
              setIsStatefulMode(!isStatefulMode);
              if (isStatefulMode) {
                // Switching to stateless mode
                setSelectedSession(null);
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <div className="max-w-2xl w-full">
              {/* Elegant Create Agent Card */}
              <div className="bg-gradient-to-br from-white via-indigo-50 to-cyan-50 rounded-3xl shadow-2xl border border-indigo-100 p-12 text-center transform transition-all hover:scale-[1.01]">
                {/* Icon */}
                <div className="mb-8 relative">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-indigo-500 to-cyan-600 rounded-3xl flex items-center justify-center shadow-xl transform rotate-3 transition-transform hover:rotate-6">
                    <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="absolute top-0 right-1/4 w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
                  <div className="absolute bottom-4 left-1/4 w-3 h-3 bg-green-400 rounded-full animate-pulse delay-75"></div>
                </div>

                {/* Title */}
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-gray-900 via-indigo-800 to-cyan-900 bg-clip-text text-transparent">
                  AI Agent Manager
                </h1>

                {/* Description */}
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  Create and manage AI agents for scientific research.<br />
                  <span className="text-sm text-gray-500">Configure prompts, tools, and execute tasks with streaming output.</span>
                </p>

                {isLoggedIn ? (
                  <>
                    {/* Prominent Create Button */}
                    <button
                      onClick={() => {
                        setEditingAgent(null);
                        setIsCreateDialogOpen(true);
                      }}
                      className="group relative px-12 py-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white text-xl font-bold rounded-2xl shadow-2xl hover:shadow-3xl transform transition-all duration-300 hover:scale-110 hover:rotate-1 overflow-hidden"
                    >
                      {/* Animated background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 via-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                      {/* Button content */}
                      <div className="relative flex items-center justify-center gap-4">
                        <svg className="w-8 h-8 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Create New Agent</span>
                        <svg className="w-6 h-6 transform group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </button>

                    {/* Features */}
                    <div className="mt-12 grid grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-indigo-100 rounded-xl flex items-center justify-center">
                          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">Configurable</p>
                        <p className="text-xs text-gray-500">Custom prompts & tools</p>
                      </div>
                      <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-xl flex items-center justify-center">
                          <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">Streaming</p>
                        <p className="text-xs text-gray-500">Real-time execution</p>
                      </div>
                      <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-cyan-100 rounded-xl flex items-center justify-center">
                          <svg className="w-7 h-7 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">Secure</p>
                        <p className="text-xs text-gray-500">Hypha authentication</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <button
                      onClick={handleLogin}
                      className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-lg font-bold rounded-xl shadow-lg hover:from-indigo-700 hover:to-cyan-700 transition-all"
                    >
                      Login to Get Started
                    </button>
                    <p className="text-sm text-gray-500">
                      Sign in with your Hypha account to create and manage agents
                    </p>
                  </div>
                )}

                {/* Select existing agent hint */}
                {agents.length > 0 && (
                  <div className="mt-8 text-center">
                    <p className="text-gray-500">
                      or select an existing agent from the sidebar
                      <svg className="w-4 h-4 inline ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Agent Dialog */}
      <CreateAgentDialog
        isOpen={isCreateDialogOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setEditingAgent(null);
        }}
        onSubmit={handleCreateAgent}
        editingAgent={editingAgent}
      />
    </div>
  );
}
