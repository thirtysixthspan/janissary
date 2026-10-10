# Automated testing

### Client test isolation

Client tests run with a DOM environment and isolated module state for each test file. The DOM environment is prepared once per worker and reused across its files. Cleanup removes rendered React trees after each test.
