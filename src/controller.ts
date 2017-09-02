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

import * as vscode from 'vscode';
import * as vsp_contracts from './contracts';
import * as vsp_helpers from './helpers';
import * as vsp_proxy from './proxy';


export class Controller implements vscode.Disposable {
    private _config: vsp_contracts.Configuration;
    private readonly _CONTEXT: vscode.ExtensionContext;
    private readonly _OUTPUT_CHANNEL: vscode.OutputChannel;
    private readonly _PACKAGE_FILE: vsp_contracts.PackageFile;
    private readonly _PROXIES: vsp_proxy.TcpProxy[] = [];
    
    /**
     * Initializes a new instance of that class.
     * 
     * @param {vscode.ExtensionContext} context The underlying extension context.
     * @param {vscode.OutputChannel} outputChannel The underlying output channel.
     * @param {vsp_contracts.PackageFile} pkgFile The package file.
     */
    constructor(context: vscode.ExtensionContext,
                outputChannel: vscode.OutputChannel,
                pkgFile: vsp_contracts.PackageFile) {
        this._CONTEXT = context;
        this._OUTPUT_CHANNEL = outputChannel;
        this._PACKAGE_FILE = pkgFile;
    }

    /**
     * Gets the current configuration.
     */
    public get config(): vsp_contracts.Configuration {
        return this._config || <any>{};
    }

    /**
     * Gets the underlying extension context.
     */
    public get context(): vscode.ExtensionContext {
        return this._CONTEXT;
    }

    /** @inheritdoc */
    public dispose() {
        this.disposeOldProxies();
    }

    /**
     * Disposes old proxies.
     */
    protected disposeOldProxies() {
        while (this._PROXIES.length > 0) {
            const PROXY = this._PROXIES.shift();

            vsp_helpers.tryDispose(PROXY);
        }
    }

    /**
     * Returns all proxy entries.
     */
    public getProxyEntries(): vsp_contracts.ProxyEntry[] {
        return vsp_helpers.asArray(this.config.proxies)
                          .filter(x => 'object' === typeof x)
    }

    /**
     * Is invoked after the extension has been activated.
     */
    public onActivated() {
        const ME = this;
        
        // start / stop
        const CMD_START_STOP = vscode.commands.registerCommand('extension.proxy.startStop', async () => {
            await ME.startStop();
        });

        // trace
        const CMD_TRACE = vscode.commands.registerCommand('extension.proxy.trace', async () => {
            await ME.trace();
        });

        ME.context.subscriptions
                  .push(CMD_START_STOP, CMD_TRACE);

        ME.context.subscriptions
                  .push(vscode.workspace.onDidChangeConfiguration(ME.onDidChangeConfiguration, ME));

        ME.context.subscriptions
                  .push(ME);

            ME.reloadConfiguration();
    }

    /**
     * Is invoked when extension is going to be deactivated.
     */
    public onDeactivate() {
    }

    /**
     * Event after configuration changed.
     */
    public onDidChangeConfiguration() {
        this.reloadConfiguration();
    }

    /**
     * Gets the underlying output channel.
     */
    public get outputChannel() {
        return this._OUTPUT_CHANNEL;
    }

    /**
     * Gets the underlying file.
     */
    public get packageFile(): vsp_contracts.PackageFile {
        return this._PACKAGE_FILE;
    }

    /**
     * Reloads the configuration.
     */
    protected reloadConfiguration() {
        this._config = vscode.workspace.getConfiguration("proxy") || <any>{};

        this.reloadProxies().then(() => {
        }).catch((err) => {
            //TODO: show error message
        });
    }

    /**
     * Reloads proxies.
     */
    protected async reloadProxies() {
        this.disposeOldProxies();

        const ENTRIES = this.getProxyEntries();
        for (let i = 0; i < ENTRIES.length; i++) {
            const NEW_PROXY = new vsp_proxy.TcpProxy(ENTRIES[i]);
            this._PROXIES.push(NEW_PROXY);

            if (vsp_helpers.toBooleanSafe(NEW_PROXY.entry.autoStart)) {
                try {
                    if (!(await NEW_PROXY.start())) {
                        //TODO: show error message
                    }
                }
                catch (e) {
                    //TODO: show error message
                }
            }
        }
    }

    protected async showProxyQuickPick(placeHolder: string,
                                       action: (proxies: vsp_proxy.TcpProxy[]) => any,
                                       iconResolver?: (proxy: vsp_proxy.TcpProxy) => any) {
        const ALL_PROXIES = this._PROXIES || [];

        const INVOKE_ACTION = async (proxies: vsp_proxy.TcpProxy[]) => {
            if (action) {
                await Promise.resolve(
                    action(proxies),
                );
            }
        };

        const QUICK_PICKS = ALL_PROXIES.map((p, i) => {
            const ENTRY = p.entry;

            let description = vsp_helpers.toStringSafe(ENTRY.description).trim();

            let name = vsp_helpers.toStringSafe(ENTRY.name).trim();
            if ('' === name) {
                const SOURCE_PORT = vsp_helpers.getPortSafe(ENTRY.port, 8081);

                name = `Proxy #${i + 1} - ${SOURCE_PORT}`;
            }

            if (iconResolver) {
                const ICON = vsp_helpers.toStringSafe(
                    iconResolver(p)
                ).trim();
                if ('' !== ICON) {
                    name = '$(' + ICON + ')  ' + name;
                }
            }

            const QP: vsp_contracts.ActionQuickPickItem<vsp_proxy.TcpProxy> = {
                action: async (s) => {
                    await INVOKE_ACTION([ s ]);
                },
                description: description,
                label: name,
                state: p,
            };

            return QP;
        });

        if (QUICK_PICKS.length < 1) {
            return;
        }

        const ALL_QUICK_PICK: vsp_contracts.ActionQuickPickItem<vsp_proxy.TcpProxy> = {
            action: async () => {
                await INVOKE_ACTION(ALL_PROXIES);
            },
            description: '',
            detail: 'All proxies',
            label: '(all)',
        };
        QUICK_PICKS.push(ALL_QUICK_PICK);

        const HANDLE_ITEM = async (item: vsp_contracts.ActionQuickPickItem<vsp_proxy.TcpProxy>) => {
            if (!item) {
                return;
            }

            await Promise.resolve(
                item.action(item.state, item),
            );
        };

        if (<any>true || QUICK_PICKS.length > 2) {
            await HANDLE_ITEM(
                await vscode.window.showQuickPick(QUICK_PICKS, {
                    placeHolder: placeHolder,
                })
            );
        }
        else {
            await HANDLE_ITEM(QUICK_PICKS[0]);
        }
    }

    /**
     * Starts / stops proxies.
     */
    protected async startStop() {
        try {
            await this.showProxyQuickPick('Select the proxy to start / stop...', async (proxies) => {
                for (let i = 0; i < proxies.length; i++) {
                    const P = proxies[i];

                    try {
                        if (P.isRunning) {
                            await P.stop();
                        }
                        else {
                            await P.start();
                        }
                    }
                    catch (e) {
                        //TODO: show error message
                    }
                }
            }, (p) => {
                return p.isRunning ? 'primitive-square' : 'triangle-right';
            });
        }
        catch (e) {
            //TODO: show error message
        }
    }

    /**
     * Starts / stops tracing.
     */
    protected async trace() {
        try {
            await this.showProxyQuickPick('Select the proxy to trace...', async (proxies) => {
                for (let i = 0; i < proxies.length; i++) {
                    const P = proxies[i];

                    try {
                        //TODO: implement
                    }
                    catch (e) {
                        //TODO: show error message
                    }
                }
            }, (p) => {
                //TODO: return icon
            });
        }
        catch (e) {
            //TODO: show error message
        }
    }
}