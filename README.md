# vscode-proxy

[![Latest Release](https://vsmarketplacebadge.apphb.com/version-short/mkloubert.vscode-proxy.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-proxy)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/mkloubert.vscode-proxy.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-proxy)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/mkloubert.vscode-proxy.svg)](https://marketplace.visualstudio.com/items?itemName=mkloubert.vscode-proxy#review-details)

Runs TCP proxies with additional trace support in [Visual Studio Code](https://code.visualstudio.com/).

<br />

**The extension is now marked as DEPRECATED ... it is RECOMMENDED to use [vscode-powertools](https://marketplace.visualstudio.com/items?itemName=ego-digital.vscode-powertools) by [e.GO Digital](https://github.com/egodigital).**

If you have suggestions and other kind of issues for that new extension, feel free to [open an issue here](https://github.com/egodigital/vscode-powertools/issues).

<br />

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=GJJDLPTHEA4BC)

## Table of contents

1. [Install](#install-)
2. [Demos](#demos-)
   * [Tracing](#tracing-)
3. [How to use](#how-to-use-)
   * [Settings](#settings-)
     * [Proxies](#proxies-)
   * [Commands](#commands-)
4. [Documentation](#documentation-)

## Install [[&uarr;](#table-of-contents)]

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

```bash
ext install vscode-proxy
```

Or search for things like `vscode-proxy` in your editor.

## Demos

### Tracing

![Demo Tracing](https://raw.githubusercontent.com/mkloubert/vscode-proxy/master/img/demo1.gif)

## How to use [[&uarr;](#table-of-contents)]

### Settings [[&uarr;](#how-to-use-)]

Open (or create) your `settings.json` in your `.vscode` subfolder of your workspace.

Add a `tcp.proxy` section and one or more [proxies](#proxies-):

```json
{
    "tcp.proxy": {
        "80": {
            "autoStart": true,
            "name": "My HTTP proxy",
            "to": 8080,
            "outputFormat": "http"
        }
    }
}
```

| Name | Description |
| ---- | --------- |
| `hexWidth` | The width for binary data in hex view. Default: `16` |
| `openAfterTrace` | Default value that indicates if traces should be opened in new tab after trace has been finished or not. Default: `(true)` |
| `outputFormat` | Default output format for traces. Possible values are `ascii`, `http`, `json` and `text`. Default: `text` |
| `proxies` | One or more [proxies](#proxies-) to register. |
| `writeToOutput` | Default value for writing trace entries to output or not. Default: `(false)` |

#### Proxies [[&uarr;](#settings-)]

The following example registers a proxy at port `80` and sends all data to `8080`.

```json
{
    "tcp.proxy": {
        "80": {
            "autoStart": true,
            "name": "My HTTP proxy",
            "description": "A proxy for my HTTP server",
            "to": 8080,
            "outputFormat": "http"
        }
    }
}
```

| Name | Description |
| ---- | --------- |
| `autoStart` | Start proxy on startup or not. Default: `(false)` |
| `chunkHandler` | The path to [the script](#chunk-handlers-) that handles a chunk. |
| `chunkHandlerOptions` | Additional options for the [chunk handler](#chunk-handlers-). |
| `chunkHandlerState` | Initial state value for the [chunk handler](#chunk-handlers-). |
| `description` | An additional description for the proxy. |
| `name` | The name of the proxy. |
| `openAfterTrace` | Open traces in new tab after trace has been finished or not. Default: `(true)` |
| `outputFormat` | Output format for traces. Possible values are `ascii`, `http`, `json` and `text`. Default: `text` |
| `receiveChunksFrom` | The custom list of targets (s. `to`) from where to send answers back to the source / client or (true) or (false) to enable/disable that feature. Default: First target. |
| `traceHandler` | The path to [the script](#trace-handlers-) that handles a (new) trace entry. |
| `traceHandlerOptions` | Additional options for the [trace handler](#trace-handlers-). |
| `traceHandlerState` | Initial state value for the [trace handler](#trace-handlers-). |
| `traceWriter` | The path to [the script](#trace-writers-) that writes a trace list, when tracing is stopped. |
| `traceWriterOptions` | Additional options for the [trace writer](#trace-writers-). |
| `traceWriterState` | Initial state value for the [trace writer](#trace-writers-). |
| `to` | The destination port(s) or address(es). |
| `writeToOutput` | Write trace entries to output or not. Default: `(false)` |

##### Chunk handlers [[&uarr;](#proxies-)]

```javascript
exports.handleChunk = function(args) {
    // this function is executed synchronous

    // you can update `args.chunk` property with new
    // data, which should be send to the target
    // 
    // (undefined) or (null) will NOT send data to the target

    // you can also access any NodeJS API
    // provided by Visual Studio Code
    // and the modules shipped with that extension
    // (s. https://github.com/mkloubert/vscode-proxy/blob/master/package.json)
};
```

`args` uses the [ChunkHandlerModuleExecutorArguments](https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.chunkhandlermoduleexecutorarguments.html) interface.

##### Trace handlers [[&uarr;](#proxies-)]

```javascript
exports.handleTrace = function(args) {
    // this function is executed synchronous

    // you can also access any NodeJS API
    // provided by Visual Studio Code
    // and the modules shipped with that extension
    // (s. https://github.com/mkloubert/vscode-proxy/blob/master/package.json)
};
```

`args` uses the [TraceHandlerModuleExecutorArguments](https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.tracehandlermoduleexecutorarguments.html) interface.

##### Trace writers [[&uarr;](#proxies-)]

```javascript
exports.writeTrace = function(args) {
    // this function can be executed asynchronous
    // via a promise

    // the final trace list is stored
    // in 'args.trace' array
    for (let i = 0; i < args.trace.length; i++) {
        // s. https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.traceentry.html
        let currentTraceEntry = args.trace[i];

        //TODO
    }

    // you can also access any NodeJS API
    // provided by Visual Studio Code
    // and the modules shipped with that extension
    // (s. https://github.com/mkloubert/vscode-proxy/blob/master/package.json)
};
```

`args` uses the [TraceWriterModuleExecutorArguments](https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.tracewritermoduleexecutorarguments.html) interface.

### Commands [[&uarr;](#how-to-use-)]

Press `F1` to open the list of commands and enter one of the following commands:

| Name | Description | ID | 
| ---- | --------- | --------- | 
| `Proxy: Start / stop` | Starts or stops one or more proxies. | `extension.proxy.startStop` | 
| `Proxy: Trace` | Starts or stops tracing one or more proxies. | `extension.proxy.trace` | 

## Documentation [[&uarr;](#table-of-contents)]

The full API documentation can be found [here](https://mkloubert.github.io/vscode-proxy/).
