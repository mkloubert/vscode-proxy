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


interface ProxyEntryWithPort {
    readonly entry: vsp_contracts.ProxyEntry;
    readonly port: number;
}


/**
 * The extension controller.
 */
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
     * 
     * @return {ProxyEntryWithPort[]} The entries.
     */
    protected getProxyEntries(): ProxyEntryWithPort[] {
        const LOADED_ENTRIES: ProxyEntryWithPort[] = [];
        
        const PROXIES = this.config.proxies;
        if (PROXIES) {
            for (let p in PROXIES) {
                const PORT = parseInt( p.trim() );
                if (isNaN(PORT)) {
                    continue;
                }

                const ENTRY = PROXIES[p];
                if (ENTRY) {
                    LOADED_ENTRIES.push({
                        entry: ENTRY,
                        port: PORT,
                    });
                }
            }
        }

        return LOADED_ENTRIES;
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
        this._config = vscode.workspace.getConfiguration("tcp.proxy") || <any>{};

        this.reloadProxies().then(() => {
        }).catch((err) => {
            // reloading proxies failed

            vscode.window.showErrorMessage(`[Proxy] Could not reload proxies: ${vsp_helpers.toStringSafe(err)}}`).then(() => {
            }, (err) => {
                console.trace('[Proxy] controller.reloadConfiguration(): ' +
                              vsp_helpers.toStringSafe(err));
            });
        });

        this.showDeprecatedMessage().then(() => {
        }).catch(() => {
        });
    }

    /**
     * Reloads proxies.
     */
    protected async reloadProxies() {
        this.disposeOldProxies();

        const ENTRIES = this.getProxyEntries();
        for (let i = 0; i < ENTRIES.length; i++) {
            const PROXY_ENTRY = ENTRIES[i];

            const PROXY_NAME = vsp_helpers.getProxyName(PROXY_ENTRY.entry.name,
                                                        PROXY_ENTRY.port, 
                                                        i + 1);

            try {
                const NEW_PROXY = new vsp_proxy.TcpProxy(this,
                                                         PROXY_ENTRY.port,
                                                         PROXY_ENTRY.entry, i);
                await NEW_PROXY.init();

                this._PROXIES.push(NEW_PROXY);

                if (vsp_helpers.toBooleanSafe(NEW_PROXY.entry.autoStart)) {
                    try {
                        if (!(await NEW_PROXY.start())) {
                            // already running

                            vscode.window.showWarningMessage(`[Proxy] Proxy '${PROXY_NAME}' already running.`).then(() => {
                            }, (err) => {
                                console.trace('[Proxy] controller.reloadProxies(3): ' +
                                              vsp_helpers.toStringSafe(err));
                            });
                        }
                    }
                    catch (e) {
                        // autostart failed

                        vscode.window.showErrorMessage(`[Proxy] Could not autostart proxy '${PROXY_NAME}': ${vsp_helpers.toStringSafe(e)}}`).then(() => {
                        }, (err) => {
                            console.trace('[Proxy] controller.reloadProxies(2): ' +
                                          vsp_helpers.toStringSafe(err));
                        });
                    }
                }
            }
            catch (e) {
                vscode.window.showErrorMessage(`[Proxy] Could not load proxy '${PROXY_NAME}': ${vsp_helpers.toStringSafe(e)}}`).then(() => {
                }, (err) => {
                    console.trace('[Proxy] controller.reloadProxies(1): ' +
                                  vsp_helpers.toStringSafe(err));
                });
            }
        }
    }

    private async showDeprecatedMessage() {
        const KEY_SHOW_DEPRECATED_MESSAGE = 'vspShowDeprecatedMessage';

        try {
            this._CONTEXT
                .globalState
                .update('vspLastKnownVersion', undefined);
        } catch { }

        let newShowMessageValue: boolean;
        try {
            const SHOW_MESSAGE = vsp_helpers.toBooleanSafe(
                this._CONTEXT.globalState.get(KEY_SHOW_DEPRECATED_MESSAGE, true),
                true
            );

            newShowMessageValue = SHOW_MESSAGE;

            if (SHOW_MESSAGE) {
                const BTN = await vscode.window.showWarningMessage(
                    "[vs-script-commands] The extension has been DEPRECATED. You can try out 'vscode-powertools' for the future ...",
                    "Open 'vscode-powertools'", "Maybe next time", "Do not show again"
                );

                if ('Maybe next time' === BTN) {
                    newShowMessageValue = true;
                } else {
                    newShowMessageValue = false;
                }

                if ("Open 'vscode-powertools'" === BTN) {
                    await vsp_helpers.open('https://marketplace.visualstudio.com/items?itemName=ego-digital.vscode-powertools');
                }
            }
        } catch (e) {
            console.log(`[ERROR] Controller.showDeprecatedMessage(1): ${vsp_helpers.toStringSafe(e)}`);
        } finally {
            try {
                await this._CONTEXT.globalState.update(
                    KEY_SHOW_DEPRECATED_MESSAGE,
                    newShowMessageValue
                );
            } catch { }
        }
    }

    /**
     * Shows quick picks for the current list of proxies.
     * 
     * @param {string} placeHolder The placeholder. 
     * @param {Function} action The action to invoke for the selected proxies.
     * @param {Function} [iconResolver] The function that receives the icon name for a proxy entry.
     */
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
            const PORT = p.port;
            const ENTRY = p.entry;

            let description = vsp_helpers.toStringSafe(ENTRY.description).trim();

            let name = p.name;

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

        await HANDLE_ITEM(
            await vscode.window.showQuickPick(QUICK_PICKS, {
                placeHolder: placeHolder,
            })
        );
    }

    /**
     * Starts / stops proxies.
     */
    protected async startStop() {
        try {
            await this.showProxyQuickPick('Select the proxy to start / stop...', async (proxies) => {
                for (let i = 0; i < proxies.length; i++) {
                    const P = proxies[i];

                    let errMsg: string;
                    try {
                        if (P.isRunning) {
                            errMsg = `Could not stop proxy '${P.name}'`;

                            await P.stop();
                        }
                        else {
                            errMsg = `Could not start proxy '${P.name}'`;

                            await P.start();
                        }
                    }
                    catch (e) {
                        // failed toggle tracing

                        vscode.window.showErrorMessage(`[Proxy] ${errMsg}: ${vsp_helpers.toStringSafe(e)}}`).then(() => {
                        }, (err) => {
                            console.trace('[Proxy] controller.startStop(2): ' +
                                          vsp_helpers.toStringSafe(err));
                        });
                    }
                }
            }, (p) => {
                return p.isRunning ? 'triangle-right' : 'primitive-square';
            });
        }
        catch (e) {
            // "global" error

            vscode.window.showErrorMessage(`[Proxy] Could not show proxies for start / stop: ${vsp_helpers.toStringSafe(e)}}`).then(() => {
            }, (err) => {
                console.trace('[Proxy] controller.startStop(1): ' +
                              vsp_helpers.toStringSafe(err));
            });
        }
    }

    /**
     * Starts / stops tracing.
     */
    protected async trace() {
        const ME = this;

        try {
            await ME.showProxyQuickPick('Select the proxy to trace...', async (proxies) => {
                for (let i = 0; i < proxies.length; i++) {
                    const P = proxies[i];

                    const IS_TRACING = P.isTracing;
                    let errMsg: string;
                    try {
                        if (IS_TRACING) {
                            errMsg = `Could not stop proxy tracing for '${P.name}'`;
                        }
                        else {
                            errMsg = `Could not start proxy tracing for '${P.name}'`;
                        }

                        await P.toggleTrace();
                    }
                    catch (e) {
                        // failed toggle tracing

                        vscode.window.showErrorMessage(`[Proxy] ${errMsg}: ${vsp_helpers.toStringSafe(e)}}`).then(() => {
                        }, (err) => {
                            console.trace('[Proxy] controller.trace(2): ' +
                                          vsp_helpers.toStringSafe(err));
                        });
                    }
                }
            }, (p) => {
                return p.isTracing ? 'triangle-right' : 'primitive-square';
            });
        }
        catch (e) {
            // "global" error

            vscode.window.showErrorMessage(`[Proxy] Could not show proxies for trace: ${vsp_helpers.toStringSafe(e)}}`).then(() => {
            }, (err) => {
                console.trace('[Proxy] controller.trace(1): ' +
                              vsp_helpers.toStringSafe(err));
            });
        }
    }
}
