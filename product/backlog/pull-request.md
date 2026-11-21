<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* the acp preamble should not be sent with every query, only once when the connection is established as context. The preamble should be rendered in the acp connection as a separate preable section, similar to how the final reply is rendered separately.

* the model may issue a reply before all queries have a response, and then follow up afterward when subsequent information comes in from other queries. the additional replies should also be rendered. by accepting multiple queries and answering async, the model may also make multiple async responses, not a single final response.


 


