import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";

export const insertLineAbove: Command = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    return {
      changes: { from: line.from, insert: "\n" },
      range: EditorSelection.cursor(line.from),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
