import test from "node:test";
import assert from "node:assert/strict";
import { sheetWindow, sheetPosition, sheetColumns, minimumBarWidth } from "../src/notation/sheet.js";

test("indefinite repetition keeps six complete rows with two rows of history", () => {
    for (const columns of [1, 2, 3]) for (const bar of [0, 1, 3, 12, 199, 100000]) {
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


test("score rows fit up to three bars without forcing dense patterns to shrink", () => {
    const bar = slots => ({ voices: [{ notes: Array.from({ length: slots }, (_, index) => ({ writtenTick: index * 12 })) }] });
    const simple = [bar(8)], dense = [bar(24)];
    assert.equal(sheetColumns(1320, simple), 3);
    assert.equal(sheetColumns(800, simple), 2);
    assert.equal(sheetColumns(320, simple), 1);
    assert.equal(sheetColumns(1320, dense), 2);
    assert.equal(sheetColumns(800, dense), 1);
    assert.ok(minimumBarWidth(dense[0]) > minimumBarWidth(simple[0]));
    assert.equal(sheetWindow(1000, 3).end - sheetWindow(1000, 3).start, 18);
});
