<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* remove all aspects of idle handling.

* do not scale the playback or fonts. the replay should be at the original size. anything outside of the tab viewport should be overflow hidden - no scrollbars in the tab. it is up to the user to appropriately resize the window to see the entire playback if it is too big.

* scrubbing the timeline works to change the playback positions, but playing the recording does not advance the playback, only the timeline.
 