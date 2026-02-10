import { SandboxManager, SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import WebSocket from 'ws';
// @ts-ignore
global.WebSocket = WebSocket;

import { hyphaWebsocketClient } from 'hypha-rpc';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour

// Configuration Constants
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(os.homedir(), 'workspace');
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || path.join(WORKSPACE_DIR, 'sessions');
const SERVER_URL = process.env.HYPHA_SERVER_URL || "https://hypha.aicell.io";
const SERVICE_ID = process.env.SERVICE_ID || "tool-sandbox";
const WORKSPACE = process.env.HYPHA_WORKSPACE;
const TOKEN = process.env.HYPHA_TOKEN;
const IN_DOCKER = process.env.IN_DOCKER === 'true';
const CLIENT_ID = process.env.CLIENT_ID || undefined; // If undefined, Hypha generates one


// Ensure directories exist
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

interface Session {
    id: string;
    dir: string;
    pylibDir: string;
    config: SandboxRuntimeConfig;
    timeoutTimer: NodeJS.Timeout;
}

const activeSessions = new Map<string, Session>();

// Helper logger
const logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string, e?: any) => console.error(`[ERROR] ${msg}`, e || '')
};

function createSessionConfig(sessionDir: string): SandboxRuntimeConfig {
    return {
        network: { 
            allowedDomains: ["*"], 
            allowLocalBinding: true, 
            deniedDomains: [] 
        },
        filesystem: {
            allowWrite: [sessionDir, "/tmp"],
            denyWrite: [],
            denyRead: ["/root/.ssh", "/etc/shadow"]
        },
        enableWeakerNestedSandbox: IN_DOCKER
    };
}

function startSession(timeoutMs: number = DEFAULT_TIMEOUT_MS): Session {
    const id = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_ROOT, id);
    const pylibDir = path.join(sessionDir, 'pylib');

    // Create session directories
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(pylibDir, { recursive: true });

    const session: Session = {
        id,
        dir: sessionDir,
        pylibDir,
        timeoutTimer: setTimeout(() => destroySession(id), timeoutMs),
        config: createSessionConfig(sessionDir)
    };

    activeSessions.set(id, session);
    logger.info(`Session started: ${id}`);
    return session;
}

async function destroySession(id: string): Promise<void> {
    const session = activeSessions.get(id);
    if (!session) return;

    clearTimeout(session.timeoutTimer);
    activeSessions.delete(id);
    logger.info(`Destroying session: ${id}`);

    try {
        await fs.promises.rm(session.dir, { recursive: true, force: true });
    } catch (e) {
        logger.error(`Cleanup failed for ${id}:`, e);
    }
}

interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
    error?: string;
}

async function executeSessionCommand(
    session: Session, 
    command: string, 
    args: string[] = [], 
    cwd?: string
): Promise<CommandResult> {
    const fullCommand = `${command} ${args.join(' ')}`;
    const workingDir = cwd || session.dir;
    
    logger.info(`[${session.id}] Executing: ${fullCommand}`);

    const sandboxedCommandParts = await SandboxManager.wrapWithSandbox(
        fullCommand, 
        undefined, 
        session.config
    );

    const env = {
        ...process.env,
        HOME: session.dir,
        PYTHONPATH: session.pylibDir + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : '')
    };

    return new Promise((resolve, reject) => {
        const child = spawn(sandboxedCommandParts, { 
            shell: true, 
            cwd: workingDir, 
            env 
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());

        child.on('exit', (code) => {
            const result = { stdout, stderr, code: code || 0 };
            if (code === 0) {
                resolve(result);
            } else {
                resolve({ ...result, error: `Exited with code ${code}` });
            }
        });

        child.on('error', (err) => {
            const e = new Error(err.message);
            // @ts-ignore
            e.stdout = stdout; 
            // @ts-ignore
            e.stderr = stderr;
            reject(e);
        });
    });
}

async function initializeGlobalSandbox() {
    logger.info("Initializing Sandbox...");
    await SandboxManager.initialize({
        network: { allowedDomains: ["*"], deniedDomains: [], allowLocalBinding: true },
        filesystem: { allowWrite: [WORKSPACE_DIR, "/tmp"], denyRead: [], denyWrite: [] },
        enableWeakerNestedSandbox: IN_DOCKER
    });
}

function getSession(sessionId: string): Session {
    const session = activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
}

async function registerHyphaService(client: any) {
    logger.info("Connected. Registering service...");

    await client.registerService({
        id: SERVICE_ID,
        name: "Sandboxed Tool Environment",
        description: "Secure tool execution environment with session isolation.",
        config: { visibility: "public" },

        create_session: Object.assign(
            async (timeout: number = DEFAULT_TIMEOUT_MS) => {
                const session = startSession(timeout);
                return session.id;
            },
            {
                __schema__: {
                    name: "create_session",
                    description: "Create a new sandbox session",
                    parameters: {
                        type: "object",
                        properties: {
                            timeout: { type: "number", description: "Timeout in milliseconds" }
                        }
                    }
                }
            }
        ),

        run_command: Object.assign(
            async (session_id: string, cmd: string, args: string[] = [], cwd?: string) => {
                return executeSessionCommand(getSession(session_id), cmd, args, cwd);
            },
            {
                __schema__: {
                    name: "run_command",
                    description: "Run a shell command in the session",
                    parameters: {
                        type: "object",
                        properties: {
                            session_id: { type: "string" },
                            cmd: { type: "string" },
                            args: { type: "array", items: { type: "string" } },
                            cwd: { type: "string" }
                        },
                        required: ["session_id", "cmd"]
                    }
                }
            }
        ),

        install_pip: Object.assign(
            async (session_id: string, pkg: string) => {
                const session = getSession(session_id);
                return executeSessionCommand(
                    session, 'pip', ['install', pkg, '--target', session.pylibDir]
                );
            },
            {
                __schema__: {
                    name: "install_pip",
                    description: "Install a Python package via pip",
                    parameters: {
                        type: "object",
                        properties: {
                            session_id: { type: "string" },
                            pkg: { type: "string" }
                        },
                        required: ["session_id", "pkg"]
                    }
                }
            }
        ),

        install_npm: Object.assign(
            async (session_id: string, pkg: string) => {
                return executeSessionCommand(getSession(session_id), 'npm', ['install', pkg]);
            },
            {
                __schema__: {
                    name: "install_npm",
                    description: "Install a Node.js package via npm",
                    parameters: {
                        type: "object",
                        properties: {
                            session_id: { type: "string" },
                            pkg: { type: "string" }
                        },
                        required: ["session_id", "pkg"]
                    }
                }
            }
        ),

        destroy_session: Object.assign(
            async (session_id: string) => {
                return destroySession(session_id);
            },
            {
                __schema__: {
                    name: "destroy_session",
                    description: "Destroy a sandbox session",
                    parameters: {
                        type: "object",
                        properties: {
                            session_id: { type: "string" }
                        },
                        required: ["session_id"]
                    }
                }
            }
        )
    });
    
    logger.info(`Service ready: ${SERVICE_ID}`);
}

async function main() {
    try {
        await initializeGlobalSandbox();

        const config = {
            server_url: SERVER_URL,
            token: TOKEN,
            workspace: WORKSPACE,
            client_id: CLIENT_ID
        };
        logger.info(`Connecting to Hypha at ${SERVER_URL} workspace=${WORKSPACE} client_id=${CLIENT_ID || 'auto'}`);

        const client = await hyphaWebsocketClient.connectToServer(config);

        await registerHyphaService(client);
    } catch (error) {
        logger.error("Service initialization failed:", error);
        process.exit(1);
    }
}

main();
