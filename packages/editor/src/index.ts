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

interface CreateCodeMirrorOptions {
  parent: HTMLElement;
  doc?: string;
  onChange?: (doc: string) => void;
  onRun?: (doc: string) => void;
}

const startState = ({ doc, onChange, onRun }: CreateCodeMirrorOptions) =>
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
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
      }),
      keymap.of([
        {
          key: "Alt-Enter",
          run(view) {
            onRun?.(view.state.doc.toString());
            return true;
          },
        },
        { key: "Mod-Shift-Enter", run: insertLineAbove },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
    ],
  });

function createCodeMirror(options: CreateCodeMirrorOptions) {
  return new EditorView({ state: startState(options), parent: options.parent });
}

export { createCodeMirror };
export type { CreateCodeMirrorOptions };
