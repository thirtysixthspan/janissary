export type DeleteKeyAnswer = 'confirm' | 'cancel' | 'choose' | 'toggle';

const ANSWERS = new Map<string, DeleteKeyAnswer>([
  ['y', 'confirm'],
  ['n', 'cancel'],
  ['escape', 'cancel'],
  ['enter', 'choose'],
  ['arrowleft', 'toggle'],
  ['arrowright', 'toggle'],
]);

export function deleteKeyAnswer(key: string): DeleteKeyAnswer | null {
  return ANSWERS.get(key.toLowerCase()) ?? null;
}
