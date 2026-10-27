### db

Create, delete, query, or list SQLite databases.

**Usage**

`db list`

`db create <name>`

`db delete <name>`

`db query <name> <sql>`

**Use cases**

- Manage the project's SQLite databases.
- Run a SQL query against a database.

**Examples**

- `db list` lists the available databases.
- `db query inventory "select * from products"` queries the `inventory` database.
