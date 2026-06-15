import { EditorView } from "@codemirror/view";

export const theme = EditorView.theme(
  {
    "&": {
      color: "var(--cm-editor-color-foreground, inherit)",
      background: "var(--cm-editor-color-background, none)",
      fontSize: "var(--cm-editor-font-size, 14px)",
      height: "var(--cm-editor-block-size, auto)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-content": {
      fontFamily: "var(--cm-editor-font-family, monospace)",
      caretColor: "transparent",
    },
    "&.cm-focused .cm-cursor": {
      borderLeft:
        "var(--cm-cursor-width, 1.5px) solid var(--cm-cursor-color, white)",
    },
    "&.cm-focused .cm-selectionBackground, &.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection":
      {
        backgroundColor:
          "var(--cm-selection-color-background, rgb(255 255 255 / 0.2))",
      },
    ".cm-gutters": {
      background: "none",
      color: "var(--cm-gutter-color-foreground, inherit)",
      fontFamily: "var(--cm-editor-font-family, monospace)",
      fontSize: "var(--cm-gutter-font-size, 14px)",
      userSelect: "none",
      borderInlineEnd:
        "var(--cm-gutter-border-width, 1px) solid var(--cm-gutter-border-color, rgb(255 255 255 / 0.25))",
    },
    "& .cm-lineNumbers .cm-gutterElement": {
      paddingInline: "0.75rem 0.625rem",
      minWidth: "calc(1.375rem + 2ch)",
    },
    ".cm-line": {
      backgroundColor: "var(--cm-line-color-background, transparent)",
      inlineSize: "var(--cm-line-inline-size, auto)",
    },
    ".cm-activeLine": {
      backgroundColor:
        "var(--cm-active-line-blurred-color-background, transparent)",
    },
    "&.cm-focused .cm-activeLine": {
      backgroundColor:
        "var(--cm-active-line-color-background, rgb(255 255 255 / 0.1))",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLineGutter": {
      backgroundColor:
        "var(--cm-active-gutter-color-background, rgb(255 255 255 / 0.1))",
    },
    "& .cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--cm-matching-bracket-color-background, blue)",
    },
  },
  { dark: true },
);
