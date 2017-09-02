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
 * Extension settings.
 */
export interface Configuration extends vscode.WorkspaceConfiguration {
    /**
     * One or more proxy entries.
     */
    readonly proxies?: ProxyEntry | ProxyEntry[];
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
 * A proxy entry.
 */
export interface ProxyEntry {
    /**
     * Start proxy on startup or not.
     */
    readonly autoStart?: boolean;
    /**
     * An additional description for the proxy.
     */
    readonly description?: string;
    /**
     * The name of the proxy.
     */
    readonly name?: string;
    /**
     * The source port.
     */
    readonly port?: number;
    /**
     * The destination port(s) or address(es).
     */
    readonly to?: ProxyTarget | ProxyTarget[];
}

/**
 * A proxy target.
 */
export type ProxyTarget = string | number;
