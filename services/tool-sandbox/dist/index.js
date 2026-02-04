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
Object.defineProperty(exports, "__esModule", { value: true });
const sandbox_runtime_1 = require("@anthropic-ai/sandbox-runtime");
const hypha_rpc_1 = require("hypha-rpc");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const crypto = __importStar(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(os.homedir(), 'workspace');
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || path.join(WORKSPACE_DIR, 'sessions');
const SERVER_URL = process.env.HYPHA_SERVER_URL || "https://hypha.aicell.io";
const SERVICE_ID = process.env.SERVICE_ID || "tool-sandbox";
const WORKSPACE = process.env.HYPHA_WORKSPACE;
const TOKEN = process.env.HYPHA_TOKEN;
if (!fs.existsSync(WORKSPACE_DIR))
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT))
    fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
const activeSessions = new Map();
function startSession(timeoutMs = 3600000) {
    const id = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_ROOT, id);
    const pylibDir = path.join(sessionDir, 'pylib');
    if (!fs.existsSync(sessionDir))
        fs.mkdirSync(sessionDir, { recursive: true });
    if (!fs.existsSync(pylibDir))
        fs.mkdirSync(pylibDir, { recursive: true });
    const timeoutTimer = setTimeout(() => destroySession(id), timeoutMs);
    const session = {
        id,
        dir: sessionDir,
        pylibDir,
        timeoutTimer,
        config: {
            network: { allowedDomains: ["*"], allowLocalBinding: true, deniedDomains: [] },
            filesystem: {
                allowWrite: [sessionDir, "/tmp"],
                denyWrite: [],
                denyRead: ["/root/.ssh", "/etc/shadow"]
            },
            enableWeakerNestedSandbox: process.env.IN_DOCKER === 'true'
        }
    };
    activeSessions.set(id, session);
    console.log(`Session started: ${id}`);
    return session;
}
async function destroySession(id) {
    const session = activeSessions.get(id);
    if (!session)
        return;
    clearTimeout(session.timeoutTimer);
    activeSessions.delete(id);
    console.log(`Destroying session: ${id}`);
    try {
        await fs.promises.rm(session.dir, { recursive: true, force: true });
    }
    catch (e) {
        console.error(`Cleanup failed for ${id}:`, e);
    }
}
async function executeSessionCommand(session, command, args = [], cwd) {
    const fullCommand = `${command} ${args.join(' ')}`;
    const workingDir = cwd || session.dir;
    console.log(`[${session.id}] Executing: ${fullCommand}`);
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
            if (code === 0)
                resolve({ stdout, stderr, code });
            else
                resolve({ stdout, stderr, code, error: `Exited with code ${code}` });
        });
        child.on('error', (err) => {
            const e = new Error(err.message);
            Object.assign(e, { stdout, stderr });
            reject(e);
        });
    });
}
async function main() {
    console.log("Initializing Sandbox...");
    await sandbox_runtime_1.SandboxManager.initialize({
        network: { allowedDomains: ["*"], deniedDomains: [], allowLocalBinding: true },
        filesystem: { allowWrite: [WORKSPACE_DIR, "/tmp"], denyRead: [], denyWrite: [] },
        enableWeakerNestedSandbox: process.env.IN_DOCKER === 'true'
    });
    const client = await hypha_rpc_1.hyphaWebsocketClient.connectToServer({
        server_url: SERVER_URL,
        token: TOKEN,
        workspace: WORKSPACE
    });
    console.log("Connected. Registering service...");
    await client.registerService({
        id: SERVICE_ID,
        name: "Sandboxed Tool Environment",
        description: "Secure tool execution environment with session isolation.",
        config: { visibility: "public", require_context: true },
        create_session: async (timeout = 3600000, context) => {
            const session = startSession(timeout);
            return {
                id: session.id,
                run_command: async (cmd, args = [], cwd) => executeSessionCommand(session, cmd, args, cwd),
                install_pip: async (pkg) => executeSessionCommand(session, 'pip', ['install', pkg, '--target', session.pylibDir]),
                install_npm: async (pkg) => executeSessionCommand(session, 'npm', ['install', pkg]),
                destroy: async () => destroySession(session.id)
            };
        }
    });
    console.log(`Service ready: ${SERVICE_ID}`);
}
main().catch(console.error);
