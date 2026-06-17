# @web-audio/editor

A CodeMirror-based code editor package for the web-audio REPL.

## Usage

```ts
import { createCodeMirror } from "@web-audio/editor";

const view = createCodeMirror({
  parent: document.getElementById("editor")!,
  doc: "initial content",
  onChange(doc) {
    console.log(doc);
  },
  // Alt/Option+Enter inside the editor calls this callback.
  onRun(doc) {
    console.log("run", doc);
  },
  // Alt/Option+/ inside the editor calls this callback.
  onStop() {
    console.log("stop");
  },
});

view.destroy();
```

`createCodeMirror(options): EditorView`
