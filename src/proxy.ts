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

import * as Events from 'events';
import * as Net from 'net';
import * as Stream from 'stream';
import * as vscode from 'vscode';
import * as vsp_contracts from './contracts';
import * as vsp_helpers from './helpers';


interface EntryWithSocket {
    readonly entry: { host: string; port: number; };
    readonly socket: Net.Socket;
}


/**
 * A TCP proxy.
 */
export class TcpProxy extends Events.EventEmitter implements vscode.Disposable {
    private readonly _ENTRY: vsp_contracts.ProxyEntry;
    private readonly _PORT: number;
    private _server: Net.Server;
    private _trace: vsp_contracts.TraceEntry[];

    /**
     * Initializes a new instance of that class.
     * 
     * @param {number} port The TCP port.
     * @param {vsp_contracts.ProxyEntry} entry The underlying entry.
     */
    constructor(port: number, entry: vsp_contracts.ProxyEntry) {
        super();

        this._PORT = port;
        this._ENTRY = entry;
    }

    /** @inheritdoc */
    public dispose() {
        this.removeAllListeners();

        const OLD_SERVER = this._server;
        if (OLD_SERVER) {
            OLD_SERVER.close();
        }

        this._server = null;
    }

    /**
     * Gets the underlying entry.
     */
    public get entry(): vsp_contracts.ProxyEntry {
        return this._ENTRY;
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
     * The TCP port.
     */
    public get port(): number {
        return this._PORT;
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
                const SOURCE = vsp_helpers.getPortSafe(ME.port, 8081);
                const TARGETS = vsp_helpers.asArray(ME.entry.to).filter(t => {
                    return !vsp_helpers.isNullOrUndefined(t);
                }).map(t => {
                    return vsp_helpers.getHostAndPort(t, 8080);
                });

                let receiveChunksFrom: false | number[] = <any>ME.entry.receiveChunksFrom;
                if (vsp_helpers.isUndefined(receiveChunksFrom)) {
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

                let handleTrace: vsp_contracts.TraceHandlerModuleExecutor;
                let handleTraceOptions = vsp_helpers.cloneObject(
                    this.entry.traceHandlerOptions,
                );
                if (!vsp_helpers.isEmptyString(this.entry.traceHandler)) {
                    const HANDLER_MODULE = vsp_helpers.loadModule<vsp_contracts.TraceHandlerModule>(this.entry.traceHandler);
                    if (HANDLER_MODULE) {
                        handleTrace = HANDLER_MODULE.handleTrace;
                    }
                }

                const HANDLE_ERROR = (err: any, source?: any) => {
                    if (!err) {
                        return;
                    }
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

                    // trace handler
                    if (handleTrace) {
                        const ARGS: vsp_contracts.TraceHandlerModuleExecutorArguments = {
                            entry: newEntry,
                            options: handleTraceOptions,
                            trace: TRACE,
                        };

                        handleTrace(ARGS);
                    }
                };

                const HANDLE_CHUNK = (chunk: Buffer) => {
                    let newCunk = chunk;

                    // chunk handler
                    if (!vsp_helpers.isEmptyString(this.entry.chunkHandler)) {
                        const ARGS: vsp_contracts.ChunkHandlerModuleExecutorArguments = {
                            chunk: chunk,
                            options: vsp_helpers.cloneObject(this.entry.chunkHandlerOptions),
                        };
        
                        const HANDLER_MODULE = vsp_helpers.loadModule<vsp_contracts.ChunkHandlerModule>(this.entry.chunkHandler);
                        if (HANDLER_MODULE) {
                            const HANDLE_CHUNK = HANDLER_MODULE.handleChunk;
                            if (HANDLE_CHUNK) {
                                HANDLE_CHUNK.apply(HANDLER_MODULE, 
                                                   [ ARGS ]);
                            }
                        }

                        newCunk = ARGS.chunk;
                    }

                    return newCunk;
                };

                let newServer: Net.Server;

                newServer = Net.createServer((from) => {
                    try {
                        from.on('error', (err) => {
                            HANDLE_ERROR(err, from);
                        });

                        const TOs: EntryWithSocket[] = [];
                        TARGETS.forEach((te, i) => {
                            const TO = Net.createConnection({
                                host: te.host,
                                port: te.port,
                            });

                            const NEW_TO: EntryWithSocket = {
                                entry: te,
                                socket: TO,
                            };

                            TOs.push(NEW_TO);

                            TO.on('error', (err) => {
                                HANDLE_ERROR(err, TO);
                            });

                            TO.once('end', () => {
                                TO.end();
                            });

                            TO.on('data', function(chunk) {
                                try {
                                    let SOURCE: vsp_contracts.SocketAddress = {
                                        addr: TO.localAddress,
                                        port: TO.localPort,
                                    };
                                    let TARGET: vsp_contracts.SocketAddress = {
                                        addr: from.localAddress,
                                        port: from.localPort,
                                    };

                                    chunk = HANDLE_CHUNK(
                                        chunk
                                    );

                                    let err: any;
                                    if (chunk && chunk.length > 0) {
                                        if (false !== receiveChunksFrom) {
                                            if (receiveChunksFrom.indexOf(i) > -1) {
                                                try {
                                                    from.write(chunk);  // send "answer"
                                                }
                                                catch (e) {
                                                    e = err;
                                                }
                                            }
                                        }
                                    }

                                    const NEW_TRACE_ENTRY: vsp_contracts.TraceEntry = {
                                        chunk: chunk,
                                        destination: vsp_contracts.ProxyDestination.TargetToProxy,
                                        err: err,
                                        source: SOURCE,
                                        target: TARGET,
                                    };

                                    HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                    ME.emit('new_trace_entry',
                                            NEW_TRACE_ENTRY);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, from);
                                }
                            });
                        });

                        from.on('data', async function(chunk) {
                            TOs.forEach((t, index) => {
                                try {
                                    let SOURCE: vsp_contracts.SocketAddress = {
                                        addr: from.localAddress,
                                        port: from.localPort,
                                    };
                                    let TARGET: vsp_contracts.SocketAddress = {
                                        addr: t.socket.localAddress,
                                        port: t.socket.localPort,
                                    };

                                    chunk = HANDLE_CHUNK(
                                        chunk
                                    );

                                    let err: any;
                                    if (chunk && chunk.length > 0) {
                                        try {
                                            t.socket.write(chunk);  // send "request"
                                        }
                                        catch (e) {
                                            err = e;
                                        }
                                    }

                                    const NEW_TRACE_ENTRY: vsp_contracts.TraceEntry = {
                                        chunk: chunk,
                                        destination: vsp_contracts.ProxyDestination.ProxyToTarget,
                                        err: err,
                                        source: SOURCE,
                                        target: TARGET,
                                    };

                                    HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                    ME.emit('new_trace_entry',
                                            NEW_TRACE_ENTRY);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, t.socket);
                                }
                            });
                        });

                        from.once('end', () => {
                            from.end();
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
                    ME._server = newServer;

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
                    ME._server = null;

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
     * Toggles trace state.
     * 
     * @return {Promise<TraceEntry[]>} The promise with the current trace.
     */
    public async toggleTrace() {
        let trace: vsp_contracts.TraceEntry[];
        
        if (this.isTracing) {
            trace = this.trace;

            if (!vsp_helpers.isEmptyString(this.entry.traceWriter)) {
                const ARGS: vsp_contracts.TraceWriterModuleExecutorArguments = {
                    options: vsp_helpers.cloneObject(
                        this.entry.traceWriterOptions,
                    ),
                    trace: trace,
                };

                const WRITER_MODULE = vsp_helpers.loadModule<vsp_contracts.TraceWriterModule>(this.entry.traceWriter);
                if (WRITER_MODULE) {
                    const WRITE_TRACE = WRITER_MODULE.writeTrace;
                    if (WRITE_TRACE) {
                        await Promise.resolve(
                            WRITE_TRACE(ARGS),
                        );
                    }
                }
            }

            this._trace = null;
        }
        else {
            trace = this._trace = [];
        }

        return trace;
    }
}
