import test from "node:test";
import assert from "node:assert/strict";
import { sheetWindow, sheetPosition } from "../src/notation/sheet.js";

test("indefinite repetition keeps six complete rows with two rows of history", () => {
    for (const columns of [1, 2]) for (const bar of [0, 1, 3, 12, 199, 100000]) {
        const { start, end } = sheetWindow(bar, columns);
        assert.equal(start % columns, 0);
        assert.equal(end - start, columns * 6);
        assert.ok(start <= bar && bar < end);
        assert.equal(Math.floor(bar / columns) - start / columns, Math.min(2, Math.floor(bar / columns)));
    }
    for (const bar of [-1, 0.5, Infinity]) assert.throws(() => sheetWindow(bar, 2), RangeError);
});

test("row progress is continuous across bars and loop boundaries", () => {
    assert.deepEqual(sheetPosition(3, 2, 2, 192), { barIndex: 1, iteration: 1, rowProgress: 0.75 });
    assert.equal(sheetPosition(0, 2, 2, 384).rowProgress, sheetPosition(1, 2, 2, 0).rowProgress);
    assert.deepEqual(sheetPosition(200, 2, 2, 0), { barIndex: 0, iteration: 100, rowProgress: 0 });
});
