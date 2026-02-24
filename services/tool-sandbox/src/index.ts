import './polyfills'; // MUST BE FIRST
import { SandboxManager, SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';

import { hyphaWebsocketClient } from 'hypha-rpc';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour

// Configuration Constants
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(os.homedir(), 'workspace');
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || path.join(WORKSPACE_DIR, 'sessions');
const SERVER_URL = process.env.HYPHA_SERVER_URL || "https://hypha.aicell.io";
const SERVICE_ID = process.env.SERVICE_ID || "tool-sandbox-service";
const WORKSPACE = process.env.HYPHA_WORKSPACE;
const TOKEN = process.env.HYPHA_TOKEN;
const IN_DOCKER = process.env.IN_DOCKER === 'true';
const POD_NAME = process.env.POD_NAME;
const CLIENT_ID = process.env.CLIENT_ID || undefined;


// Ensure directories exist
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

interface Session {
    id: string;
    userId?: string;
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

function startSession(timeoutMs: number = DEFAULT_TIMEOUT_MS, userId?: string): Session {
    const id = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_ROOT, id);
    const pylibDir = path.join(sessionDir, 'pylib');

    // Create session directories
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(pylibDir, { recursive: true });

    const session: Session = {
        id,
        userId,
        dir: sessionDir,
        pylibDir,
        timeoutTimer: setTimeout(() => destroySession(id), timeoutMs),
        config: createSessionConfig(sessionDir)
    };

    activeSessions.set(id, session);
    logger.info(`Session started: ${id} (user: ${userId || 'anonymous'})`);
    return session;
}

function findSessionByUser(userId: string): Session | undefined {
    for (const session of activeSessions.values()) {
        if (session.userId === userId) {
            return session;
        }
    }
    return undefined;
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
        config: { 
            visibility: "public",
            require_context: true
        },

        create_session: Object.assign(
            async (timeout_or_kwargs: any, context?: any) => {
                let timeout = DEFAULT_TIMEOUT_MS;
                let ctx = context;
                
                if (timeout_or_kwargs && typeof timeout_or_kwargs === 'object' && !Array.isArray(timeout_or_kwargs)) {
                     // It's kwargs or context
                     if (timeout_or_kwargs.timeout !== undefined) {
                         timeout = timeout_or_kwargs.timeout;
                     }
                     if (!ctx) ctx = timeout_or_kwargs;
                } else if (typeof timeout_or_kwargs === 'number') {
                     timeout = timeout_or_kwargs;
                }
                
                const userId = ctx?.user?.id || ctx?.user?.email;
                const session = startSession(timeout, userId);
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
            async (session_id_or_kwargs: any, cmd?: string, args: string[] = [], cwd?: string, context?: any) => {
                let targetSessionId: string | undefined | null;
                let commandStr: string | undefined;
                let commandArgs: string[] = [];
                let workingDir: string | undefined;
                let ctx = context;

                // Handle Hypha's keyword arguments (passed as a single object)
                if (session_id_or_kwargs && typeof session_id_or_kwargs === 'object' && !Array.isArray(session_id_or_kwargs)) {
                     // Kwargs mode
                     targetSessionId = session_id_or_kwargs.session_id;
                     commandStr = session_id_or_kwargs.cmd;
                     commandArgs = session_id_or_kwargs.args || [];
                     workingDir = session_id_or_kwargs.cwd;
                     // Context might be injected as last arg or present in kwargs? Usually last arg.
                     // If context is undefined, try to use the last arg from the outer function
                     if (!ctx && cmd && typeof cmd === 'object' && !commandStr) {
                         // cmd might be context if only 1 arg was passed
                         ctx = cmd;
                     }
                } else {
                    // Positional mode
                    targetSessionId = session_id_or_kwargs;
                    commandStr = cmd;
                    commandArgs = args;
                    workingDir = cwd;
                }
                
                if (!commandStr) throw new Error("Command (cmd) is required");

                // If session_id is not provided, try to find an existing session for the user
                if (!targetSessionId) {
                    const userId = ctx?.user?.id || ctx?.user?.email;
                    if (userId) {
                        const existingSession = findSessionByUser(userId);
                        if (existingSession) {
                            targetSessionId = existingSession.id;
                        } else {
                            // Create a new session for the user
                            const newSession = startSession(DEFAULT_TIMEOUT_MS, userId);
                            targetSessionId = newSession.id;
                        }
                    } else {
                        throw new Error("Session ID is required when no user context is available.");
                    }
                }

                if (!targetSessionId) {
                     throw new Error("Failed to determine session ID.");
                }

                return executeSessionCommand(getSession(targetSessionId), commandStr, commandArgs, workingDir);
            },
            {
                __schema__: {
                    name: "run_command",
                    description: "Run a shell command in the session. If session_id is not provided, uses or creates a session for the authenticated user.",
                    parameters: {
                        type: "object",
                        properties: {
                            session_id: { type: "string", description: "Optional session ID. If omitted, uses user context." },
                            cmd: { type: "string" },
                            args: { type: "array", items: { type: "string" } },
                            cwd: { type: "string" }
                        },
                        required: ["cmd"]
                    }
                }
            }
        ),

        install_pip: Object.assign(
            async (session_id_or_kwargs: any, pkg?: string, context?: any) => {
                let session_id: string | undefined;
                let package_name: string | undefined;
                
                if (session_id_or_kwargs && typeof session_id_or_kwargs === 'object') {
                    session_id = session_id_or_kwargs.session_id;
                    package_name = session_id_or_kwargs.pkg;
                } else {
                    session_id = session_id_or_kwargs;
                    package_name = pkg;
                }
                
                if (!session_id || !package_name) throw new Error("session_id and pkg are required");

                const session = getSession(session_id);
                return executeSessionCommand(
                    session, 'pip', ['install', package_name, '--target', session.pylibDir]
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
            async (session_id_or_kwargs: any, pkg?: string, context?: any) => {
                let session_id: string | undefined;
                let package_name: string | undefined;
                
                if (session_id_or_kwargs && typeof session_id_or_kwargs === 'object') {
                     session_id = session_id_or_kwargs.session_id;
                     package_name = session_id_or_kwargs.pkg;
                } else {
                     session_id = session_id_or_kwargs;
                     package_name = pkg;
                }

                if (!session_id || !package_name) throw new Error("session_id and pkg are required");

                return executeSessionCommand(getSession(session_id), 'npm', ['install', package_name]);
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
            async (session_id_or_kwargs: any, context?: any) => {
                let session_id: string | undefined;
                if (session_id_or_kwargs && typeof session_id_or_kwargs === 'object') {
                    session_id = session_id_or_kwargs.session_id;
                } else {
                    session_id = session_id_or_kwargs;
                }
                
                if (!session_id) throw new Error("session_id is required");
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
    }, { overwrite: true });

    if (POD_NAME) {
        try {
            logger.info("Registering health check service on separate connection...");
            const healthClient = await hyphaWebsocketClient.connectToServer({
                server_url: SERVER_URL,
                token: TOKEN,
                workspace: WORKSPACE,
                client_id: POD_NAME
            });

            await healthClient.registerService({
                id: "health",
                name: "Health Check",
                description: "Health check service for the pod",
                config: { visibility: "public" },
                ping: async () => "pong"
            }, { overwrite: true });
            logger.info("Health check service registered.");
        } catch (e) {
            logger.error("Failed to register health service:", e);
        }
    }

    logger.info(`Service ready: ${SERVICE_ID}`);
}


let globalClient: any;

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

        globalClient = await hyphaWebsocketClient.connectToServer(config);

        await registerHyphaService(globalClient);
    } catch (error) {
        logger.error("Service initialization failed:", error);
        process.exit(1);
    }
}

main();
