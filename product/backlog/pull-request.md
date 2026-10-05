<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* render the output of commands that return markdown, like help, in an xterm decoration.

* shell tabs should accepot input from send commands. Observed error:
> send aslan ls -al
Tab "aslan" does not accept input.

* shell tabs should be able to accept commands into the queue via the queue command.
> queue dogan ls
Tab "dogan" has no command queue.