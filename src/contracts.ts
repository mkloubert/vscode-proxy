// The MIT License (MIT)
// 
// vscode-proxy (https://github.com/mkloubert/vscode-proxy)
// Copyright (c) Marcel Joachim Kloubert <marcel.kloubert@gmx.net>
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

import * as Moment from 'moment';
import * as Net from 'net';
import * as vscode from 'vscode';


/**
 * A quick pick item based on an action.
 */
export interface ActionQuickPickItem<TState = any> extends vscode.QuickPickItem {
    /**
     * The action.
     * 
     * @param {TState} state The value from 'state' property.
     * @param {ActionQuickPickItem} item The underlying object.
     * 
     * @return {any} The result.
     */
    readonly action?: (state: TState, item: ActionQuickPickItem) => any;
    /**
     * The value for the 1st argument of the action.
     */
    readonly state?: TState;
}

/**
 * A module for handling a chunk.
 */
export interface ChunkHandlerModule {
    /**
     * Handles a chunk.
     */
    readonly handleChunk: ChunkHandlerModuleExecutor;
}

/**
 * Logic for handling a chunk.
 * 
 * @param {ChunkHandlerModuleExecutorArguments} args The arguments.
 */
export type ChunkHandlerModuleExecutor = (args: ChunkHandlerModuleExecutorArguments) => any;

/**
 * Arguments for handling a chunk.
 */
export interface ChunkHandlerModuleExecutorArguments extends ScriptArguments {
    /**
     * The current (or new chunk) to send.
     */
    chunk: Buffer;
}

/**
 * Extension settings.
 */
export interface Configuration extends vscode.WorkspaceConfiguration {
    /**
     * The width for binary data in hex view.
     */
    readonly hexWidth?: number;
    /**
     * Default value that indicates if traces should be opened in new tab after trace has been finished or not.
     */
    readonly openAfterTrace?: boolean;
    /**
     * Default output format for traces.
     */
    readonly outputFormat?: string;
    /**
     * One or more proxy entries.
     */
    readonly proxies?: { [port: string]: ProxyEntry; };
    /**
     * Default value for writing trace entries to output or not.
     */
    readonly writeToOutput?: boolean;
}

/**
 * Describes the structure of the package file of that extenstion.
 */
export interface PackageFile {
    /**
     * The display name.
     */
    readonly displayName: string;
    /**
     * The (internal) name.
     */
    readonly name: string;
    /**
     * The version string.
     */
    readonly version: string;
}

/**
 * Proxy destionation.
 */
export enum ProxyDestination {
    /**
     * From source / proxy to target.
     */
    ProxyToTarget = 0,
    /**
     * From target to source / proxy.
     */
    TargetToProxy = 1,
}

/**
 * A proxy entry.
 */
export interface ProxyEntry {
    /**
     * Start proxy on startup or not.
     */
    readonly autoStart?: boolean;
    /**
     * The path to the script that handles a chunk.
     */
    readonly chunkHandler?: string;
    /**
     * Additional options for the "chunk handler".
     */
    readonly chunkHandlerOptions?: any;
    /**
     * An additional description for the proxy.
     */
    readonly description?: string;
    /**
     * The name of the proxy.
     */
    readonly name?: string;
    /**
     * Open traces in new tab after trace has been finished or not.
     */
    readonly openAfterTrace?: boolean;
    /**
     * Output format for traces.
     */
    readonly outputFormat?: string;
    /**
     * The custom list of targets (s. 'to') from where to send answers back
     * to the source / client or (true) or (false) to enable/disable that feature. Default: First target.
     */
    readonly receiveChunksFrom?: boolean | number | number[];
    /**
     * The path to the script that handles a (new) trace entry.
     */
    readonly traceHandler?: string;
    /**
     * Additional options for the "trace handler".
     */
    readonly traceHandlerOptions?: any;
    /**
     * The path to the script that writes a trace list, when tracing is stopped.
     */
    readonly traceWriter?: string;
    /**
     * Additional options for the "trace writer".
     */
    readonly traceWriterOptions?: any;
    /**
     * The destination port(s) or address(es).
     */
    readonly to?: ProxyTarget | ProxyTarget[];
    /**
     * Write trace entries to output or not.
     */
    readonly writeToOutput?: boolean;
}

/**
 * A proxy target.
 */
export type ProxyTarget = string | number;

/**
 * Script arguments.
 */
export interface ScriptArguments {
    /**
     * Additional options for the script.
     */
    readonly options?: any;
}

/**
 * A socket address.
 */
export interface SocketAddress {
    /**
     * The (local) address.
     */
    readonly addr: string;
    /**
     * The (local) TCP port.
     */
    readonly port: number;
}

/**
 * A trace entry.
 */
export interface TraceEntry {
    /**
     * The chunk.
     */
    readonly chunk: Buffer;
    /**
     * Chunk has been send to target or not.
     */
    readonly chunkSend: boolean;
    /**
     * The destination.
     */
    readonly destination: ProxyDestination;
    /**
     * The error (if occurred).
     */
    readonly error?: any;
    /**
     * The session.
     */
    readonly session: {
        /**
         * The ID.
         */
        readonly id: string;
        /**
         * The start time.
         */
        readonly time: Moment.Moment;
    };
    /**
     * The source address.
     */
    readonly source: SocketAddress;
    /**
     * The zero-based index of the source socket.
     */
    readonly sourceIndex: number;
    /**
     * The target address.
     */
    readonly target: SocketAddress;
    /**
     * The zero-based index of the target socket.
     */
    readonly targetIndex: number;
    /**
     * The timestamp.
     */
    readonly time: Moment.Moment;
}

/**
 * A trace handler module.
 */
export interface TraceHandlerModule {
    /**
     * Handles a new trace entry.
     */
    readonly handleTrace: TraceWriterModuleExecutor;
}

/**
 * Executes the trace handler logic.
 * 
 * @param {TraceHandlerModuleExecutorArguments} args The arguments.
 */
export type TraceHandlerModuleExecutor = (args: TraceHandlerModuleExecutorArguments) => any;

/**
 * Arguments for the trace handler.
 */
export interface TraceHandlerModuleExecutorArguments extends ScriptArguments {
    /**
     * The current entry,
     */
    readonly entry: TraceEntry;
    /**
     * The current trace list.
     */
    readonly trace: TraceEntry[];
}

/**
 * A trace writer module.
 */
export interface TraceWriterModule {
    /**
     * Writes a trace list.
     */
    readonly writeTrace: TraceWriterModuleExecutor;
}

/**
 * Executes the trace writer logic.
 * 
 * @param {TraceWriterModuleExecutorArguments} args The arguments.
 */
export type TraceWriterModuleExecutor = (args: TraceWriterModuleExecutorArguments) => any;

/**
 * Arguments for the trace writer.
 */
export interface TraceWriterModuleExecutorArguments extends ScriptArguments {
    /**
     * The trace list to write.
     */
    readonly trace: TraceEntry[];
}
