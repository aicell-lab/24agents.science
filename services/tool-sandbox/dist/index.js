"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sandbox_runtime_1 = require("@anthropic-ai/sandbox-runtime");
const ws_1 = __importDefault(require("ws"));
// @ts-ignore
global.WebSocket = ws_1.default;
const hypha_rpc_1 = require("hypha-rpc");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const crypto = __importStar(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour
// Configuration Constants
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(os.homedir(), 'workspace');
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || path.join(WORKSPACE_DIR, 'sessions');
const SERVER_URL = process.env.HYPHA_SERVER_URL || "https://hypha.aicell.io";
const SERVICE_ID = process.env.SERVICE_ID || "tool-sandbox";
const WORKSPACE = process.env.HYPHA_WORKSPACE;
const TOKEN = process.env.HYPHA_TOKEN;
const IN_DOCKER = process.env.IN_DOCKER === 'true';
// Ensure directories exist
if (!fs.existsSync(WORKSPACE_DIR))
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT))
    fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
const activeSessions = new Map();
// Helper logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg, e) => console.error(`[ERROR] ${msg}`, e || '')
};
function createSessionConfig(sessionDir) {
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
function startSession(timeoutMs = DEFAULT_TIMEOUT_MS) {
    const id = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_ROOT, id);
    const pylibDir = path.join(sessionDir, 'pylib');
    // Create session directories
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(pylibDir, { recursive: true });
    const session = {
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
async function destroySession(id) {
    const session = activeSessions.get(id);
    if (!session)
        return;
    clearTimeout(session.timeoutTimer);
    activeSessions.delete(id);
    logger.info(`Destroying session: ${id}`);
    try {
        await fs.promises.rm(session.dir, { recursive: true, force: true });
    }
    catch (e) {
        logger.error(`Cleanup failed for ${id}:`, e);
    }
}
async function executeSessionCommand(session, command, args = [], cwd) {
    const fullCommand = `${command} ${args.join(' ')}`;
    const workingDir = cwd || session.dir;
    logger.info(`[${session.id}] Executing: ${fullCommand}`);
    const sandboxedCommandParts = await sandbox_runtime_1.SandboxManager.wrapWithSandbox(fullCommand, undefined, session.config);
    const env = {
        ...process.env,
        HOME: session.dir,
        PYTHONPATH: session.pylibDir + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : '')
    };
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(sandboxedCommandParts, {
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
            }
            else {
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
    await sandbox_runtime_1.SandboxManager.initialize({
        network: { allowedDomains: ["*"], deniedDomains: [], allowLocalBinding: true },
        filesystem: { allowWrite: [WORKSPACE_DIR, "/tmp"], denyRead: [], denyWrite: [] },
        enableWeakerNestedSandbox: IN_DOCKER
    });
}
function getSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session)
        throw new Error(`Session ${sessionId} not found`);
    return session;
}
async function registerHyphaService(client) {
    logger.info("Connected. Registering service...");
    await client.registerService({
        id: SERVICE_ID,
        name: "Sandboxed Tool Environment",
        description: "Secure tool execution environment with session isolation.",
        config: { visibility: "public" },
        create_session: Object.assign(async (timeout = DEFAULT_TIMEOUT_MS) => {
            const session = startSession(timeout);
            return session.id;
        }, {
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
        }),
        run_command: Object.assign(async (session_id, cmd, args = [], cwd) => {
            return executeSessionCommand(getSession(session_id), cmd, args, cwd);
        }, {
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
        }),
        install_pip: Object.assign(async (session_id, pkg) => {
            const session = getSession(session_id);
            return executeSessionCommand(session, 'pip', ['install', pkg, '--target', session.pylibDir]);
        }, {
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
        }),
        install_npm: Object.assign(async (session_id, pkg) => {
            return executeSessionCommand(getSession(session_id), 'npm', ['install', pkg]);
        }, {
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
        }),
        destroy_session: Object.assign(async (session_id) => {
            return destroySession(session_id);
        }, {
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
        })
    });
    logger.info(`Service ready: ${SERVICE_ID}`);
}
async function main() {
    try {
        await initializeGlobalSandbox();
        const client = await hypha_rpc_1.hyphaWebsocketClient.connectToServer({
            server_url: SERVER_URL,
            token: TOKEN,
            workspace: WORKSPACE
        });
        await registerHyphaService(client);
    }
    catch (error) {
        logger.error("Service initialization failed:", error);
        process.exit(1);
    }
}
main();
