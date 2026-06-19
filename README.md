# Janissary

> A [Janissary](https://en.wikipedia.org/wiki/Janissary) was an elite infantry soldier in the Ottoman Empire — a servant of the gate, loyal, and ever-ready. This tool channels that same spirit as your terminal's loyal servant.

**Janissary** is a terminal UI shell built with [Ink](https://github.com/vadimdemedes/ink) and React. It provides a full-screen interactive interface with built-in commands and the ability to execute arbitrary shell commands.

## Usage

```
npx janus
```

Or install globally:

```
npm install -g janissary
janus
```

### Built-in commands

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `dashboard`  | Show the dashboard                 |
| `settings`   | Show settings                      |
| `about`      | Show information about the tool    |
| `help`       | List available commands            |
| `clear`      | Clear the output log               |
| `quit`       | Exit the application               |

Prefix any command with `` ` `` to run it directly in your shell:

```
 `ls -la
 `echo hello world
 `npm install
```

### Key bindings

| Key            | Action                           |
| -------------- | -------------------------------- |
| `↑` / `↓`      | Scroll through output history    |
| `Ctrl+P`       | Previous command in history       |
| `Ctrl+N`       | Next command in history           |
| `←` / `→`      | Move cursor in the input field    |
| `Enter`        | Execute the current command       |
| `Ctrl+C`       | Exit                             |

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

## License

UNLICENSED — proprietary
