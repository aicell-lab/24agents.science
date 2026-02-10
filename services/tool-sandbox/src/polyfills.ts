
import WebSocket from 'ws';

// @ts-ignore
global.WebSocket = WebSocket;

// Polyfill window for Hypha RPC
if (typeof window === 'undefined') {
    // @ts-ignore
    global.window = {
        ...global,
        addEventListener: (type: string, listener: any) => {},
        removeEventListener: (type: string, listener: any) => {},
        dispatchEvent: (event: any) => false,
    } as any;
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
