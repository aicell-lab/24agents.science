import { SandboxManager, SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { hyphaWebsocketClient } from 'hypha-rpc';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(os.homedir(), 'workspace');
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || path.join(WORKSPACE_DIR, 'sessions');
const SERVER_URL = process.env.HYPHA_SERVER_URL || "https://hypha.aicell.io";
const SERVICE_ID = process.env.SERVICE_ID || "tool-sandbox";
const WORKSPACE = process.env.HYPHA_WORKSPACE;
const TOKEN = process.env.HYPHA_TOKEN;

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

function startSession(timeoutMs: number = 3600000): Session {
    const id = crypto.randomUUID();
    const sessionDir = path.join(SESSIONS_ROOT, id);
    const pylibDir = path.join(sessionDir, 'pylib');

    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    if (!fs.existsSync(pylibDir)) fs.mkdirSync(pylibDir, { recursive: true });

    const timeoutTimer = setTimeout(() => destroySession(id), timeoutMs);

    const session: Session = {
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

async function destroySession(id: string) {
    const session = activeSessions.get(id);
    if (!session) return;

    clearTimeout(session.timeoutTimer);
    activeSessions.delete(id);
    console.log(`Destroying session: ${id}`);

    try {
        await fs.promises.rm(session.dir, { recursive: true, force: true });
    } catch (e) {
        console.error(`Cleanup failed for ${id}:`, e);
    }
}

async function executeSessionCommand(session: Session, command: string, args: string[] = [], cwd?: string) {
    const fullCommand = `${command} ${args.join(' ')}`;
    const workingDir = cwd || session.dir;
    
    console.log(`[${session.id}] Executing: ${fullCommand}`);

    const sandboxedCommandParts = await SandboxManager.wrapWithSandbox(fullCommand, undefined, session.config);

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
            if (code === 0) resolve({ stdout, stderr, code });
            else resolve({ stdout, stderr, code, error: `Exited with code ${code}` });
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
    await SandboxManager.initialize({
        network: { allowedDomains: ["*"], deniedDomains: [], allowLocalBinding: true },
        filesystem: { allowWrite: [WORKSPACE_DIR, "/tmp"], denyRead: [], denyWrite: [] },
        enableWeakerNestedSandbox: process.env.IN_DOCKER === 'true'
    });

    const client = await hyphaWebsocketClient.connectToServer({
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

        create_session: async (timeout: number = 3600000, context: any = null) => {
            const session = startSession(timeout);
            return session.id;
        },

        run_command: async (session_id: string, cmd: string, args: string[] = [], cwd?: string) => {
            const session = activeSessions.get(session_id);
            if (!session) throw new Error(`Session ${session_id} not found`);
            return executeSessionCommand(session, cmd, args, cwd);
        },

        install_pip: async (session_id: string, pkg: string) => {
            const session = activeSessions.get(session_id);
            if (!session) throw new Error(`Session ${session_id} not found`);
            return executeSessionCommand(session, 'pip', ['install', pkg, '--target', session.pylibDir]);
        },

        install_npm: async (session_id: string, pkg: string) => {
            const session = activeSessions.get(session_id);
            if (!session) throw new Error(`Session ${session_id} not found`);
            return executeSessionCommand(session, 'npm', ['install', pkg]);
        },

        destroy_session: async (session_id: string) => {
            return destroySession(session_id);
        }
    });
    
    console.log(`Service ready: ${SERVICE_ID}`);
}

main().catch(console.error);
