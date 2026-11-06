# issues

## ready

* the `image <filename>` command should open an image in image tab. all edit actions currently supported in the image tab should be executable via subcommands to the image command. for example: `image rotate left <filename>` should rotate the image to the left and save it. 

* the `video snapshot <video path> at <time> <destination path>` command should create a snapshot of the video at the given timestamp.

* update the auto-approve algorithm for claude to be sure the prompts in $root/captures/issues-2026-11-06T17-08-48-534Z.txt and $root/captures/issues-2026-11-06T17-15-08-078Z.txt
are automatically approved.

* in a shell tab, when asking or telling an agent to do something, the command should be entered into the transcript
`> <command and params> Thinking <spinner>`
where clicking on the thinking or spinner will open the relevant connection tab to show the thinking of the agent in teh acp connection. once an answer is generated, the thinking and spinner should be removed and replaced with `[see thought process]` similarly linked to the connection.

* in the shell tab, implement transcript search using the editor seach dialog and user interactions. trigger it with the command `search transcript <pattern>` or cmd+f.


## development

## deferred

## declined
