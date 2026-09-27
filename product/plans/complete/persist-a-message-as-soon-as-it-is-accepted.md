# Persist a message as soon as it is accepted

`start` in `src/visualizations/agent.ts` pushed the turn onto the record and called only `changed()`. The turn first reached the disk through the source read's commit or the reply's — both of which a tab closed mid-reply skips. `releaseClosed` then cleared the streaming flag in memory, committed nothing, and dropped the record from the index. So closing a tab while the agent was still working deleted the user's own message, permanently, and the plan's promise that "the record and its turns survive, so reopening resumes" was not kept.

Two commits, one per half of the lifecycle:

- `start` commits the record once the turn has been pushed and before the call goes out. The store's `isTurn` already accepts a turn that is still streaming, and that acceptance is what makes this safe — it is the same thing the payload finding in this backlog fixed on the client side.
- `VisualizationsManager.cancel` commits after clearing the flag, so the cleared state reaches the disk rather than only the memory. Without it the record would reopen on a turn that claims to still be streaming, with nothing left to finish it.

`cancel` also stops dropping the turn. It filtered `record.turns` down to the non-streaming ones, which removed the question as well as the flag; stopping a reply is not the same as never having asked it, and what the user typed is the one part of this the agent cannot recover. The turn now stays with whatever answer had arrived, and an answer that never came shows as an answer that never came.

The spec gains a sentence under **Asking** saying the message is saved the moment it is sent, that Escape and closing the tab both keep it, and that a missing answer is shown as missing.

`src/visualizations/manager.test.ts` gains the end-to-end case: send a source, answer the first reply, send a second message, close the tab before its reply lands, reopen from a fresh manager and a fresh store, and assert the question is still in the exchange with no turn left claiming to be streaming. Three existing cases in `src/visualizations/agent.test.ts` asserted on `commits[0]`, which is now the accept-time write rather than the outcome; the two that care about an outcome read the last commit instead, and the abandoned-call case now expects one commit — the accept — and no second.
