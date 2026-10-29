# Profiles

<img class="agent-float" src="/agents/demir-south.png" alt="" />

A profile is a named runscript that sets up a working session for a recurring job, such as a couple of harnesses, an editor, and a docked file tree. You recreate it with a single command:

```
profile launch writing-code
profile list
```

`profile launch <name>` runs the profile's commands one after another, the way [`execute`](/user-documentation/automation/scheduling#run-a-runscript-now) runs a runscript. `profile list` prints the names of the profiles you have, one per line, in the transcript of the tab you typed it in. Your project's profiles come first, then the built-in ones, and each group is sorted alphabetically. With none to show, it prints `No profiles.` A name that doesn't exist gets `No profile named "<name>".`

A mistyped command prints its usage line instead. `profile` on its own, or with a subcommand other than `launch` or `list`, prints `Usage: profile launch <name> | profile list`. Only the first word after `launch` is the name, so anything after it is ignored.

![The tab strip after profile launch demo: the two editor tabs its runscript opened, beside the launch shell.](/screenshots/profile-group.png)

## Picking a profile to launch

Bare `profile launch`, with no name, opens a picker with a **Project** section followed by a **Janissary** section for the profiles bundled with the app. Each section lists its profiles alphabetically. A built-in profile you've overridden appears only under **Project**, and a section with nothing in it is left out. With no profiles at all, the picker shows `(no profiles)`. `↑`/`↓` move the selection and skip the section labels. `Enter` or a click fills the command line with `profile launch <name>` without submitting it, so you can review or edit it first. `Escape` closes the picker without picking anything.

Opened from a shell's command bar, the selection replaces that shell's draft, including when the shell is docked. If the shell closes while the picker is open, selection does not put the command into another tab. Opened from a harness, selection sends the command directly to that harness.

The list is read from disk about once a second, so a profile file you have just added can take a second to appear. If the list changes while the picker is already open, whether because another tab added a profile or a `git checkout` moved one, the highlight is put back onto a real profile rather than left on a section label or past the end of a shorter list. It keeps its position rather than the profile it was on, so it can end up somewhere else in the list. A key you press before that correction has been applied only puts the highlight back rather than launching anything, so `Enter` never launches a profile that was not showing as selected. `Escape` closes the picker at any point.

The bundled ones are `debugging`, `default`, `features`, `planning`, and `product-review`. Launch any of them by name without setting anything up, and read one as a worked example of the format below. `profile list` shows them alongside your own.

## Writing a profile

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

Your profiles live in the `profiles/` directory in your project: plain files meant to be committed and shared. Janissary doesn't create that directory for you, so add it yourself the first time. It sits outside the `.janissary/` state folder, and Janissary never clears it when it starts, so your profiles are still there on the next launch. Each profile is a runscript named after the profile, like `writing-code.rs`. Janissary also includes built-in profiles. If both sources use the same name, your project copy wins, so you can customize a built-in profile by adding a same-named file to your own `profiles/` directory.

A runscript holds one command per line, and Janissary skips blank lines and lines that start with `#`. A line is anything you could type into a command bar: a Janissary command such as `harness`, `edit`, `files`, or `layout`, or a shell command.

```
# A harness, the backlog in an editor, and a tree docked on the left.
harness claude as builder in group 1
edit $root/product/backlog/features.md
files on left $root
notifications right
layout sidebar left 270
tab focus builder
```

The lines run in the project's managed system shell, in order, and each command finishes before the next one starts. Nothing is printed when the profile starts. A line's output goes to the system shell rather than the tab you launched from, and a failing line doesn't stop the lines after it.

Only `.rs` files are profiles. Any other file in `profiles/` is ignored, so it never shows up in `profile list` or the picker. The same goes for folders, and for a `.rs` file that is really a symlink. Launching a symlinked profile by name still finds it, and it still takes the place of a built-in profile with that name, but Janissary refuses to read it and reports `Could not read runscript for profile "<name>".` rather than falling back to the built-in copy.

## Launching a profile again

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

Launching a profile runs its commands again against whatever is already open. It doesn't close the tabs the last launch opened. A `harness … as <name>` line whose name is still in use is refused, with its `Cannot launch "<name>": …` line in the [notifications](/user-documentation/tab-types/notifications) feed, and the rest of the profile keeps going. Close the old tabs first when you want fresh ones.

If the system shell can't start, nothing from the profile runs, and the [notifications](/user-documentation/tab-types/notifications) feed gets `System shell could not start: <reason>.`

A profile can launch other profiles, itself included. Nothing checks for a loop, so a profile with the line `profile launch <its own name>` keeps queuing itself again.

A runscript that can't be read safely, such as a symlink, reports `Could not read runscript for profile "<name>".`. If a launch fails partway, the tab you launched it from gets `Profile command failed: <reason>.` so the command does not appear unfinished.

## A worked example

Here's a morning code-review setup in `profiles/morning-review.rs`:

```
harness claude as reviewer with review the newest open PR and summarize the risky changes
schedule refresh in reviewer every 2h check for newly opened PRs
```

`profile launch morning-review` opens `reviewer` in a fresh [workspace clone](/user-documentation/advanced-agents/workspacing), isolated from the rest of your machine. It types the prompt into the harness once it's up, then nudges it every two hours through its schedule, which shows in the [schedule window](/user-documentation/automation/scheduling) floating over the harness. Close the tab when you're done. Tomorrow, one command rebuilds it all.
