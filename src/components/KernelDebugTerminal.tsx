import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface KernelDebugTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  executeCode: ((code: string, callbacks?: any) => Promise<void>) | null;
  kernelStatus: string;
}

export default function KernelDebugTerminal({
  isOpen,
  onClose,
  executeCode,
  kernelStatus
}: KernelDebugTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const currentLine = useRef<string>('');
  const commandHistory = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const isExecuting = useRef<boolean>(false);

  const prompt = () => {
    terminal.current?.write('\r\n\x1b[36m>>> \x1b[0m');
  };

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim() || !executeCode || !terminal.current) return;

    isExecuting.current = true;

    // Add to history
    commandHistory.current.push(cmd);
    historyIndex.current = commandHistory.current.length;

    try {
      const outputs: string[] = [];
      let hasError = false;

      await executeCode(cmd, {
        onOutput: (output: any) => {
          const content = stripAnsi(output.content);
          if (content && terminal.current) {
            outputs.push(content);
            // Write output in real-time
            if (output.type === 'stderr' || output.type === 'error') {
              terminal.current.writeln(`\x1b[31m${content}\x1b[0m`);
              hasError = true;
            } else {
              terminal.current.writeln(content);
            }
          }
        },
        onStatus: (status: string) => {
          if (terminal.current && status === 'Error' && !hasError) {
            terminal.current.writeln('\x1b[31mExecution error\x1b[0m');
          }
        }
      });

      if (outputs.length === 0 && !hasError && terminal.current) {
        terminal.current.writeln('\x1b[90m(no output)\x1b[0m');
      }
    } catch (error) {
      if (terminal.current) {
        terminal.current.writeln(`\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
      }
    } finally {
      isExecuting.current = false;
      prompt();
    }
  };

  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    // Initialize terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      rows: 30,
      cols: 100,
    });

    terminal.current = term;
    fitAddon.current = new FitAddon();
    term.loadAddon(fitAddon.current);
    term.open(terminalRef.current);
    fitAddon.current.fit();

    // Welcome message
    term.writeln('\x1b[1;32m╔═══════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;32m║       Dataset Kernel Debug Terminal              ║\x1b[0m');
    term.writeln('\x1b[1;32m╚═══════════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[33mType Python commands and press Enter to execute.\x1b[0m');
    term.writeln('\x1b[33mUse ↑/↓ arrows to navigate command history.\x1b[0m');
    term.writeln('\x1b[33mUse Ctrl+C to clear current input, Ctrl+L to clear screen.\x1b[0m');
    term.writeln('');
    prompt();

    // Handle terminal input
    term.onData((data) => {
      if (isExecuting.current) return;

      const char = data;

      // Handle Enter key
      if (char === '\r') {
        term.writeln('');
        if (currentLine.current.trim()) {
          executeCommand(currentLine.current);
          currentLine.current = '';
        } else {
          prompt();
        }
        return;
      }

      // Handle Backspace
      if (char === '\x7f') {
        if (currentLine.current.length > 0) {
          currentLine.current = currentLine.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }

      // Handle Ctrl+C
      if (char === '\x03') {
        term.writeln('^C');
        currentLine.current = '';
        prompt();
        return;
      }

      // Handle Ctrl+L (clear screen)
      if (char === '\x0c') {
        term.clear();
        prompt();
        return;
      }

      // Handle arrow up (history previous)
      if (char === '\x1b[A') {
        if (commandHistory.current.length > 0 && historyIndex.current > 0) {
          historyIndex.current--;
          const cmd = commandHistory.current[historyIndex.current];
          // Clear current line
          term.write('\r\x1b[K');
          term.write('\x1b[36m>>> \x1b[0m' + cmd);
          currentLine.current = cmd;
        }
        return;
      }

      // Handle arrow down (history next)
      if (char === '\x1b[B') {
        if (historyIndex.current < commandHistory.current.length - 1) {
          historyIndex.current++;
          const cmd = commandHistory.current[historyIndex.current];
          // Clear current line
          term.write('\r\x1b[K');
          term.write('\x1b[36m>>> \x1b[0m' + cmd);
          currentLine.current = cmd;
        } else if (historyIndex.current === commandHistory.current.length - 1) {
          historyIndex.current = commandHistory.current.length;
          // Clear current line
          term.write('\r\x1b[K');
          term.write('\x1b[36m>>> \x1b[0m');
          currentLine.current = '';
        }
        return;
      }

      // Handle regular characters
      if (char >= String.fromCharCode(0x20) && char <= String.fromCharCode(0x7e)) {
        currentLine.current += char;
        term.write(char);
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.current?.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [isOpen, executeCode]);

  const stripAnsi = (str: string): string => {
    // Remove ANSI escape codes
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Python Kernel Terminal</h3>
              <p className="text-xs text-gray-500">Interactive Python REPL</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Kernel Status Badge */}
            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
              kernelStatus === 'starting' ? 'bg-yellow-100 text-yellow-700' :
              kernelStatus === 'busy' ? 'bg-blue-100 text-blue-700' :
              kernelStatus === 'error' ? 'bg-red-100 text-red-700' :
              'bg-green-100 text-green-700'
            }`}>
              {kernelStatus === 'starting' ? '● Starting...' :
               kernelStatus === 'busy' ? '● Busy' :
               kernelStatus === 'error' ? '● Error' :
               '● Ready'}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              title="Close terminal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal Display - Full screen terminal */}
        <div className="flex-1 bg-[#1e1e1e] overflow-hidden p-4">
          <div ref={terminalRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
