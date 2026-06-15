import { expect, test } from "vitest";

import { createCodeMirror } from "../src/index";

test("exports createCodeMirror", () => {
  expect(createCodeMirror).toBeTypeOf("function");
});
