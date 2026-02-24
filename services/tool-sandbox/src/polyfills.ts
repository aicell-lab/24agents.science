
import WebSocket from 'ws';

// @ts-ignore
global.WebSocket = WebSocket;

// Polyfill window for Hypha RPC
if (typeof window === 'undefined') {
    const noop = () => {};
    // @ts-ignore
    global.window = global;
    // @ts-ignore
    global.window.addEventListener = noop;
    // @ts-ignore
    global.window.removeEventListener = noop;
    // @ts-ignore
    global.window.dispatchEvent = () => false;
}

if (typeof MessageChannel === 'undefined') {
    const { MessageChannel, MessagePort } = require('worker_threads');
    global.MessageChannel = MessageChannel;
    global.MessagePort = MessagePort;
}

// Polyfill document for Hypha RPC Webpack "Automatic publicPath" check
if (typeof document === 'undefined') {
    // @ts-ignore
    global.document = {
        currentScript: { src: 'http://localhost/mock-script.js' } as any,
        createElement: () => ({} as any),
        getElementsByTagName: () => ([] as any),
        head: {} as any
    } as any;
}
