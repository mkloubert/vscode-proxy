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
     * The destination.
     */
    readonly destination: vsp_contracts.ProxyDestination;
    /**
     * The error (if occurred).
     */
    readonly err?: any;
    /**
     * The source address.
     */
    readonly source: SocketAddress;
    /**
     * The target address.
     */
    readonly target: SocketAddress;
}

/**
 * A TCP proxy.
 */
export class TcpProxy extends Events.EventEmitter implements vscode.Disposable {
    private readonly _ENTRY: vsp_contracts.ProxyEntry;
    private readonly _PORT: number;
    private _server: Net.Server;
    private _trace: TraceEntry[];

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

                const HANDLE_ERROR = (err: any, source?: any) => {
                    if (!err) {
                        return;
                    }
                };

                const HANDLE_TRACE_ENTRY = (newEntry: TraceEntry) => {
                    if (!newEntry) {
                        return;
                    }

                    // append to trace
                    try {
                        const TRACE = ME._trace;
                        if (TRACE) {
                            TRACE.push(newEntry);
                        }
                    }
                    catch (e) {
                        console.trace('[Proxy] proxy.TcpProxy.start(append trace): ' +
                                      vsp_helpers.toStringSafe(e));
                    }
                };

                let newServer: Net.Server;

                newServer = Net.createServer((from) => {
                    try {
                        from.on('error', (err) => {
                            HANDLE_ERROR(err, from);
                        });

                        const TOs: EntryWithSocket[] = [];
                        TARGETS.forEach(te => {
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
                                let err: any;
                                try {
                                    from.write(chunk);
                                }
                                catch (e) {
                                    e = err;
                                }

                                const NEW_TRACE_ENTRY: TraceEntry = {
                                    chunk: chunk,
                                    destination: vsp_contracts.ProxyDestination.TargetToProxy,
                                    err: err,
                                    source: {
                                        addr: TO.localAddress,
                                        port: TO.localPort,
                                    },
                                    target: {
                                        addr: from.localAddress,
                                        port: from.localPort,
                                    },
                                };

                                HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                ME.emit('new_trace_entry',
                                        NEW_TRACE_ENTRY);
                            });
                        });

                        from.on('data', function(chunk) {
                            TOs.forEach((t, index) => {
                                let err: any;
                                try {
                                    t.socket.write(chunk);
                                }
                                catch (e) {
                                    err = e;
                                }

                                t.socket.remoteAddress

                                const NEW_TRACE_ENTRY: TraceEntry = {
                                    chunk: chunk,
                                    destination: vsp_contracts.ProxyDestination.ProxyToTarget,
                                    err: err,
                                    source: {
                                        addr: from.localAddress,
                                        port: from.localPort,
                                    },
                                    target: {
                                        addr: t.socket.localAddress,
                                        port: t.socket.localPort,
                                    },
                                };

                                HANDLE_TRACE_ENTRY(NEW_TRACE_ENTRY);

                                ME.emit('new_trace_entry',
                                        NEW_TRACE_ENTRY);
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
    public get trace(): TraceEntry[] {
        return this._trace;
    }

    /**
     * Toggles trace state.
     * 
     * @return {Promise<TraceEntry[]>} The promise with the current trace.
     */
    public async toggleTrace() {
        let trace: TraceEntry[];
        
        if (this.isTracing) {
            trace = this.trace;
            this._trace = null;
        }
        else {
            trace = this._trace = [];
        }

        return trace;
    }
}
