// A tiny task tracker, here to give the editor screenshot some syntax to highlight.
export type Task = {
  id: number;
  title: string;
  done: boolean;
};

const tasks: Task[] = [
  { id: 1, title: 'Chart the north pier', done: true },
  { id: 2, title: 'Count the gulls', done: false },
  { id: 3, title: 'Explain the third bell', done: false },
];

export function complete(id: number): Task | undefined {
  const task = tasks.find((candidate) => candidate.id === id);
  if (task) {
    task.done = true;
  }
  return task;
}

export function remaining(): string {
  const open = tasks.filter((candidate) => !candidate.done);
  return `${open.length} task(s) remaining`;
}
