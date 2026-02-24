"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
// @ts-ignore
global.WebSocket = ws_1.default;
// Polyfill window for Hypha RPC
if (typeof window === 'undefined') {
    const noop = () => { };
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
        currentScript: { src: 'http://localhost/mock-script.js' },
        createElement: () => ({}),
        getElementsByTagName: () => [],
        head: {}
    };
}
