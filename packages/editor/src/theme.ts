import { EditorView } from "@codemirror/view";

export const theme = EditorView.theme(
  {
    "&": {
      color: "var(--cm-editor-color-foreground)",
      background: "var(--cm-editor-color-background)",
      fontSize: "var(--cm-editor-font-size)",
      height: "var(--cm-editor-block-size)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      overscrollBehavior: "contain",
      scrollbarWidth: "thin",
      scrollbarColor: "var(--cm-scrollbar-color) transparent",
    },
    ".cm-content": {
      fontFamily: "var(--cm-editor-font-family)",
      caretColor: "transparent",
    },
    "&.cm-focused .cm-cursor": {
      borderLeft: "var(--cm-cursor-width) solid var(--cm-cursor-color)",
    },
    "&.cm-focused .cm-selectionBackground, &.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection":
      {
        backgroundColor: "var(--cm-selection-color-background)",
      },
    ".cm-gutters": {
      background: "var(--cm-gutter-color-background)",
      color: "var(--cm-gutter-color-foreground)",
      fontFamily: "var(--cm-editor-font-family)",
      fontSize: "var(--cm-gutter-font-size)",
      userSelect: "none",
      borderInlineEnd:
        "var(--cm-gutter-border-width) solid var(--cm-gutter-border-color)",
    },
    "& .cm-lineNumbers .cm-gutterElement": {
      paddingInline: "0.75rem 0.625rem",
      minWidth: "calc(1.375rem + 2ch)",
    },
    ".cm-line": {
      backgroundColor: "var(--cm-line-color-background)",
      inlineSize: "var(--cm-line-inline-size)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--cm-active-line-blurred-color-background)",
    },
    "&.cm-focused .cm-activeLine": {
      backgroundColor: "var(--cm-active-line-color-background)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLineGutter": {
      backgroundColor: "var(--cm-active-gutter-color-background)",
    },
    "& .cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--cm-matching-bracket-color-background)",
    },
  },
  { dark: true },
);
