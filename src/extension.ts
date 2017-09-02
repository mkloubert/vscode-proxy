'use strict';

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

import * as FS from 'fs';
import * as Moment from 'moment';
import * as Path from 'path';
import * as vsp_contracts from './contracts';
import * as vsp_controller from './controller';
import * as vsp_helpers from './helpers';
import * as vscode from 'vscode';


let controller: vsp_controller.Controller;

export function activate(context: vscode.ExtensionContext) {
    const NOW = Moment();

    // version
    let pkgFile: vsp_contracts.PackageFile;
    try {
        pkgFile = JSON.parse(FS.readFileSync(Path.join(__dirname, '../../package.json'), 'utf8'));
    }
    catch (e) {
        console.error(`[ERROR] extension.activate(): ${vsp_helpers.toStringSafe(e)}`);
    }

    const OUTPUT_CHANNEL = vscode.window.createOutputChannel("TCP Proxy");

    // show infos about the app
    {
        if (pkgFile) {
            OUTPUT_CHANNEL.appendLine(`${pkgFile.displayName} (${pkgFile.name}) - v${pkgFile.version}`);
        }

        OUTPUT_CHANNEL.appendLine(`Copyright (c) ${NOW.format('YYYY')}  Marcel Joachim Kloubert <marcel.kloubert@gmx.net>`);
        OUTPUT_CHANNEL.appendLine('');
        OUTPUT_CHANNEL.appendLine(`GitHub : https://github.com/mkloubert`);
        OUTPUT_CHANNEL.appendLine(`Twitter: https://twitter.com/mjkloubert`);
        OUTPUT_CHANNEL.appendLine(`Donate : [PayPal] https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=GJJDLPTHEA4BC`);

        OUTPUT_CHANNEL.appendLine('');
    }

    controller = new vsp_controller.Controller(
        context,
        OUTPUT_CHANNEL,
        pkgFile
    );

    controller.onActivated();
}


export function deactivate() {
    if (controller) {
        controller.onDeactivate();
    }
}
