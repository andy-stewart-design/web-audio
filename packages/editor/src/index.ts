import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";

import { theme } from "./theme";
import { insertLineAbove } from "./utils";

const DEFAULT_DOC =
  "// JavaScript support without colors\nfunction init() {\n  const message = 'Hello World';\n  console.log(message);\n}";

const startState = (doc?: string) =>
  EditorState.create({
    doc: doc ?? DEFAULT_DOC,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      javascript(),
      theme,
      EditorState.allowMultipleSelections.of(true),
      EditorView.clickAddsSelectionRange.of((event) => event.altKey),
      keymap.of([
        { key: "Mod-Shift-Enter", run: insertLineAbove },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
    ],
  });

function createCodeMirror(parent: HTMLElement, doc?: string) {
  return new EditorView({ state: startState(doc), parent });
}

export { createCodeMirror };
