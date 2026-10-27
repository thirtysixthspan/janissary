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
