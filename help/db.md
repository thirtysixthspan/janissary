### db

Create, delete, query, or list SQLite databases.

**Usage**

`db sqlite list`

`db sqlite create <name>`

`db sqlite delete <name>`

`db sqlite query <name> <sql>`

**Use cases**

- Manage the project's SQLite databases.
- Run a SQL query against a database.

**Examples**

- `db sqlite list` lists the available databases.
- `db sqlite query inventory "select * from products"` queries the `inventory` database.

**Notes**

- A malformed command prints a usage line instead of running.
- A bare `db`, an unknown action, or a subcommand word where the engine belongs, such as `db list`, prints `Usage: db sqlite <create|delete|query|list> [name] [query]`.
- `create` or `delete` without a name prints `Usage: db sqlite create <name>` or `Usage: db sqlite delete <name>`.
- `query` without a name and SQL prints `Usage: db sqlite query <name> <sql>`.
