import { expect, test } from "bun:test";
import { isReplay } from "@stream-fetcher/huya/internal";

test("isReplay matches startsWith markers", () => {
  expect(isReplay("回放精彩时刻", { startsWith: ["回放"], endsWith: [] })).toBe(true);
});

test("isReplay matches endsWith markers", () => {
  expect(isReplay("精彩时刻回放", { startsWith: [], endsWith: ["回放"] })).toBe(true);
});

test("isReplay returns false when no markers match", () => {
  expect(isReplay("直播精彩时刻", { startsWith: ["回放"], endsWith: ["回放"] })).toBe(false);
});

test("isReplay handles empty markers", () => {
  expect(isReplay("任何标题", { startsWith: [], endsWith: [] })).toBe(false);
});
