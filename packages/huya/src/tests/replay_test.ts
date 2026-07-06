import { assertEquals } from "@std/assert";
import { isReplay } from "@stream-fetcher/huya/internal";

Deno.test("isReplay matches startsWith markers", () => {
  assertEquals(
    isReplay("回放精彩时刻", { startsWith: ["回放"], endsWith: [] }),
    true,
  );
});

Deno.test("isReplay matches endsWith markers", () => {
  assertEquals(
    isReplay("精彩时刻回放", { startsWith: [], endsWith: ["回放"] }),
    true,
  );
});

Deno.test("isReplay returns false when no markers match", () => {
  assertEquals(
    isReplay("直播精彩时刻", { startsWith: ["回放"], endsWith: ["回放"] }),
    false,
  );
});

Deno.test("isReplay handles empty markers", () => {
  assertEquals(isReplay("任何标题", { startsWith: [], endsWith: [] }), false);
});
