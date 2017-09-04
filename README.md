# vscode-proxy

Runs TCP proxies with additional trace support in [Visual Studio Code](https://code.visualstudio.com/).

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=GJJDLPTHEA4BC)

## Table of contents

1. [Install](#install-)
2. [How to use](#how-to-use-)
   * [Settings](#settings-)
     * [Proxies](#proxies-)
   * [Commands](#commands-)
3. [Documentation](#documentation-)

## Install [[&uarr;](#table-of-contents)]

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

```bash
ext install vscode-proxy
```

Or search for things like `vscode-proxy` in your editor.

## How to use [[&uarr;](#table-of-contents)]

### Settings [[&uarr;](#how-to-use-)]

Open (or create) your `settings.json` in your `.vscode` subfolder of your workspace.

Add a `proxy` section:

```json
{
    "proxy": {
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
    "proxy": {
        "80": {
            "autoStart": true,
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
| `description` | An additional description for the proxy. |
| `name` | The name of the proxy. |
| `openAfterTrace` | Open traces in new tab after trace has been finished or not. Default: `(true)` |
| `outputFormat` | Output format for traces. Possible values are `ascii`, `http`, `json` and `text`. Default: `text` |
| `receiveChunksFrom` | The custom list of targets (s. 'to') from where to send answers back to the source / client or (true) or (false) to enable/disable that feature. Default: First target. |
| `traceHandler` | The path to [the script](#trace-handlers-) that handles a (new) trace entry. |
| `traceHandlerOptions` | Additional options for the [trace handler](#trace-handlers-). |
| `traceWriter` | The path to [the script](#trace-writers-) that writes a trace list, when tracing is stopped. |
| `traceWriterOptions` | Additional options for the [trace writer](#trace-writers-). |
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
};
```

`args` uses the [ChunkHandlerModuleExecutorArguments](https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.chunkhandlermoduleexecutorarguments.html) interface.

##### Trace handlers [[&uarr;](#proxies-)]

```javascript
exports.handleTrace = function(args) {
    // this function is executed synchronous
};
```

`args` uses the [TraceHandlerModuleExecutorArguments](https://mkloubert.github.io/vscode-proxy/interfaces/_contracts_.tracehandlermoduleexecutorarguments.html) interface.

##### Trace writers [[&uarr;](#proxies-)]

```javascript
exports.writeTrace = function(args) {
    // this function can be executed asynchronous
    // via a promise
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
