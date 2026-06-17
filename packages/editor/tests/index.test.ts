import { EditorState } from "@codemirror/state";
import { expect, test } from "vitest";

import { createCodeMirror } from "../src/index";
import { insertLineAbove } from "../src/utils";

test("exports createCodeMirror", () => {
  expect(createCodeMirror).toBeTypeOf("function");
});

test("insertLineAbove inserts a blank line above the active line", () => {
  const state = EditorState.create({ doc: "one\ntwo" });
  let nextState = state;

  const handled = insertLineAbove({
    state,
    dispatch(transaction) {
      nextState = transaction.state;
    },
  });

  expect(handled).toBe(true);
  expect(nextState.doc.toString()).toBe("\none\ntwo");
});
