import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useHyphaStore } from "../store/hyphaStore";
import SessionArtifactDialog from "../components/SessionArtifactDialog";
import SessionHostingDialog from "../components/SessionHostingDialog";

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
  permission_mode?: 'default' | 'acceptEdits' | 'bypassPermissions';
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
  const [permissionMode, setPermissionMode] = useState<'default' | 'acceptEdits' | 'bypassPermissions'>('acceptEdits');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name || "");
      setDescription(editingAgent.description || "");
      setSystemPrompt(editingAgent.agent_options?.system_prompt || "");
      setModel(editingAgent.agent_options?.model || "claude-sonnet-4-20250514");
      setMaxTurns(editingAgent.agent_options?.max_turns || 10);
      setAllowedTools(editingAgent.agent_options?.allowed_tools?.join(",") || "Read,Write,Edit,Bash,Glob,Grep");
      setPermissionMode(editingAgent.agent_options?.permission_mode || 'acceptEdits');
    } else {
      // Reset form for new agent
      setName("");
      setDescription("");
      setSystemPrompt("You are a helpful AI assistant for scientific research.");
      setModel("claude-sonnet-4-20250514");
      setMaxTurns(10);
      setAllowedTools("Read,Write,Edit,Bash,Glob,Grep");
      setPermissionMode('acceptEdits');
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
          permission_mode: permissionMode,
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

            {/* Permission Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permission Mode
              </label>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as 'default' | 'acceptEdits' | 'bypassPermissions')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="acceptEdits">Accept Edits (Recommended)</option>
                <option value="default">Default (Requires Approval)</option>
                <option value="bypassPermissions">Bypass Permissions</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Controls how the agent handles file operations. "Accept Edits" allows autonomous file changes.
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
  selectedSession,
  isStatefulMode,
  isLoadingHistory,
  copiedAgentId,
  setCopiedAgentId,
  onOpenArtifactDialog,
  onOpenHostingDialog
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
  selectedSession: SessionInfo | null;
  isStatefulMode: boolean;
  isLoadingHistory: boolean;
  copiedAgentId: boolean;
  setCopiedAgentId: (val: boolean) => void;
  onOpenArtifactDialog: () => void;
  onOpenHostingDialog: () => void;
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
      {/* Compact Agent Header */}
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
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 truncate">{agent.name}</h1>
                {/* Session/Mode Badge */}
                {isStatefulMode && selectedSession ? (
                  <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full font-medium">
                    {selectedSession.name}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full font-medium">
                    Stateless
                  </span>
                )}
              </div>
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

          {/* Center: Agent Settings (Horizontal) */}
          <div className="hidden lg:flex items-center gap-3 text-xs">
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

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Session Buttons (only for sessions) */}
            {selectedSession && (
              <>
                <button
                  onClick={onOpenArtifactDialog}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Manage Session Files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
                <button
                  onClick={onOpenHostingDialog}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  title="Static Hosting"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </button>
              </>
            )}
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
  const [serviceStatus, setServiceStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Task execution state
  const [taskInput, setTaskInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Session management state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [isStatefulMode, setIsStatefulMode] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [agentSessions, setAgentSessions] = useState<Record<string, SessionInfo[]>>({});
  const [showArtifactDialog, setShowArtifactDialog] = useState(false);
  const [showHostingDialog, setShowHostingDialog] = useState(false);
  const [creatingSessionForAgent, setCreatingSessionForAgent] = useState<string | null>(null);
  const [loadingSessionsForAgent, setLoadingSessionsForAgent] = useState<string | null>(null);

  // Get the agent manager service
  const getAgentManagerService = useCallback(async () => {
    if (!server) return null;
    setServiceStatus('connecting');
    try {
      const svc = await server.getService("hypha-agents/claude-agent-manager", {"mode": "last"});
      setAgentManagerService(svc);
      setServiceStatus('online');
      return svc;
    } catch (err) {
      console.error("Failed to get agent manager service:", err);
      setServiceStatus('offline');
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
      // Reverse the list so newest agents appear first
      setAgents((agentList || []).reverse());
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
      const result = await svc.get_conversation_history({ session_id: sessionId, _rkwargs: true });

      console.log('Loading conversation history for session:', sessionId);
      console.log('History result:', result);

      // Convert history to log entries
      const historyLogs: LogEntry[] = [];

      // Process saved turns from artifact manager
      if (result.turns && Array.isArray(result.turns) && result.turns.length > 0) {
        for (const turn of result.turns) {
          // Add each event from the turn
          if (Array.isArray(turn.events)) {
            for (const event of turn.events) {
              const logEntry = processEventToLog(event);
              if (logEntry) {
                // Use turn timestamp for historical events
                logEntry.timestamp = turn.timestamp * 1000; // Convert to milliseconds
                logEntry.id = `${turn.timestamp}-${Math.random().toString(36).substring(2, 9)}`;
                historyLogs.push(logEntry);
              }
            }
          }
        }
      }

      // Process live events from current ongoing task (not yet saved)
      if (result.live_events && Array.isArray(result.live_events) && result.live_events.length > 0) {
        console.log('Found live events from ongoing task:', result.live_events.length);
        for (const event of result.live_events) {
          const logEntry = processEventToLog(event);
          if (logEntry) {
            historyLogs.push(logEntry);
          }
        }
      }

      console.log('Converted to log entries:', historyLogs.length, 'entries');
      console.log('Has ongoing task:', result.has_ongoing_task);

      setLogs(historyLogs);

      // Return whether there's an ongoing task for reconnection logic
      return result.has_ongoing_task;
    } catch (err) {
      console.error("Failed to load conversation history:", err);
      // Don't clear logs on error - keep existing ones
      return false;
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

  // Retry connection when offline
  useEffect(() => {
    if (!isLoggedIn || !server) return;

    // Only set up retry interval if offline
    if (serviceStatus !== 'offline') return;

    const retryInterval = setInterval(async () => {
      console.log('Retrying agent service connection...');
      const svc = await getAgentManagerService();
      if (svc) {
        // Successfully reconnected, reload agents
        loadAgents();
      }
    }, 5000); // Retry every 5 seconds

    return () => clearInterval(retryInterval);
  }, [isLoggedIn, server, serviceStatus, getAgentManagerService, loadAgents]);

  // Load sessions when agent is expanded in sidebar
  const loadSessionsForAgent = useCallback(async (agentId: string) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    setLoadingSessionsForAgent(agentId);
    try {
      const sessionList = await svc.list_sessions({ agent_id: agentId, _rkwargs: true });
      const processedSessions = (sessionList || []).map((session: SessionInfo) => {
        if (!session.name || session.name === "New Session") {
          return { ...session, name: extractSessionName(session.session_id) };
        }
        return session;
      });
      setAgentSessions(prev => ({ ...prev, [agentId]: processedSessions }));
    } catch (err) {
      console.error("Failed to load sessions for agent:", err);
      setAgentSessions(prev => ({ ...prev, [agentId]: [] }));
    } finally {
      setLoadingSessionsForAgent(null);
    }
  }, [agentManagerService, getAgentManagerService]);

  // Load sessions when agent is selected (keep for compatibility)
  useEffect(() => {
    if (selectedAgent) {
      loadSessions(selectedAgent.agent_id);
    } else {
      setSessions([]);
      setSelectedSession(null);
    }
  }, [selectedAgent, loadSessions]);

  // Toggle agent expansion in sidebar
  const toggleAgentExpanded = useCallback((agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
        // Load sessions when expanding
        loadSessionsForAgent(agentId);
      }
      return next;
    });
  }, [loadSessionsForAgent]);

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

  // Auto-load conversation history when a session is selected
  useEffect(() => {
    if (selectedSession && isStatefulMode) {
      (async () => {
        // Load conversation history (includes both saved turns and live events)
        const hasOngoingTask = await loadConversationHistory(selectedSession.session_id);

        // If there's an ongoing task, reconnect to watch for new events
        // This allows resuming tasks after page reload or connection interruption
        if (hasOngoingTask && !isExecuting) {
          const svc = agentManagerService || await getAgentManagerService();
          if (svc) {
            try {
              console.log(`Reconnecting to ongoing task in session: ${selectedSession.session_id}`);
              setIsExecuting(true);

              // Watch the session for new events (isReconnection=true suppresses expected errors)
              await watchTaskEvents(selectedSession.session_id, true);
            } catch (err) {
              console.error("Error reconnecting to ongoing task:", err);
              setIsExecuting(false);
            }
          }
        }
      })();
    } else if (!selectedSession) {
      // Clear logs when no session selected
      setLogs([]);
    }
  }, [selectedSession?.session_id, isStatefulMode]);

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

  // Helper function to process event and convert to log entry
  const processEventToLog = (event: any): LogEntry | null => {
    const logEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: event.type as LogEntry['type'],
      content: '',
      details: event
    };

    switch (event.type) {
      case 'user':
        logEntry.content = event.content || '';
        break;
      case 'assistant':
        logEntry.content = event.content || '';
        break;
      case 'tool_use':
        logEntry.content = `Using tool: ${event.name}`;
        break;
      case 'tool_result':
        // Tool results can come from user or assistant role
        // Content can be: string, list of dicts (with 'type' and 'text'), or null
        const isError = event.is_error === true;
        const resultPrefix = isError ? 'Tool error' : 'Tool result';

        let resultContent = '';
        if (typeof event.content === 'string') {
          resultContent = event.content.substring(0, 200);
        } else if (Array.isArray(event.content)) {
          // Extract text from list of content blocks
          resultContent = event.content
            .map((block: any) => block.text || block.content || JSON.stringify(block))
            .join('\n')
            .substring(0, 200);
        } else if (event.content) {
          resultContent = JSON.stringify(event.content).substring(0, 200);
        } else {
          resultContent = '(no content)';
        }

        logEntry.content = `${resultPrefix}: ${resultContent}...`;
        break;
      case 'result':
        // Result event includes rich metadata
        const duration = event.duration_ms ? ` (${Math.round(event.duration_ms)}ms)` : '';
        const turns = event.turns_used ? ` - ${event.turns_used} turn${event.turns_used > 1 ? 's' : ''}` : '';
        logEntry.content = `Task completed${turns}${duration}. ${event.summary?.substring(0, 300) || ''}`;
        break;
      case 'error':
        logEntry.content = `Error: ${event.error || 'Unknown error'}`;
        break;
      case 'system':
        logEntry.content = `System: ${event.subtype || ''} - ${JSON.stringify(event.data || {})}`;
        break;
      case 'info':
        // Info events from watch_task (e.g., "No ongoing task")
        logEntry.content = event.message || 'Info';
        break;
      case 'done':
        // Don't create log entry for done events
        return null;
      default:
        logEntry.content = JSON.stringify(event);
    }

    return logEntry.content ? logEntry : null;
  };

  // Watch task events using watch_task API
  const watchTaskEvents = async (sessionId: string, isReconnection: boolean = false) => {
    const svc = agentManagerService || await getAgentManagerService();
    if (!svc) return;

    try {
      console.log(`Watching task for session: ${sessionId} (reconnection: ${isReconnection})`);
      const generator = await svc.watch_task({ session_id: sessionId, _rkwargs: true });

      let hasEvents = false;
      for await (const event of generator) {
        console.log('Watch task event:', event);

        // If this is a reconnection attempt and we get an info message, it means no task is running
        // Don't add this to the UI logs - it's expected
        if (isReconnection && event.type === 'info') {
          console.log('No active task found during reconnection (expected)');
          break;
        }

        // If we get an error event about "Session not found" during reconnection, it's expected
        // The session exists as a permanent session but has no active task queue
        if (isReconnection && event.type === 'error' && event.error?.includes('not found')) {
          console.log('Session has no active task queue (expected for reconnection)');
          break;
        }

        hasEvents = true;
        const logEntry = processEventToLog(event);
        if (logEntry) {
          setLogs(prev => [...prev, logEntry]);
        }

        // Stop watching when task completes
        if (event.type === 'done' || event.type === 'error' || event.type === 'info') {
          break;
        }
      }

      if (hasEvents) {
        console.log('Successfully reconnected to ongoing task');
      }
    } catch (err) {
      console.error("Error watching task:", err);
      // Only show error in UI if it's NOT a reconnection attempt
      // Reconnection errors are expected and should be silently ignored
      if (!isReconnection) {
        setLogs(prev => [...prev, {
          id: `${Date.now()}-error`,
          timestamp: Date.now(),
          type: 'error',
          content: `Watch task error: ${err}`
        }]);
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute task using job-style submit_task + watch_task
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
      const submitParams: any = {
        agent_id: selectedAgent.agent_id,
        task: task,
        _rkwargs: true
      };

      // Add session_id if in stateful mode
      if (sessionId) {
        submitParams.session_id = sessionId;
        // Enable artifact tools for session-based execution
        submitParams.enable_artifact_tools = true;
        submitParams.add_session_artifact_hint = true;
        // Pass permission_mode from agent options (overrides backend default)
        if (selectedAgent.agent_options?.permission_mode) {
          submitParams.agent_options = {
            permission_mode: selectedAgent.agent_options.permission_mode
          };
        }
      }

      // Submit task (returns immediately with session_id)
      console.log('Submitting task with params:', submitParams);
      const result = await svc.submit_task(submitParams);
      console.log('Task submitted:', result);

      const taskSessionId = result.session_id;

      // Watch task events
      await watchTaskEvents(taskSessionId);

    } catch (err) {
      console.error("Task execution error:", err);
      setLogs(prev => [...prev, {
        id: `${Date.now()}-error`,
        timestamp: Date.now(),
        type: 'error',
        content: `Execution failed: ${err}`
      }]);
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
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-800">Agents</h2>
              {isLoggedIn && (
                <div className="flex items-center gap-1.5" title={`Service: ${serviceStatus}`}>
                  <span className={`w-2 h-2 rounded-full ${
                    serviceStatus === 'online' ? 'bg-green-500' :
                    serviceStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    'bg-red-500'
                  }`}></span>
                </div>
              )}
            </div>
            {/* Small Create Agent Button */}
            {isLoggedIn && (
              <button
                onClick={() => {
                  setEditingAgent(null);
                  setIsCreateDialogOpen(true);
                }}
                className="p-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-lg hover:from-indigo-700 hover:to-cyan-700 shadow-sm transition-all"
                title="Create New Agent"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
            agents.map(agent => {
              const isExpanded = expandedAgents.has(agent.agent_id);
              const isSelected = selectedAgent?.agent_id === agent.agent_id;
              const agentSessionList = agentSessions[agent.agent_id] || [];

              return (
                <div key={agent.agent_id} className="select-none mb-1">
                  {/* Agent Row */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all group ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-800 shadow-sm border border-indigo-100'
                        : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                    }`}
                  >
                    {/* Expand/Collapse Arrow */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAgentExpanded(agent.agent_id);
                      }}
                      className="p-1 hover:bg-gray-200/50 rounded-lg transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* Agent Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-indigo-100' : 'bg-gray-100'
                    }`}>
                      <svg className={`w-4.5 h-4.5 ${isSelected ? 'text-indigo-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>

                    {/* Agent Name */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={async () => {
                        setLoadingAgent(true);
                        setLogs([]);
                        setSelectedSession(null);
                        setIsStatefulMode(false);

                        try {
                          const svc = agentManagerService || await getAgentManagerService();
                          if (svc) {
                            const fullAgent = await svc.get_agent({ agent_id: agent.agent_id, _rkwargs: true });
                            setSelectedAgent(fullAgent);
                            setSearchParams({ agent: agent.agent_id });
                          } else {
                            setSelectedAgent(agent);
                            setSearchParams({ agent: agent.agent_id });
                          }
                        } catch (err) {
                          console.error('Failed to fetch agent details:', err);
                          setSelectedAgent(agent);
                          setSearchParams({ agent: agent.agent_id });
                        } finally {
                          setLoadingAgent(false);
                        }

                        // Auto-expand when selecting
                        if (!isExpanded) {
                          toggleAgentExpanded(agent.agent_id);
                        }
                      }}
                    >
                      <p className="text-sm font-semibold truncate">{agent.name}</p>
                      {agent.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{agent.description}</p>
                      )}
                    </div>

                    {/* Action Buttons - visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Stateless/Incognito Button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setLoadingAgent(true);
                          setLogs([]);
                          setSelectedSession(null);
                          setIsStatefulMode(false);

                          try {
                            const svc = agentManagerService || await getAgentManagerService();
                            if (svc) {
                              const fullAgent = await svc.get_agent({ agent_id: agent.agent_id, _rkwargs: true });
                              setSelectedAgent(fullAgent);
                              setSearchParams({ agent: agent.agent_id });
                            } else {
                              setSelectedAgent(agent);
                              setSearchParams({ agent: agent.agent_id });
                            }
                          } catch (err) {
                            setSelectedAgent(agent);
                            setSearchParams({ agent: agent.agent_id });
                          } finally {
                            setLoadingAgent(false);
                          }

                          if (!isExpanded) {
                            toggleAgentExpanded(agent.agent_id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Stateless mode (no history saved)"
                      >
                        {/* Incognito icon - person with hat and glasses */}
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          {/* Hat */}
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 11h16M6 11V9a6 6 0 0112 0v2" />
                          {/* Hat brim */}
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 11h18" />
                          {/* Glasses */}
                          <circle cx="9" cy="15" r="2.5" strokeWidth={1.5} />
                          <circle cx="15" cy="15" r="2.5" strokeWidth={1.5} />
                          <path strokeLinecap="round" strokeWidth={1.5} d="M11.5 15h1" />
                          {/* Nose */}
                          <path strokeLinecap="round" strokeWidth={1.5} d="M12 15v2.5" />
                        </svg>
                      </button>

                      {/* New Session Button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();

                          // Prevent double-clicks
                          if (creatingSessionForAgent === agent.agent_id) return;

                          // Expand immediately to show loading state
                          if (!isExpanded) {
                            toggleAgentExpanded(agent.agent_id);
                          }

                          setCreatingSessionForAgent(agent.agent_id);

                          try {
                            // First select the agent
                            const svc = agentManagerService || await getAgentManagerService();
                            if (svc) {
                              const fullAgent = await svc.get_agent({ agent_id: agent.agent_id, _rkwargs: true });
                              setSelectedAgent(fullAgent);
                            } else {
                              setSelectedAgent(agent);
                            }

                            // Create new session
                            const newSession = await handleCreateSession(agent.agent_id);
                            if (newSession) {
                              setSelectedSession(newSession);
                              setIsStatefulMode(true);
                              setLogs([]);
                              setSearchParams({ agent: agent.agent_id, session: newSession.session_id });
                              // Refresh sessions list
                              await loadSessionsForAgent(agent.agent_id);
                            }
                          } catch (err) {
                            console.error('Failed to create session:', err);
                            setSelectedAgent(agent);
                          } finally {
                            setCreatingSessionForAgent(null);
                          }
                        }}
                        disabled={creatingSessionForAgent === agent.agent_id}
                        className={`p-1.5 rounded-lg transition-colors ${
                          creatingSessionForAgent === agent.agent_id
                            ? 'text-indigo-400 bg-indigo-50 cursor-wait'
                            : 'text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50'
                        }`}
                        title="Create new session"
                      >
                        {creatingSessionForAgent === agent.agent_id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Session Count Badge - hide on hover */}
                    {agentSessionList.length > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full group-hover:hidden">
                        {agentSessionList.length}
                      </span>
                    )}
                  </div>

                  {/* Expanded Session List */}
                  {isExpanded && (
                    <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-gray-100 pl-3">
                      {/* Loading Sessions Indicator */}
                      {loadingSessionsForAgent === agent.agent_id && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 text-gray-500">
                          <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="text-xs">Loading sessions...</span>
                        </div>
                      )}

                      {/* Creating Session Indicator */}
                      {creatingSessionForAgent === agent.agent_id && (
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 animate-pulse">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-indigo-100">
                            <svg className="w-3.5 h-3.5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                          <span className="text-sm font-medium">Creating session...</span>
                        </div>
                      )}

                      {/* Session Items (only show when not loading) */}
                      {loadingSessionsForAgent !== agent.agent_id && agentSessionList.map(session => (
                        <div
                          key={session.session_id}
                          onClick={async () => {
                            // Only load agent if switching to a different agent
                            if (selectedAgent?.agent_id !== agent.agent_id) {
                              setLoadingAgent(true);

                              try {
                                const svc = agentManagerService || await getAgentManagerService();
                                if (svc) {
                                  const fullAgent = await svc.get_agent({ agent_id: agent.agent_id, _rkwargs: true });
                                  setSelectedAgent(fullAgent);
                                } else {
                                  setSelectedAgent(agent);
                                }
                              } catch (err) {
                                setSelectedAgent(agent);
                              } finally {
                                setLoadingAgent(false);
                              }
                            }

                            setSelectedSession(session);
                            setIsStatefulMode(true);
                            setSearchParams({ agent: agent.agent_id, session: session.session_id });

                            // Load conversation history
                            const hasOngoingTask = await loadConversationHistory(session.session_id);
                            if (hasOngoingTask && !isExecuting) {
                              const svc = agentManagerService || await getAgentManagerService();
                              if (svc) {
                                try {
                                  setIsExecuting(true);
                                  await watchTaskEvents(session.session_id, true);
                                } catch (err) {
                                  setIsExecuting(false);
                                }
                              }
                            }
                          }}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all group/session ${
                            selectedSession?.session_id === session.session_id
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                              : 'hover:bg-gray-50 text-gray-600 border border-transparent'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                            selectedSession?.session_id === session.session_id ? 'bg-emerald-100' : 'bg-gray-100'
                          }`}>
                            <svg className={`w-3.5 h-3.5 ${
                              selectedSession?.session_id === session.session_id ? 'text-emerald-600' : 'text-gray-400'
                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <span className="text-sm truncate flex-1 font-medium">{session.name}</span>
                          {/* Delete Session Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.session_id, agent.agent_id);
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/session:opacity-100 transition-all"
                            title="Delete session"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      {/* Empty state when no sessions (only show if not loading or creating) */}
                      {agentSessionList.length === 0 &&
                       loadingSessionsForAgent !== agent.agent_id &&
                       creatingSessionForAgent !== agent.agent_id && (
                        <div className="px-3 py-3 text-xs text-gray-400 text-center">
                          <svg className="w-8 h-8 mx-auto mb-1.5 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          No sessions yet
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
          <>
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
              selectedSession={selectedSession}
              isStatefulMode={isStatefulMode}
              isLoadingHistory={isLoadingHistory}
              copiedAgentId={copiedAgentId}
              setCopiedAgentId={setCopiedAgentId}
              onOpenArtifactDialog={() => setShowArtifactDialog(true)}
              onOpenHostingDialog={() => setShowHostingDialog(true)}
            />
            {/* Session Artifact Dialog */}
            {selectedSession && (
              <SessionArtifactDialog
                sessionId={selectedSession.session_id}
                sessionName={selectedSession.name}
                isOpen={showArtifactDialog}
                onClose={() => setShowArtifactDialog(false)}
              />
            )}
            {/* Session Hosting Dialog */}
            {selectedSession && (
              <SessionHostingDialog
                sessionId={selectedSession.session_id}
                sessionName={selectedSession.name}
                isOpen={showHostingDialog}
                onClose={() => setShowHostingDialog(false)}
              />
            )}
          </>
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
