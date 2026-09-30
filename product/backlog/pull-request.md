<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the column select icon needs to be changed so as not to be redundant with the split icon

* the statements run selector and popup should be removed and replaced with the UI used for hist functionality in the agent tab. the command bar should be used for entering sequal commands and should show `SQL >` instead of just `>`. 

* the rendering of the data table must not overflow into the command bar but rather be scrollable

* there should be a single metadata row across the tab like in a harness tab. it should contain the database drop down, a similar tables drop down (reloaded when the database is choosen), the add row button, the columns button, the export buttons and the split button. remove the stats, sql and copy buttons and the backing functionality entirely.

* SQL query errors should create notifications, and not print in the command bar.
