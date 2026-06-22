## application halting
the quit command should halt the aplication
typing control-c should not halt the application

## scrolling
mouse scroll wheel to scroll back the tab trascript not the command history

## append only log
all text in the tabs will be logged.
The log will be append only.
the log format should be json.
each log entry should contain:
  a utc timestamp
  the tab name
  a text field of content from the client tab
store the log in .janussary/log/date.json where the date formation is year-month-day
assure the append only log changes logs on subsequent days.
add test coverage of this feature.
update the product spec and the readme.

## profiles
a profile is designed for a particular use case, writing code, surfing the web, authoring a book, and specific task.
a profile is named - dasherized text.
a profile must specify named agents to be launched.
a profile may contain instructions for agents to follow.

## janissary config
the application configuration is maintained in the .janussary/config.json file
this config file should be loaded on application launch
tab transcript length should be set in this file and set to 25000 lines by default
a default config will be created on launch if it doesn't already exist.

## playwright browsing



 │  > list the actors in the movies database                                                   █
 │  I'll list the databases first to see what's available.                                     █
                                                                                               █
     │  + db sqlite list                                                                       █
     │  movies                                                                                 █
     │  test                                                                                   █
                                                                                               █
     │  + db sqlite query movies "SELECT name FROM sqlite_master WHERE type='table';           █
     │  ------                                                                                 █
     │  actors                                                                                 █    
