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

import * as ChildProcess from 'child_process';
import * as FS from 'fs';
import * as OS from 'os';
import * as Path from 'path';
import * as vscode from 'vscode';
import * as vsp_workspace from './workspace';
import * as vsp_helpers from './workspace';

/**
 * Options for open function.
 */
export interface OpenOptions {
    /**
     * The app (or options) to open.
     */
    app?: string | string[];
    /**
     * The custom working directory.
     */
    cwd?: string;
    /**
     * Wait until exit or not.
     */
    wait?: boolean;
}

/**
 * Describes a simple 'completed' action.
 * 
 * @param {any} err The occurred error.
 * @param {TResult} [result] The result.
 */
export type SimpleCompletedAction<TResult> = (err: any, result?: TResult) => void;


/**
 * Returns a value as array.
 * 
 * @param {T | T[]} val The value.
 * 
 * @return {T[]} The value as array.
 */
export function asArray<T = any>(val: T | T[]): T[] {
    if (!Array.isArray(val)) {
        return [ val ];
    }

    return val;
}

/**
 * Clones an object / value deep.
 * 
 * @param {T} val The value / object to clone.
 * 
 * @return {T} The cloned value / object.
 */
export function cloneObject<T>(val: T): T {
    if (!val) {
        return val;
    }

    return JSON.parse(
        JSON.stringify(val)
    );
}

/**
 * Creates a simple 'completed' callback for a promise.
 * 
 * @param {Function} resolve The 'succeeded' callback.
 * @param {Function} reject The 'error' callback.
 * 
 * @return {SimpleCompletedAction<TResult>} The created action.
 */
export function createSimpleCompletedAction<TResult>(resolve: (value?: TResult | PromiseLike<TResult>) => void,
                                                     reject?: (reason: any) => void): SimpleCompletedAction<TResult> {
    let completedInvoked = false;

    return (err, result?) => {
        if (completedInvoked) {
            return;
        }
        completedInvoked = true;
        
        if (err) {
            if (reject) {
                reject(err);
            }
        }
        else {
            if (resolve) {
                resolve(result);
            }
        }
    };
}

/**
 * Removes duplicate entries from an array.
 * 
 * @param {T[]} arr The input array.
 * 
 * @return {T[]} The filtered array.
 */
export function distinctArray<T>(arr: T[]): T[] {
    if (!arr) {
        return arr;
    }

    return arr.filter((x, i) => {
        return arr.indexOf(x) === i;
    });
}

/**
 * Returns the End-Of-Line sequence.
 * 
 * @param {vscode.EndOfLine} [eol] The optional editor value.
 * 
 * @return {string} The sequence.
 */
export function getEOL(eol?: vscode.EndOfLine): string {
    switch (eol) {
        case vscode.EndOfLine.CRLF:
            return `\r\n`;
        
        case vscode.EndOfLine.LF:
            return `\n`;
    }
    
    return OS.EOL;
}

/**
 * Returns host and port from a value.
 * 
 * @param {any} val The value.
 * @param {number} defaultPort The default port.
 * 
 * @return {Object} The extracted data.
 */
export function getHostAndPort(val: any, defaultPort: number): { host: string, port: number } {
    let host: string;
    let port: number;

    val = toStringSafe(val);
    if (!isEmptyString(val)) {
        if (val.indexOf(':') > -1) {
            port = parseInt( val.substr(val.lastIndexOf(':') + 1)
                                .trim() );
        }
        else {
            port = parseInt( val.trim() );
        }

        if (isNaN(port)) {
            host = val;
            port = undefined;
        }
    }

    if (isEmptyString(host)) {
        host = '127.0.0.1';
    }

    return {
        host: host,
        port: getPortSafe(port, defaultPort),
    };
}

/**
 * Returns a "safe" TCP port value.
 * 
 * @param {any} val The input value. 
 * @param {number} defaultPort The value to take if 'val' s invalid.
 * 
 * @return {number} The output value.
 */
export function getPortSafe(val: any, defaultPort: number): number {
    val = parseInt( toStringSafe(val).trim() );
    if (isNaN(val)) {
        val = defaultPort;
    }

    return val;
}

/**
 * Gets the name for a proxy.
 * 
 * @param {string} name The source string.
 * @param {number} port The TCP port.
 * @param {number} nr The number.
 */
export function getProxyName(name: string, port: number, nr: number) {
    name = toStringSafe(name).trim();
    if ('' === name) {
        const SOURCE_PORT = getPortSafe(port, 8081);

        name = `Proxy #${nr} - ${SOURCE_PORT}`;
    }

    return name;
}

/**
 * Compares two values for a sort operation.
 * 
 * @param {T} x The left value.
 * @param {T} y The right value.
 * 
 * @return {number} The "sort value".
 */
export function compareValues<T>(x: T, y: T): number {
    if (x === y) {
        return 0;
    }

    if (x > y) {
        return 1;
    }

    if (x < y) {
        return -1;
    }

    return 0;
}

/**
 * Compares values by using a selector.
 * 
 * @param {T} x The left value. 
 * @param {T} y The right value.
 * @param {Function} selector The selector.
 * 
 * @return {number} The "sort value".
 */
export function compareValuesBy<T, U>(x: T, y: T,
                                      selector: (t: T) => U): number {
    if (!selector) {
        selector = (t) => <any>t;
    }

    return compareValues<U>(selector(x),
                            selector(y));
}

/**
 * Opens a target.
 * 
 * @param {string} target The target to open.
 * @param {OpenOptions} [opts] The custom options to set.
 * 
 * @param {Promise<ChildProcess.ChildProcess>} The promise.
 */
export function open(target: string, opts?: OpenOptions): Promise<ChildProcess.ChildProcess> {
    let me = this;

    if (!opts) {
        opts = {};
    }

    opts.wait = toBooleanSafe(opts.wait, true);
    
    return new Promise((resolve, reject) => {
        let completed = (err?: any, cp?: ChildProcess.ChildProcess) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(cp);
            }
        };
        
        try {
            if (typeof target !== 'string') {
                throw new Error('Expected a `target`');
            }

            let cmd: string;
            let appArgs: string[] = [];
            let args: string[] = [];
            let cpOpts: ChildProcess.SpawnOptions = {
                cwd: opts.cwd || vsp_workspace.getRootPath(),
            };

            if (Array.isArray(opts.app)) {
                appArgs = opts.app.slice(1);
                opts.app = opts.app[0];
            }

            if (process.platform === 'darwin') {
                // Apple

                cmd = 'open';

                if (opts.wait) {
                    args.push('-W');
                }

                if (opts.app) {
                    args.push('-a', opts.app);
                }
            }
            else if (process.platform === 'win32') {
                // Microsoft

                cmd = 'cmd';
                args.push('/c', 'start', '""');
                target = target.replace(/&/g, '^&');

                if (opts.wait) {
                    args.push('/wait');
                }

                if (opts.app) {
                    args.push(opts.app);
                }

                if (appArgs.length > 0) {
                    args = args.concat(appArgs);
                }
            }
            else {
                // Unix / Linux

                if (opts.app) {
                    cmd = opts.app;
                } else {
                    cmd = Path.join(__dirname, 'xdg-open');
                }

                if (appArgs.length > 0) {
                    args = args.concat(appArgs);
                }

                if (!opts.wait) {
                    // xdg-open will block the process unless
                    // stdio is ignored even if it's unref'd
                    cpOpts.stdio = 'ignore';
                }
            }

            args.push(target);

            if (process.platform === 'darwin' && appArgs.length > 0) {
                args.push('--args');
                args = args.concat(appArgs);
            }

            let cp = ChildProcess.spawn(cmd, args, cpOpts);

            if (opts.wait) {
                cp.once('error', (err) => {
                    completed(err);
                });

                cp.once('close', function (code) {
                    if (code > 0) {
                        completed(new Error('Exited with code ' + code));
                        return;
                    }

                    completed(null, cp);
                });
            }
            else {
                cp.unref();

                completed(null, cp);
            }
        }
        catch (e) {
            completed(e);
        }
    });
}

/**
 * Converts a value to a boolean.
 * 
 * @param {any} val The value to convert.
 * @param {any} defaultValue The value to return if 'val' is (null) or (undefined).
 * 
 * @return {boolean} The converted value.
 */
export function toBooleanSafe(val: any, defaultValue: any = false): boolean {
    if (isNullOrUndefined(val)) {
        return defaultValue;
    }

    return !!val;
}

/**
 * Checks if the string representation of a value is empty
 * or contains whitespaces only.
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is empty or not.
 */
export function isEmptyString(val: any) {
    return '' === toStringSafe(val).trim();
}

/**
 * Checks if a value is (null).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (null) or not.
 */
export function isNull(val: any): val is null {
    return null === val;
}

/**
 * Checks if a value is (null) or (undefined).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (null)/(undefined) or not.
 */
export function isNullOrUndefined(val: any): val is (null | undefined) {
    return isNull(val) ||
           isUndefined(val);
}

/**
 * Checks if a value is (undefined).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (undefined) or not.
 */
export function isUndefined(val: any): val is undefined {
    return 'undefined' === typeof val;
}

/**
 * Loads a module.
 * 
 * @param {string} file The path of the module's file.
 * @param {boolean} useCache Use cache or not.
 * 
 * @return {TModule} The loaded module.
 */
export function loadModule<TModule>(file: string, useCache: boolean = false): TModule {
    file = toFullPath(file);

    useCache = toBooleanSafe(useCache);

    let stats = FS.lstatSync(file);
    if (!stats.isFile()) {
        throw new Error(`'${file}' is NO file!`);
    }

    if (!useCache) {
        delete require.cache[file];  // remove from cache
    }
    
    return require(file);
}

/**
 * Normalizes a value as string so that is comparable.
 * 
 * @param {any} val The value to convert.
 * @param {(str: string) => string} [normalizer] The custom normalizer.
 * 
 * @return {string} The normalized value.
 */
export function normalizeString(val: any, normalizer?: (str: string) => string): string {
    if (!normalizer) {
        normalizer = (str) => str.toLowerCase().trim();
    }

    return normalizer(toStringSafe(val));
}

/**
 * Creates a read-only version of an object.
 * 
 * @param {T} baseObj The base object.
 * 
 * @return {T} The read-only version.
 */
export function toReadOnlyObject<T = any>(baseObj: T): T {
    if (!baseObj) {
        return baseObj;
    }

    let result: any = {};
    const APPEND_PROPERTY = (propertyKey: PropertyKey) => {
        Object.defineProperty(result, propertyKey, {
            get: () => baseObj[propertyKey],
        });
    };

    for (let p in baseObj) {
        APPEND_PROPERTY(p);
    }

    return result;
}

/**
 * Converts a value to a string that is NOT (null) or (undefined).
 * 
 * @param {any} str The input value.
 * @param {any} defValue The default value.
 * 
 * @return {string} The output value.
 */
export function toStringSafe(str: any, defValue: any = ''): string {
    try {
        if ('string' === typeof str) {
            return str;
        }

        if (isNullOrUndefined(str)) {
            return defValue;
        }
        
        if (Buffer.isBuffer(str)) {
            return str.toString('utf8');
        }

        if ('object' === typeof str ||
            Array.isArray(str)) {

            if ('function' === typeof str.toString) {
                return '' + str.toString();
            }

            return JSON.stringify(str);
        }
    }
    catch (e) {
        console.error(e, 'helpers.toStringSafe(1)');
    }

    try {
        return '' + str;
    }
    catch (e) {
        console.error(e, 'helpers.toStringSafe(2)');
    }

    return '';
}

/**
 * Converts to a full, clean path.
 * 
 * @param {string} path The path to convert.
 * 
 * @return {string} The full path.
 */
export function toFullPath(path: string): string {
    path = toStringSafe(path);
    if (isEmptyString(path)) {
        path = './';
    }
    if (!Path.isAbsolute(path)) {
        path = Path.join(
            Path.join(vsp_helpers.getRootPath(), '.vscode'),
            path,
        );
    }

    return Path.resolve(path);
}

/**
 * Tries to dispose an object.
 * 
 * @param {object} obj The object to dispose.
 * 
 * @return {boolean} Operation was successful or not.
 */
export function tryDispose(obj: { dispose?: () => any }): boolean {
    try {
        if (obj && obj.dispose) {
            obj.dispose();
        }

        return true;
    }
    catch (e) {
        console.error(e, 'helpers.tryDispose()');

        return false;
    }
}
