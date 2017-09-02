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
    readonly entry: vsp_contracts.ProxyEntry;
    readonly socket: Net.Socket;
}

/**
 * A TCP proxy.
 */
export class TcpProxy extends Events.EventEmitter implements vscode.Disposable {
    private readonly _ENTRY: vsp_contracts.ProxyEntry;
    private _server: Net.Server;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {vsp_contracts.ProxyEntry} entry The underlying entry.
     */
    constructor(entry: vsp_contracts.ProxyEntry) {
        super();

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
                const SOURCE = vsp_helpers.getPortSafe(ME.entry.port, 8081);
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

                let newServer: Net.Server;

                newServer = Net.createServer((from) => {
                    try {
                        from.on('error', (err) => {
                            HANDLE_ERROR(err, from);
                        });

                        const TOs: EntryWithSocket[] = [];
                        TARGETS.forEach(pe => {
                            const TO = Net.createConnection({
                                host: pe.host,
                                port: pe.port,
                            });

                            const NEW_TO: EntryWithSocket = {
                                entry: pe,
                                socket: TO,
                            };

                            TOs.push(NEW_TO);

                            TO.on('error', (err) => {
                                HANDLE_ERROR(err, TO);
                            });

                            TO.once('end', TO.end);

                            TO.on('data', function(chunk) {
                                try {
                                    from.write(chunk);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, TO);
                                }

                                ME.emit('data',
                                        chunk, 'to', NEW_TO, from);
                            });
                        });

                        from.on('data', function(chunk) {
                            TOs.forEach(t => {
                                try {
                                    t.socket.write(chunk);
                                }
                                catch (e) {
                                    HANDLE_ERROR(e, from);
                                }

                                ME.emit('data',
                                        chunk, 'from', from, t);
                            });
                        });

                        from.once('end', from.end);
                        
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
}
