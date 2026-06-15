# @web-audio/editor

A CodeMirror-based code editor package for the web-audio REPL.

## Usage

```ts
import { createCodeMirror } from "@web-audio/editor";

const view = createCodeMirror(
  document.getElementById("editor")!,
  "initial content",
);
```

`createCodeMirror(parent: HTMLElement, doc?: string): EditorView`
