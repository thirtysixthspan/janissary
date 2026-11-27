### mcp

Print the local MCP server's state in the current transcript as a plain key/value block. The server's token is never shown.

When the server is running, the block has four lines:

```
status: running
url: http://127.0.0.1:<port>/mcp
port: <port>
tools: question
```

When the server is not running, only two lines appear:

```
status: not running
reason: <reason>
```

**Usage**

`mcp`

**Use cases**

- See whether the local MCP server is running and at which URL.
- Find out why the server is not running.

**Examples**

- `mcp` prints the current server state without starting or stopping the server.
