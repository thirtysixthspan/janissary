
## embedded ai harness
create a new command called harness.
called: harness harnessname 
where harnessname is [claude, opencode, codex] 
calling the harness should take over the tab and allow the harness to render within the tab.
tab switching should still be supported
upon closing the harness, the cli in the terminal should be restored


## tasks on images 
zoom

## page command
add a new command `page`
calling page with a url `page www.website.com` or `page protocol://www.website.com` should open that page in a new page tab.
a page tab should act like an image tab but include an iframe with the url as a source
the page tab should be assigned a number.
the label on the tab will be the page number and the root domain for example `1) website.com` 
page 
the command `close page #` will close the page
 

## improvements

separate slow automated tests into a slow test suite only run at the end of feature development as a verification

