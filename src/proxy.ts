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

import * as Enumerable from 'node-enumerable';
import * as Events from 'events';
import * as FileSize from 'filesize';
const Hexy = require('hexy');
import * as Moment from 'moment';
import * as Net from 'net';
import * as Stream from 'stream';
import * as UUID from 'uuid';
import * as vscode from 'vscode';
import * as vsp_contracts from './contracts';
import * as vsp_controller from './controller';
import * as vsp_helpers from './helpers';


interface EntryWithSocket {
    readonly entry: { host: string; port: number; };
    readonly socket: Net.Socket;
}

interface ProxyStatistics {
    bytesReceived: number;
    bytesSend: number;
    chunksReceived: number;
    chunksSend: number;
    lastChunks: {
        received?: vsp_contracts.TraceEntry;
        send?: vsp_contracts.TraceEntry;
    };
}


let nextCommandsId = -1;

function getTraceGroup(entry: vsp_contracts.TraceEntry) {
    if (!entry) {
        return;
    }

    const DESTINATION = entry.destination;
    const SOURCE = `[${entry.sourceIndex}] ${entry.source.addr}:${entry.source.port}`;
    const TARGET = `[${entry.targetIndex}] ${entry.target.addr}:${entry.target.port}`;
    const SESSION = `${entry.session.id}\t${entry.session.time.toDate().getTime()}`;

    return `${DESTINATION}\n${SOURCE}\n${TARGET}\n${SESSION}`;
};

function toSocketAddressPipeString(entry: vsp_contracts.TraceEntry) {
    let separator: string;
    let left: string;
    let right: string;
    switch (entry.destination) {
        case vsp_contracts.ProxyDestination.ProxyToTarget:
            separator = '=>';
            left = `[${entry.sourceIndex}] '${entry.source.addr}:${entry.source.port}'`;
            right = `[${entry.targetIndex}] '${entry.target.addr}:${entry.target.port}'`;
            break;

        case vsp_contracts.ProxyDestination.TargetToProxy:
            separator = '<=';
            right = `[${entry.sourceIndex}] '${entry.source.addr}:${entry.source.port}'`;
            left = `[${entry.targetIndex}] '${entry.target.addr}:${entry.target.port}'`;
            break;
    }

    return `${left} ${separator} ${right}`;
}

/**
 * A TCP proxy.
 */
export class TcpProxy extends Events.EventEmitter implements vscode.Disposable {
    private _button: vscode.StatusBarItem;
    private _buttonCommand: vscode.Disposable;
    private readonly _COMMANDS_ID = ++nextCommandsId;
    private readonly _CONTROLLER: vsp_controller.Controller;
    private readonly _ENTRY: vsp_contracts.ProxyEntry;
    private _globalScriptState: Object;
    private readonly _INDEX: number;
    private _isInitialized = false;
    private readonly _PORT: number;
    private _server: Net.Server;
    private _statistics: ProxyStatistics;
    private _trace: vsp_contracts.TraceEntry[];
    private _traceWriterState: any;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {vsp_controller.Controller} controller The underlying controller.
     * @param {number} port The TCP port.
     * @param {vsp_contracts.ProxyEntry} entry The underlying entry.
     * @param {number} index The zero-based index of that proxy.
     */
    constructor(controller: vsp_controller.Controller,
                port: number,
                entry: vsp_contracts.ProxyEntry, index: number) {
        super();

        this._CONTROLLER = controller;
        this._PORT = port;
        this._ENTRY = entry;
        this._INDEX = index;
    }

    /**
     * Gets the underlying controller.
     */
    public get controller(): vsp_controller.Controller {
        return this._CONTROLLER;
    }

    /**
     * Gets the default button color.
     */
    public get defaultButtonColor() {
        return this.isTracing ? '#ffffff' : '#808080';
    }

    /** @inheritdoc */
    public dispose() {
        this.removeAllListeners();

        vsp_helpers.tryDispose(this._button);
        vsp_helpers.tryDispose(this._buttonCommand);

        const OLD_SERVER = this._server;
        if (OLD_SERVER) {
            OLD_SERVER.close();
        }

        this._button = null;
        this._buttonCommand = null;

        this._server = null;
    }

    /**
     * Gets the underlying entry.
     */
    public get entry(): vsp_contracts.ProxyEntry {
        return this._ENTRY;
    }

    /**
     * Gets the zero-based index of that proxy.
     */
    public get index(): number {
        return this._INDEX;
    }

    /**
     * Initailizes that proxy.
     */
    public async init() {
        const ME = this;

        if (ME.isInitialized) {
            return;
        }

        // toggle trace button
        try {
            const CMD = `extension.proxy.proxies${ME._COMMANDS_ID}.showTraceActions`;

            ME._buttonCommand = vscode.commands.registerCommand(CMD, async () => {
                await ME.showTraceActions();
            });

            ME._button = vscode.window.createStatusBarItem();
            ME._button.command = CMD;
            
            ME._button.hide();

            ME.updateButton();

            ME._button.color = ME.defaultButtonColor;
        }
        catch (e) {
            vsp_helpers.tryDispose(ME._button);
            vsp_helpers.tryDispose(ME._buttonCommand);

            throw e;
        }

        ME._isInitialized = true;
    }

    /**
     * Gets if the proxy has been initialized or not.
     */
    public get isInitialized() {
        return this._isInitialized;
    }

    /**
     * Gets if proxy is running or not.
     */
    public get isRunning() {
        return !!this._server;
    }

    /**
     * Gets if the proxy is current in trace mode or not.
     */
    public get isTracing() {
        return !!this._trace;
    }

    /**
     * Gets the (display) name of that proxy.
     */
    public get name(): string {
        return vsp_helpers.getProxyName(
            this.entry.name,
            this.port,
            this.index + 1,
        );
    }

    /**
     * Opens all trace items or a specific one in a new tab.
     * 
     * @param {number} [index] The zero-based index of the specific one.
     */
    public async openTraceInNewTab(index?: number) {
        const ME = this;

        const ALL_TRACE = this._trace;
        if (!ALL_TRACE) {
            return;
        }

        let trace: vsp_contracts.TraceEntry[];
        if (isNaN(index)) {
            trace = ALL_TRACE;
        }
        else {
            trace = [ ALL_TRACE[index] ];
        }

        const SHOW_IN_NEW_TAB = vsp_helpers.toBooleanSafe(ME.entry.openAfterTrace,
                                                          vsp_helpers.toBooleanSafe(ME.controller.config.openAfterTrace, true));

        if (!SHOW_IN_NEW_TAB) {
            return;
        }

        const GET_GROUPED_TASKS = () => {
            return Enumerable.from(ALL_TRACE).groupBy(x => {
                return getTraceGroup(x);
            });
        };

        try {
            const EOL = "\n";

            let outputFormat = vsp_helpers.normalizeString(ME.entry.outputFormat);
            if ('' === outputFormat) {
                outputFormat = vsp_helpers.normalizeString(ME.controller.config.outputFormat);
            }

            let editorText: string;
            let lang = 'plaintext';
            switch (outputFormat) {
                case 'ascii':
                    editorText = trace.map(te => {
                        if (te.chunk) {
                            return te.chunk.toString('ascii');
                        }

                        return '';
                    }).join(EOL + EOL);
                    break;

                case 'http':
                    {
                        let editorContent = Buffer.alloc(0);

                        GET_GROUPED_TASKS().where(grp => {
                            return trace.map(t => getTraceGroup(t))
                                        .indexOf(grp.key) > -1;
                        }).forEach(grp => {
                            grp.each(x => {
                                if (x.chunk) {
                                    editorContent = Buffer.concat([
                                        editorContent,
                                        x.chunk,
                                    ]);
                                }
                            });
                        });

                        editorText = editorContent.toString('ascii');
                    }
                    break;

                case 'json':
                    editorText = JSON.stringify(trace, null, 2);
                    lang = 'json';
                    break;

                default:
                    editorText = trace.map(te => {
                        return ME.traceEntryToString(te)
                                 .split("\n").join(EOL);
                    }).join(EOL);
                    break;
            }

            const EDITOR = await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument({
                    language: lang,
                    content: editorText,
                }),
            );
        }
        catch (e) {
            console.trace('[Proxy] controller.openTraceInNewTab(): ' +
                          vsp_helpers.toStringSafe(e));
        }
    }

    /**
     * The TCP port.
     */
    public get port(): number {
        return this._PORT;
    }

    /**
     * Shows trace actions.
     */
    public async showTraceActions() {
        const ME = this;

        try {
            ME._button.color = ME.defaultButtonColor;

            const QUICK_PICKS: vsp_contracts.ActionQuickPickItem[] = [];

            const IS_TRACING = ME.isTracing;
            const TRACE = (ME.trace || []).map((te, i) => {
                return {
                    entry: te,
                    index: i,
                };
            });
            {
                if (IS_TRACING) {
                    TRACE.sort((x, y) => {
                        return vsp_helpers.compareValuesBy(y, x,
                                                           i => i.index);
                    }).forEach(x => {
                        let traceDescription: string;

                        let icon: string;
                        switch (x.entry.destination) {
                            case vsp_contracts.ProxyDestination.ProxyToTarget:
                                icon = 'arrow-up';
                                break;

                            case vsp_contracts.ProxyDestination.TargetToProxy:
                                icon = 'arrow-down';
                                break;
                        }

                        let traceLabel = `$(${icon})  [${x.index + 1}] ${x.entry.time.format('YYYY-MM-DD HH:mm:ss.SSS')}`;

                        QUICK_PICKS.push({
                            description: traceDescription,
                            label: traceLabel,
                            action: async () => {
                                await ME.openTraceInNewTab(x.index);
                            }
                        });
                    });
                }

                // toggle tracing
                {
                    let label: string;
                    if (IS_TRACING) {
                        label = '$(primitive-square)  Stop tracing...';
                    }
                    else {
                        label = '$(triangle-right)  Start tracing...';
                    }
    
                    QUICK_PICKS.push({
                        description: '',
                        label: label,
                        action: async () => {
                            await ME.toggleTrace();
                        }
                    });
                }

                let selectedItem: vsp_contracts.ActionQuickPickItem;
                if (IS_TRACING) {
                    selectedItem = await vscode.window.showQuickPick(QUICK_PICKS);
                }
                else {
                    selectedItem = QUICK_PICKS[0];
                }

                if (selectedItem) {
                    if (selectedItem.action) {
                        await Promise.resolve(
                            selectedItem.action(selectedItem.state,
                                                selectedItem),
                        );
                    }
                }
            }
        }
        catch (e) {
            console.trace(`[Proxy] TcpProxy.showTraceActions()`);
        }
    }

    /**
     * Starts the proxy.
     * 
     * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    public start() {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = vsp_helpers.createSimpleCompletedAction(resolve, reject);

            if (ME._server) {
                COMPLETED(null, false);
                return;
            }

            try {
                const CFG = vsp_helpers.cloneObject(ME.controller.config);
                const PKG_FILE = vsp_helpers.cloneObject(ME.controller.packageFile);

                const SOURCE = vsp_helpers.getPortSafe(ME.port, 8081);
                const TARGETS = vsp_helpers.asArray(ME.entry.to).filter(t => {
                    return !vsp_helpers.isNullOrUndefined(t);
                }).map(t => {
                    return vsp_helpers.getHostAndPort(t, 8080);
                });

                let receiveChunksFrom: false | number[] = <any>ME.entry.receiveChunksFrom;
                if (vsp_helpers.isNullOrUndefined(receiveChunksFrom)) {
                    receiveChunksFrom = [ 0 ];  // default: first target
                }
                else {
                    if (false !== receiveChunksFrom) {
                        receiveChunksFrom = vsp_helpers.asArray(receiveChunksFrom).map(x => {
                            return parseInt( vsp_helpers.toStringSafe(x).trim() );
                        }).filter(x => !isNaN(x));
                    }
                }

                if (Array.isArray(receiveChunksFrom)) {
                    receiveChunksFrom = vsp_helpers.distinctArray( receiveChunksFrom );
                }

                // trace handler
                let handleTrace: vsp_contracts.TraceHandlerModuleExecutor;
                let handleTraceOptions = vsp_helpers.cloneObject(
                    this.entry.traceHandlerOptions,
                );
                let handleTraceState = vsp_helpers.cloneObject(
                    this.entry.traceHandlerState
                );
                if (!vsp_helpers.isEmptyString(this.entry.traceHandler)) {
                    const HANDLER_MODULE = vsp_helpers.loadModule<vsp_contracts.TraceHandlerModule>(this.entry.traceHandler);
                    if (HANDLER_MODULE) {
                        handleTrace = HANDLER_MODULE.handleTrace;
                    }
                }

                // chunk handler
                let handleChunk: vsp_contracts.ChunkHandlerModuleExecutor;
                let handleChunkOptions = vsp_helpers.cloneObject(
                    this.entry.chunkHandlerOptions,
                );
                let handleChunkState = vsp_helpers.cloneObject(
                    this.entry.chunkHandlerState
                );
                if (!vsp_helpers.isEmptyString(this.entry.chunkHandler)) {
                    const HANDLER_MODULE = vsp_helpers.loadModule<vsp_contracts.ChunkHandlerModule>(this.entry.chunkHandler);
                    if (HANDLER_MODULE) {
                        handleChunk = HANDLER_MODULE.handleChunk;
                    }
                }

                const WRITE_TO_OUTPUT = vsp_helpers.toBooleanSafe(
                    ME.entry.writeToOutput,
                    vsp_helpers.toBooleanSafe(CFG.writeToOutput),
                );

                const GLOBALS = vsp_helpers.cloneObject(CFG.globals);

                const HANDLE_ERROR = (err: any, source?: any) => {
                    if (!err) {
                        return;
                    }

                    console.trace(`[Proxy] TcpProxy.start(HANDLE_ERROR): ${vsp_helpers.toStringSafe(err)}`);
                };

                const HANDLE_TRACE_ENTRY = (newEntry: vsp_contracts.TraceEntry) => {
                    if (!newEntry) {
                        return;
                    }

                    const TRACE = ME._trace;

                    // append to trace
                    try {
                        if (TRACE) {
                            TRACE.push(newEntry);
                        }
                    }
                    catch (e) {
                        console.trace('[Proxy] proxy.TcpProxy.start(append trace): ' +
                                      vsp_helpers.toStringSafe(e));
                    }

                    // write to output
                    if (ME.isTracing) {
                        if (WRITE_TO_OUTPUT) {
                            try {
                                ME.controller.outputChannel.append(
                                    ME.traceEntryToString(newEntry),
                                );
                            }
                            catch (e) {
                                console.trace('[Proxy] proxy.TcpProxy.start(write to output): ' +
                                              vsp_helpers.toStringSafe(e));
                            }
                        }
                    }

                    // trace handler
                    if (handleTrace) {
                        const ARGS: vsp_contracts.TraceHandlerModuleExecutorArguments = {
                            config: CFG,
                            context: ME.controller.context,
                            entry: newEntry,
                            globals: GLOBALS,
                            globalState: ME._globalScriptState,
                            options: handleTraceOptions,
                            outputChannel: ME.controller.outputChannel,
                            packageFile: PKG_FILE,
                            state: undefined,
                            trace: TRACE,
                        };

                        // ARGS.state
                        Object.defineProperty(ARGS, 'state', {
                            get: () => handleTraceState,
                            set: (newValue) => {
                                handleTraceState = newValue;
                            },
                        });

                        handleTrace(ARGS);
                    }
                };

                const HANDLE_CHUNK = (chunk: Buffer) => {
                    let newCunk = chunk;

                    // chunk handler
                    if (handleChunk) {
                        const ARGS: vsp_contracts.ChunkHandlerModuleExecutorArguments = {
                            chunk: chunk,
                            config: CFG,
                            context: ME.controller.context,
                            globals: GLOBALS,
                            globalState: ME._globalScriptState,
                            options: handleChunkOptions,
                            outputChannel: ME.controller.outputChannel,
                            packageFile: PKG_FILE,
                            state: undefined,
                        };

                        // ARGS.state
                        Object.defineProperty(ARGS, 'state', {
                            get: () => handleChunkState,
                            set: (newValue) => {
                                handleChunkState = newValue;
                            },
                        });
        
                        handleChunk(ARGS);

                        newCunk = ARGS.chunk;
                    }

                    return newCunk;
                };

                let newServer: Net.Server;
                const NEW_STATS: ProxyStatistics = {
                    bytesReceived: 0,
                    bytesSend: 0,
                    chunksReceived: 0,
                    chunksSend: 0,
                    lastChunks: {},
                };

                newServer = Net.createServer((from) => {
                    try {
                        const SESSION = {
                            id: UUID.v4(),
                            time: Moment.utc(),
                        };

                        from.on('error', (err) => {
                            HANDLE_ERROR(err, from);
                        });

                        const ENTRIES_AND_SOCKETS: EntryWithSocket[] = [];
                        TARGETS.forEach((te, i) => {
                            const TO = Net.createConnection({
                                host: te.host,
                                port: te.port,
                            });

                            const NEW_TO: EntryWithSocket = {
                                entry: te,
                                socket: TO,
                            };

                            TO.on('error', (err) => {
                                HANDLE_ERROR(err, TO);
                            });

                            TO.once('end', () => {
                                TO.end();
                            });

                            TO.on('data', function(chunk) {
                                try {
                                    const NOW = Moment.utc();

                                    chunk = HANDLE_CHUNK(
                                        chunk
                                    );

                                    let err: any;
                                    let chunkSend = false;
                                    if (chunk) {
                                        let sendBack = false;

                                        if (!Array.isArray(receiveChunksFrom)) {
                                            sendBack = vsp_helpers.toBooleanSafe(receiveChunksFrom);
                                        }
                                        else {
                                            sendBack = receiveChunksFrom.indexOf(i) > -1;
                                        }

                                        if (sendBack) {
                                            try {
                                                from.write(chunk);  // send "answer"

                                                chunkSend = true;

                                                NEW_STATS.bytesReceived += chunk.length;
                                                ++NEW_STATS.chunksReceived;
                                            }
                                            catch (e) {
                                                e = err;
                                            }
                                        }
                                    }

                                    const SOURCE_ADDR: vsp_contracts.SocketAddress = {
                                        addr: TO.remoteAddress,
                                        port: TO.remotePort,
                                    };
                                    const TARGET_ADDR: vsp_contracts.SocketAddress = {
                                        addr: from.remoteAddress,
                                        port: from.remotePort,
                                    };

                                    const NEW_TRACE_ENTRY: vsp_contracts.TraceEntry = {
                                        chunk: chunk,
                                        chunkSend: chunkSend,
                                        destination: vsp_contracts.ProxyDestination.TargetToProxy,
                                        error: err,
                                        session: SESSION,
                                        source: SOURCE_ADDR,
                                        sourceIndex: i,
                                        target: TARGET_ADDR,
                                        targetIndex: 0,
                                        time: NOW,
                                    };

                                    NEW_STATS.lastChunks.received = NEW_TRACE_ENTRY;

                                    ME.updateButton();

                                    HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                    ME.emit('new_trace_entry',
                                            NEW_TRACE_ENTRY);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, from);
                                }
                            });

                            ENTRIES_AND_SOCKETS.push(NEW_TO);
                        });

                        from.once('end', () => {
                            from.end();
                        });

                        from.on('data', async function(chunk) {
                            ENTRIES_AND_SOCKETS.forEach((t, index) => {
                                try {
                                    const NOW = Moment.utc();

                                    chunk = HANDLE_CHUNK(
                                        chunk
                                    );

                                    let err: any;
                                    let chunkSend = false;
                                    if (chunk) {
                                        try {
                                            t.socket.write(chunk);  // send "request"

                                            chunkSend = true;

                                            NEW_STATS.bytesSend += chunk.length;
                                            ++NEW_STATS.chunksSend;
                                        }
                                        catch (e) {
                                            err = e;
                                        }
                                    }
                                    
                                    const SOURCE_ADDR: vsp_contracts.SocketAddress = {
                                        addr: from.remoteAddress,
                                        port: from.remotePort,
                                    };
                                    const TARGET_ADDR: vsp_contracts.SocketAddress = {
                                        addr: t.socket.remoteAddress,
                                        port: t.socket.remotePort,
                                    };

                                    const NEW_TRACE_ENTRY: vsp_contracts.TraceEntry = {
                                        chunk: chunk,
                                        chunkSend: chunkSend,
                                        destination: vsp_contracts.ProxyDestination.ProxyToTarget,
                                        error: err,
                                        session: SESSION,
                                        source: SOURCE_ADDR,
                                        sourceIndex: 0,
                                        target: TARGET_ADDR,
                                        targetIndex: index,
                                        time: NOW,
                                    };

                                    NEW_STATS.lastChunks.send = NEW_TRACE_ENTRY;

                                    ME.updateButton();

                                    HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                    ME.emit('new_trace_entry',
                                            NEW_TRACE_ENTRY);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, t.socket);
                                }
                            });
                        });
                    }
                    catch (e) {
                        HANDLE_ERROR(e, newServer);
                    }
                });

                newServer.once('error', (err) => {
                    if (err) {
                        COMPLETED(err);
                    }
                });
                
                newServer.listen(SOURCE, () => {
                    ME._statistics = NEW_STATS;
                    ME._globalScriptState = {};
                    ME._traceWriterState = vsp_helpers.cloneObject(ME.entry.traceWriterState);
                    ME._server = newServer;

                    ME.updateButton();
                    ME._button.color = ME.defaultButtonColor;

                    ME._button.show();

                    COMPLETED(null, true);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Stops the proxy.
     * 
     * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    public stop() {
        const ME = this;

        return new Promise<boolean>((resolve, reject) => {
            const COMPLETED = vsp_helpers.createSimpleCompletedAction(resolve, reject);

            const OLD_SERVER = ME._server;
            if (!OLD_SERVER) {
                COMPLETED(null, false);
                return;
            }

            try {
                OLD_SERVER.close(() => {
                    ME._button.hide();
                    ME.updateButton();

                    ME._server = null;
                    ME._globalScriptState = null;
                    ME._traceWriterState = null;

                    COMPLETED(null, true);
                });
            }
            catch (e) {
                COMPLETED(e);
            }
        });
    }

    /**
     * Gets the current trace.
     */
    public get trace(): vsp_contracts.TraceEntry[] {
        return this._trace;
    }

    /**
     * Converts a trace entry to a string.
     * 
     * @param {vsp_contracts.TraceEntry} entry The entry to convert.
     * 
     * @return {string} The entry as string.
     */
    public traceEntryToString(entry: vsp_contracts.TraceEntry) {
        const ME = this;

        let hexWidth = parseInt( vsp_helpers.toStringSafe(ME.controller.config.hexWidth) );
        if (isNaN(hexWidth)) {
            hexWidth = 16;
        }
        
        let line = '';
        const APPEND_LINE = (val: any) => {
            line += vsp_helpers.toStringSafe(val);
            line += "\n";
        };

        if (entry) {
            APPEND_LINE(`[TRACE] '${ME.name}': ${toSocketAddressPipeString(entry)}`);
            if (entry.chunk) {
                APPEND_LINE( Hexy.hexy(entry.chunk, { width: hexWidth }) );    
            }
        }

        return line;
    }

    /**
     * Toggles trace state.
     * 
     * @return {Promise<TraceEntry[]>} The promise with the current trace.
     */
    public async toggleTrace() {
        const ME = this;

        let trace: vsp_contracts.TraceEntry[];
        
        if (ME.isTracing) {
            trace = ME.trace;

            if (!vsp_helpers.isEmptyString(ME.entry.traceWriter)) {
                const ARGS: vsp_contracts.TraceWriterModuleExecutorArguments = {
                    config: vsp_helpers.cloneObject(ME.controller.config),
                    context: ME.controller.context,
                    globals: vsp_helpers.cloneObject(
                        ME.controller.config.globals
                    ),
                    globalState: ME._globalScriptState,
                    options: vsp_helpers.cloneObject(
                        ME.entry.traceWriterOptions,
                    ),
                    outputChannel: ME.controller.outputChannel,
                    packageFile: vsp_helpers.cloneObject(ME.controller.packageFile),
                    state: undefined,
                    trace: trace,
                };

                // ARGS.state
                Object.defineProperty(ARGS, 'state', {
                    get: () => ME._traceWriterState,
                    set: (newValue) => {
                        ME._traceWriterState = newValue;
                    },
                });

                const WRITER_MODULE = vsp_helpers.loadModule<vsp_contracts.TraceWriterModule>(ME.entry.traceWriter);
                if (WRITER_MODULE) {
                    const WRITE_TRACE = WRITER_MODULE.writeTrace;
                    if (WRITE_TRACE) {
                        await Promise.resolve(
                            WRITE_TRACE(ARGS),
                        );
                    }
                }
            }
            
            await ME.openTraceInNewTab();

            ME._trace = null;
        }
        else {
            trace = ME._trace = [];
        }

        ME.updateButton();

        return trace;
    }

    /**
     * Updates the underlying button.
     */
    protected updateButton() {
        const BTN = this._button;
        if (!BTN) {
            return;
        }

        let text = `$(microscope)  ${this.name}`;

        let color = this.defaultButtonColor;

        let tooltip = '';

        const STATS = this._statistics;
        if (STATS) {
            tooltip += `Send: ${STATS.chunksSend} chunk(s) / ${STATS.bytesSend} byte(s)
Received: ${STATS.chunksReceived} chunk(s) / ${STATS.bytesReceived} byte(s)
`;

            const LAST_SEND = STATS.lastChunks.send;
            if (LAST_SEND) {
                tooltip += `
Last send: ${LAST_SEND.time.format('YYYY-MM-DD HH:mm:ss.SSS')}
${toSocketAddressPipeString(LAST_SEND)}
${LAST_SEND.chunk ? FileSize(LAST_SEND.chunk.length) : '---'}
`;
            }

            const LAST_RECEIVE = STATS.lastChunks.received;
            if (LAST_RECEIVE) {
                tooltip += `
Last receive: ${LAST_RECEIVE.time.format('YYYY-MM-DD HH:mm:ss.SSS')}
${toSocketAddressPipeString(LAST_RECEIVE)}
${LAST_RECEIVE.chunk ? FileSize(LAST_RECEIVE.chunk.length) : '---'}
`;
            }

            text += ` (S: ${STATS.chunksSend} (${FileSize(STATS.bytesSend)}); R: ${STATS.chunksReceived} (${FileSize(STATS.bytesReceived)}))`;
        }

        text = text.trim();
        tooltip = tooltip.trim();

        if (BTN.text !== text) {
            BTN.text = text;

            color = '#ffff00';
        }
        if (BTN.tooltip !== tooltip) {
            BTN.tooltip = tooltip;
        }

        if (BTN.color !== color) {
            BTN.color = color;
        }
    }
}
