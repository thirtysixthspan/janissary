<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* remove `harness play` and `ssh play` and instead create a `play` command that decides what to play based on the file given. For this feature the `play` command with a file with the extension `.cast` should trigger the asciicast tab. rename the replay tab the asciicast tab updating all code and documentation references.

* agent tabs should be recorded via a ascii cast as well as ssh and harness tabs.

* if the play command does not find the file with the given filename, search the .janissary/recordings folder. 

* `play` with a video file should trigger the `video` command and `play` with an audio file should trigger the `audio` command. these file type behaviors must be registered to the play command by their respective plugins. this is similar in function to the open command. 

* providing a .cast file to the `open` command should open the asciicast tab.

